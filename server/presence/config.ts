import { resolve } from "node:path";

export interface PresenceServerConfig {
	token: string;
	host: string;
	port: number;
	stateFile: string;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8765;
const DEFAULT_STATE_FILE = "/var/lib/nightbug-presence/presence.json";

export function loadConfig(
	environment: NodeJS.ProcessEnv = process.env,
): PresenceServerConfig {
	const token = environment.PRESENCE_TOKEN;
	if (typeof token !== "string" || token.trim().length === 0) {
		throw new Error("[Presence] PRESENCE_TOKEN is required");
	}

	const host = environment.PRESENCE_HOST?.trim() || DEFAULT_HOST;
	const rawPort = environment.PRESENCE_PORT?.trim();
	const port =
		rawPort === undefined || rawPort === "" ? DEFAULT_PORT : Number(rawPort);
	if (!Number.isInteger(port) || port < 1 || port > 65_535) {
		throw new Error(
			"[Presence] PRESENCE_PORT must be an integer from 1 to 65535",
		);
	}

	const configuredStateFile = environment.PRESENCE_STATE_FILE?.trim();
	const stateFile = resolve(configuredStateFile || DEFAULT_STATE_FILE);

	return { token, host, port, stateFile };
}
