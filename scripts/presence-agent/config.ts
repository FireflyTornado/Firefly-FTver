import { presenceConfig } from "../../src/config/presenceConfig";

const agentDefaults = presenceConfig.agent;

function readPositiveNumber(name: string, fallback: number): number {
	const rawValue = process.env[name];
	if (rawValue === undefined || rawValue.trim() === "") return fallback;

	const value = Number(rawValue);
	if (Number.isFinite(value) && value > 0) return value;

	console.warn(`[Presence] Invalid ${name}, using default ${fallback}ms`);
	return fallback;
}

function readApiUrl(): string {
	const rawValue = process.env.PRESENCE_API_URL;
	if (rawValue === undefined || rawValue.trim() === "") {
		return agentDefaults.apiUrl;
	}

	const value = rawValue.trim();
	try {
		const url = new URL(value);
		if (value && (url.protocol === "http:" || url.protocol === "https:")) {
			return value;
		}
	} catch {
		// Fall through to the default URL warning.
	}

	console.warn(
		`[Presence] Invalid PRESENCE_API_URL, using default ${agentDefaults.apiUrl}`,
	);
	return agentDefaults.apiUrl;
}

export const API_URL: string = readApiUrl();
// 本地开发 API 不要求认证，因此 token 允许未设置或留空。
// 生产环境通过 PRESENCE_TOKEN 注入；源码中绝不提供真实默认值。
export const TOKEN: string = process.env.PRESENCE_TOKEN?.trim() ?? "";
export const DETECT_INTERVAL: number = readPositiveNumber(
	"PRESENCE_DETECT_INTERVAL",
	agentDefaults.detectInterval,
);
export const HEARTBEAT_INTERVAL: number = readPositiveNumber(
	"PRESENCE_HEARTBEAT_INTERVAL",
	agentDefaults.heartbeatInterval,
);
export const IDLE_TIMEOUT: number = readPositiveNumber(
	"PRESENCE_IDLE_TIMEOUT",
	agentDefaults.idleTimeout,
);
