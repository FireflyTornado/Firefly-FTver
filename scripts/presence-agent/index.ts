import { getPresenceForActivity, type PresencePayload } from "./activity";
import {
	API_URL,
	DETECT_INTERVAL,
	HEARTBEAT_INTERVAL,
	IDLE_TIMEOUT,
	TOKEN,
} from "./config";
import { getWindowsActivity } from "./windows";

const ERROR_LOG_INTERVAL = 60_000;

let currentPresence: PresencePayload | undefined;
let pendingReport: PresencePayload | undefined;
let detectTimer: NodeJS.Timeout | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;
let reporting = false;
let detecting = false;
let stopping = false;
let apiUnavailable = false;
let lastApiWarningAt = 0;
let lastDetectionWarningAt = 0;

type ApiFailure =
	| { kind: "authentication"; status: 401 | 403 }
	| { kind: "http"; status: number }
	| { kind: "network" };

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
		if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

		const response = await fetch(API_URL, {
			method: "POST",
			headers,
			body: JSON.stringify(presence),
			signal: AbortSignal.timeout(10_000),
		});

		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				logApiFailure({ kind: "authentication", status: response.status });
			} else {
				logApiFailure({ kind: "http", status: response.status });
			}
			return;
		}

		if (apiUnavailable) {
			console.log("[Presence] API connection restored");
		}
		apiUnavailable = false;
	} catch {
		logApiFailure({ kind: "network" });
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
	while (pendingReport && !stopping) {
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
	}, HEARTBEAT_INTERVAL);
}

function queueReport(presence: PresencePayload, resetHeartbeat: boolean): void {
	pendingReport = presence;
	if (resetHeartbeat) resetHeartbeatTimer();
	void flushReports();
}

async function detectActivity(): Promise<void> {
	if (detecting || stopping) return;
	detecting = true;

	try {
		const activity = await getWindowsActivity();
		const nextPresence = getPresenceForActivity(activity, IDLE_TIMEOUT);
		const changed =
			!currentPresence ||
			presenceSignature(nextPresence) !== presenceSignature(currentPresence);

		if (changed) {
			currentPresence = nextPresence;
			logPresence(nextPresence);
			queueReport(nextPresence, true);
		}
	} catch {
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

function stopAgent(): void {
	if (stopping) return;
	stopping = true;
	if (detectTimer) clearInterval(detectTimer);
	if (heartbeatTimer) clearInterval(heartbeatTimer);
	console.log("[Presence] Agent stopped");
	process.exit(0);
}

async function startAgent(): Promise<void> {
	if (process.platform !== "win32") {
		console.error("[Presence] This prototype currently supports Windows only");
		process.exitCode = 1;
		return;
	}

	console.log("[Presence] Agent started");
	console.log(`[Presence] API: ${API_URL}`);
	console.log(`[Presence] Token: ${TOKEN ? "configured" : "not configured"}`);
	console.log(
		`[Presence] Detect: ${DETECT_INTERVAL}ms · Heartbeat: ${HEARTBEAT_INTERVAL}ms · Idle: ${IDLE_TIMEOUT}ms`,
	);
	await detectActivity();
	detectTimer = setInterval(() => void detectActivity(), DETECT_INTERVAL);
}

process.once("SIGINT", stopAgent);
process.once("SIGTERM", stopAgent);

void startAgent();
