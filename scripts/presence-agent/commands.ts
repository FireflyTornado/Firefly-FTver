import {
	disableAutostart,
	enableAutostart,
	isAutostartEnabled,
} from "./autostart";
import type { RuntimeAgentConfig } from "./config";
import { formatConfigSource } from "./config";
import {
	clearStoredToken,
	saveStoredToken,
	TokenWriteError,
} from "./token-store";

export type AgentCommand =
	| "set-token"
	| "clear-token"
	| "show-config"
	| "enable-autostart"
	| "disable-autostart"
	| "autostart-status";

export function getAgentCommand(
	arguments_: string[],
): AgentCommand | undefined {
	if (arguments_.includes("--set-token")) return "set-token";
	if (arguments_.includes("--clear-token")) return "clear-token";
	if (arguments_.includes("--show-config")) return "show-config";
	if (arguments_.includes("--enable-autostart")) return "enable-autostart";
	if (arguments_.includes("--disable-autostart")) return "disable-autostart";
	if (arguments_.includes("--autostart-status")) return "autostart-status";
	return undefined;
}

async function readSecretInput(): Promise<string | undefined> {
	process.stdout.write("Enter Presence token: ");

	if (!process.stdin.isTTY || !process.stdin.setRawMode) {
		let value = "";
		process.stdin.setEncoding("utf8");
		for await (const chunk of process.stdin) value += chunk;
		return value.trim() || undefined;
	}

	return new Promise((resolvePromise) => {
		let value = "";
		const finish = (result?: string) => {
			process.stdin.off("data", onData);
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stdout.write("\n");
			resolvePromise(result);
		};
		const onData = (chunk: Buffer | string) => {
			for (const character of chunk.toString()) {
				if (character === "\u0003") {
					finish();
					return;
				}
				if (character === "\r" || character === "\n") {
					finish(value.trim() || undefined);
					return;
				}
				if (character === "\b" || character === "\u007f") {
					value = value.slice(0, -1);
					continue;
				}
				value += character;
			}
		};

		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.on("data", onData);
	});
}

function showConfig(config: RuntimeAgentConfig): void {
	console.log(
		`API URL: ${config.apiUrl} (${formatConfigSource(config.sources.apiUrl)})`,
	);
	console.log(
		`Detect interval: ${config.detectInterval} ms (${formatConfigSource(config.sources.detectInterval)})`,
	);
	console.log(
		`Heartbeat interval: ${config.heartbeatInterval} ms (${formatConfigSource(config.sources.heartbeatInterval)})`,
	);
	console.log(
		`Idle timeout: ${config.idleTimeout} ms (${formatConfigSource(config.sources.idleTimeout)})`,
	);
	console.log(
		`Token: ${config.token ? "configured" : "not configured"} (${formatConfigSource(config.sources.token)})`,
	);
}

export async function runAgentCommand(
	command: AgentCommand,
	config: RuntimeAgentConfig,
): Promise<void> {
	if (command === "show-config") {
		showConfig(config);
		return;
	}

	if (command === "autostart-status") {
		console.log((await isAutostartEnabled()) ? "enabled" : "disabled");
		return;
	}

	if (command === "enable-autostart") {
		try {
			await enableAutostart();
			console.log("[Presence Agent] Autostart enabled.");
		} catch {
			console.error(
				"[Presence Agent] Unable to enable autostart. Run this command from NightbugPresence.exe.",
			);
			process.exitCode = 1;
		}
		return;
	}

	if (command === "disable-autostart") {
		try {
			await disableAutostart();
			console.log("[Presence Agent] Autostart disabled.");
		} catch {
			console.error(
				"[Presence Agent] Unable to disable autostart. Run this command from NightbugPresence.exe.",
			);
			process.exitCode = 1;
		}
		return;
	}

	if (command === "clear-token") {
		try {
			await clearStoredToken(config.tokenPath);
			console.log("[Presence Agent] Token cleared.");
		} catch {
			console.error(
				`[Presence Agent] Runtime directory is not writable: ${config.runtimeDirectory}`,
			);
			process.exitCode = 1;
		}
		return;
	}

	const token = await readSecretInput();
	if (!token) {
		console.log("[Presence Agent] Token save cancelled.");
		return;
	}

	try {
		await saveStoredToken(config.tokenPath, token);
		console.log("[Presence Agent] Token saved securely.");
	} catch (error) {
		if (error instanceof TokenWriteError) {
			console.error(
				`[Presence Agent] Runtime directory is not writable: ${config.runtimeDirectory}`,
			);
		} else {
			console.error(
				"[Presence Agent] Unable to protect token with Windows DPAPI.",
			);
		}
		process.exitCode = 1;
	}
}
