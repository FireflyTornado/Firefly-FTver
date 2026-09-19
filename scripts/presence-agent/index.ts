import type { Socket } from "node:net";
import { getPresenceForActivity, type PresencePayload } from "./activity";
import { getAgentCommand, runAgentCommand } from "./commands";
import {
	formatConfigSource,
	loadRuntimeConfig,
	type RuntimeAgentConfig,
} from "./config";
import { type WorkerCommand, type WorkerEvent, WorkerPipeServer } from "./ipc";
import { getWindowsActivity } from "./windows";

const ERROR_LOG_INTERVAL = 60_000;
const shutdownController = new AbortController();

let currentPresence: PresencePayload | undefined;
let pendingReport: PresencePayload | undefined;
let detectTimer: NodeJS.Timeout | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;
let reporting = false;
let detecting = false;
let stopping = false;
let paused = false;
let apiUnavailable = false;
let lastApiWarningAt = 0;
let lastDetectionWarningAt = 0;
let lastSuccessfulSyncAt: number | undefined;
let runtimeConfig: RuntimeAgentConfig;
let pipeServer: WorkerPipeServer | undefined;

type ApiFailure =
	| { kind: "authentication"; status: 401 | 403 }
	| { kind: "http"; status: number }
	| { kind: "network" };

function emit(event: WorkerEvent): void {
	pipeServer?.broadcast(event);
}

function presenceSignature(presence: PresencePayload): string {
	return JSON.stringify(presence);
}

function logPresence(presence: PresencePayload): void {
	const app = presence.app ? ` · ${presence.app}` : "";
	console.log(`[Presence] ${presence.state}${app}`);
}

async function postPresence(presence: PresencePayload): Promise<void> {
	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json; charset=utf-8",
		};
		if (runtimeConfig.token)
			headers.Authorization = `Bearer ${runtimeConfig.token}`;
		const response = await fetch(runtimeConfig.apiUrl, {
			method: "POST",
			headers,
			body: JSON.stringify(presence),
			signal: AbortSignal.any([
				shutdownController.signal,
				AbortSignal.timeout(10_000),
			]),
		});
		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				logApiFailure({ kind: "authentication", status: response.status });
			} else {
				logApiFailure({ kind: "http", status: response.status });
			}
			emit({ type: "sync-failed" });
			return;
		}
		if (apiUnavailable) console.log("[Presence] API connection restored");
		apiUnavailable = false;
		lastSuccessfulSyncAt = Date.now();
		emit({
			type: "sync-success",
			at: new Date(lastSuccessfulSyncAt).toISOString(),
		});
	} catch {
		if (stopping) return;
		logApiFailure({ kind: "network" });
		emit({ type: "sync-failed" });
	}
}

function logApiFailure(failure: ApiFailure): void {
	const now = Date.now();
	if (!apiUnavailable || now - lastApiWarningAt >= ERROR_LOG_INTERVAL) {
		if (failure.kind === "authentication") {
			console.warn(
				`[Presence Agent] Authentication failed (HTTP ${failure.status}). Check PRESENCE_TOKEN.`,
			);
		} else if (failure.kind === "http") {
			console.warn(
				`[Presence] API returned HTTP ${failure.status}, will retry`,
			);
		} else {
			console.warn("[Presence] API unavailable, will retry");
		}
		lastApiWarningAt = now;
	}
	apiUnavailable = true;
}

async function flushReports(): Promise<void> {
	if (reporting) return;
	while (pendingReport && !stopping && !paused) {
		reporting = true;
		const presence = pendingReport;
		pendingReport = undefined;
		await postPresence(presence);
	}
	reporting = false;
}

function resetHeartbeatTimer(): void {
	if (heartbeatTimer) clearInterval(heartbeatTimer);
	heartbeatTimer = setInterval(() => {
		if (currentPresence) queueReport(currentPresence, false);
	}, runtimeConfig.heartbeatInterval);
}

function queueReport(presence: PresencePayload, resetHeartbeat: boolean): void {
	if (resetHeartbeat) resetHeartbeatTimer();
	if (paused) return;
	pendingReport = presence;
	void flushReports();
}

function sendStatus(client: Socket): void {
	pipeServer?.send(client, {
		type: "current-state",
		title: currentPresence?.title ?? "正在检测",
	});
	pipeServer?.send(client, {
		type: "last-sync",
		at: lastSuccessfulSyncAt
			? new Date(lastSuccessfulSyncAt).toISOString()
			: null,
	});
	pipeServer?.send(client, { type: paused ? "paused" : "resumed" });
}

function handleWorkerCommand(command: WorkerCommand, client: Socket): void {
	if (command.type === "get-status") {
		sendStatus(client);
		return;
	}
	if (command.type === "get-config-summary") {
		pipeServer?.send(client, {
			type: "config-summary",
			requestId: command.requestId,
			config: {
				apiUrl: runtimeConfig.apiUrl,
				detectInterval: runtimeConfig.detectInterval,
				heartbeatInterval: runtimeConfig.heartbeatInterval,
				idleTimeout: runtimeConfig.idleTimeout,
				tokenConfigured: Boolean(runtimeConfig.token),
			},
		});
		return;
	}
	if (command.type === "pause") {
		paused = true;
		pendingReport = undefined;
		emit({ type: "paused" });
		return;
	}
	if (command.type === "resume") {
		paused = false;
		emit({ type: "resumed" });
		if (currentPresence) queueReport(currentPresence, true);
		return;
	}
	if (command.type === "sync-now") {
		if (!paused && currentPresence) queueReport(currentPresence, false);
		return;
	}
	void stopAgent();
}

async function detectActivity(): Promise<void> {
	if (detecting || stopping) return;
	detecting = true;
	try {
		const activity = await getWindowsActivity(shutdownController.signal);
		const nextPresence = getPresenceForActivity(
			activity,
			runtimeConfig.idleTimeout,
		);
		const changed =
			!currentPresence ||
			presenceSignature(nextPresence) !== presenceSignature(currentPresence);
		if (changed) {
			currentPresence = nextPresence;
			logPresence(nextPresence);
			queueReport(nextPresence, true);
			emit({ type: "status-changed", title: nextPresence.title });
		}
	} catch {
		if (stopping) return;
		const now = Date.now();
		if (now - lastDetectionWarningAt >= ERROR_LOG_INTERVAL) {
			console.warn(
				"[Presence] Windows activity detection unavailable, will retry",
			);
			lastDetectionWarningAt = now;
		}
	} finally {
		detecting = false;
	}
}

async function stopAgent(): Promise<void> {
	if (stopping) return;
	stopping = true;
	if (detectTimer) clearInterval(detectTimer);
	if (heartbeatTimer) clearInterval(heartbeatTimer);
	pendingReport = undefined;
	shutdownController.abort();
	pipeServer?.stop();
	pipeServer = undefined;
	console.log("[Presence] Agent stopped");
	process.exitCode = 0;
}

async function startAgent(config: RuntimeAgentConfig): Promise<void> {
	if (process.platform !== "win32") {
		console.error("[Presence] This prototype currently supports Windows only");
		process.exitCode = 1;
		return;
	}
	runtimeConfig = config;
	pipeServer = new WorkerPipeServer(handleWorkerCommand);
	if ((await pipeServer.start()) === "already-running") {
		console.log("[Presence Agent] Already running.");
		pipeServer = undefined;
		return;
	}
	console.log("[Presence] Agent started");
	console.log(
		`[Presence] API: ${config.apiUrl} [${formatConfigSource(config.sources.apiUrl)}]`,
	);
	console.log(
		`[Presence] Token: ${config.token ? "configured" : "not configured"} [${formatConfigSource(config.sources.token)}]`,
	);
	console.log(
		`[Presence] Detect: ${config.detectInterval}ms [${formatConfigSource(config.sources.detectInterval)}] · Heartbeat: ${config.heartbeatInterval}ms [${formatConfigSource(config.sources.heartbeatInterval)}] · Idle: ${config.idleTimeout}ms [${formatConfigSource(config.sources.idleTimeout)}]`,
	);
	await detectActivity();
	if (!stopping)
		detectTimer = setInterval(
			() => void detectActivity(),
			config.detectInterval,
		);
}

async function main(): Promise<void> {
	const arguments_ = process.argv.slice(2);
	const command = getAgentCommand(arguments_);
	const config = await loadRuntimeConfig({
		loadToken: !command || command === "show-config",
	});
	if (command) {
		await runAgentCommand(command, config);
		return;
	}
	process.once("SIGINT", () => void stopAgent());
	process.once("SIGTERM", () => void stopAgent());
	await startAgent(config);
}

void main().catch((error: unknown) => {
	const detail = error instanceof Error ? ` ${error.message}` : "";
	console.error(`[Presence Agent] Unable to start.${detail}`);
	process.exitCode = 1;
});
