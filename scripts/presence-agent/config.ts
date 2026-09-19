import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { presenceConfig } from "../../src/config/presenceConfig";
import { getRuntimeDirectory } from "./runtime-directory";
import { readStoredToken } from "./token-store";

const agentDefaults = presenceConfig.agent;

export type ConfigSource = "environment" | "config" | "default";
export type TokenSource = "environment" | "token.dat" | "none";

export interface RuntimeAgentConfig {
	apiUrl: string;
	detectInterval: number;
	heartbeatInterval: number;
	idleTimeout: number;
	token?: string;
	sources: {
		apiUrl: ConfigSource;
		detectInterval: ConfigSource;
		heartbeatInterval: ConfigSource;
		idleTimeout: ConfigSource;
		token: TokenSource;
	};
	runtimeDirectory: string;
	configPath: string;
	tokenPath: string;
}

interface FileConfig {
	apiUrl?: unknown;
	detectInterval?: unknown;
	heartbeatInterval?: unknown;
	idleTimeout?: unknown;
}

interface ResolvedValue<T> {
	value: T;
	source: ConfigSource;
}

interface LoadRuntimeConfigOptions {
	loadToken?: boolean;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidApiUrl(value: unknown): value is string {
	if (typeof value !== "string" || value.trim() === "") return false;
	try {
		const url = new URL(value.trim());
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

function isPositiveNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function defaultFileConfig(): Required<FileConfig> {
	return {
		apiUrl: agentDefaults.apiUrl,
		detectInterval: agentDefaults.detectInterval,
		heartbeatInterval: agentDefaults.heartbeatInterval,
		idleTimeout: agentDefaults.idleTimeout,
	};
}

async function readFileConfig(
	configPath: string,
	runtimeDirectory: string,
): Promise<FileConfig | undefined> {
	let contents: string;
	try {
		contents = await readFile(configPath, "utf8");
	} catch (error) {
		if (!isNodeError(error) || error.code !== "ENOENT") {
			console.warn(
				"[Presence Agent] Unable to read config.json, using fallback values.",
			);
			return undefined;
		}

		const generatedConfig = defaultFileConfig();
		try {
			await writeFile(
				configPath,
				`${JSON.stringify(generatedConfig, null, 2)}\n`,
				{ encoding: "utf8", flag: "wx" },
			);
			console.log("[Presence Agent] Created config.json");
			return generatedConfig;
		} catch (writeError) {
			if (isNodeError(writeError) && writeError.code === "EEXIST") {
				return readFileConfig(configPath, runtimeDirectory);
			}
			console.warn(
				`[Presence Agent] Runtime directory is not writable: ${runtimeDirectory}`,
			);
			return undefined;
		}
	}

	try {
		const parsed: unknown = JSON.parse(contents);
		if (!isRecord(parsed)) {
			console.warn(
				"[Presence Agent] Invalid config.json, using fallback values.",
			);
			return undefined;
		}
		return parsed;
	} catch {
		console.warn(
			"[Presence Agent] Invalid config.json, using fallback values.",
		);
		return undefined;
	}
}

function resolveApiUrl(
	fileConfig: FileConfig | undefined,
): ResolvedValue<string> {
	const environmentValue = process.env.PRESENCE_API_URL;
	if (environmentValue !== undefined && environmentValue.trim() !== "") {
		if (isValidApiUrl(environmentValue)) {
			return { value: environmentValue.trim(), source: "environment" };
		}
		console.warn(
			"[Presence Agent] Invalid PRESENCE_API_URL, using config/default fallback.",
		);
	}

	if (fileConfig?.apiUrl !== undefined) {
		if (isValidApiUrl(fileConfig.apiUrl)) {
			return { value: fileConfig.apiUrl.trim(), source: "config" };
		}
		console.warn(
			'[Presence Agent] Invalid config.json field "apiUrl", using default value.',
		);
	}

	return { value: agentDefaults.apiUrl, source: "default" };
}

function resolvePositiveNumber(
	environmentName: string,
	fileField: keyof Pick<
		FileConfig,
		"detectInterval" | "heartbeatInterval" | "idleTimeout"
	>,
	fileConfig: FileConfig | undefined,
	fallback: number,
): ResolvedValue<number> {
	const environmentValue = process.env[environmentName];
	if (environmentValue !== undefined && environmentValue.trim() !== "") {
		const value = Number(environmentValue);
		if (Number.isFinite(value) && value > 0) {
			return { value, source: "environment" };
		}
		console.warn(
			`[Presence Agent] Invalid ${environmentName}, using config/default fallback.`,
		);
	}

	const fileValue = fileConfig?.[fileField];
	if (fileValue !== undefined) {
		if (isPositiveNumber(fileValue)) {
			return { value: fileValue, source: "config" };
		}
		console.warn(
			`[Presence Agent] Invalid config.json field "${fileField}", using default value.`,
		);
	}

	return { value: fallback, source: "default" };
}

async function resolveToken(
	tokenPath: string,
	loadToken: boolean,
): Promise<{ token?: string; source: TokenSource }> {
	if (!loadToken) return { source: "none" };

	const environmentValue = process.env.PRESENCE_TOKEN;
	if (environmentValue !== undefined && environmentValue.trim() !== "") {
		return { token: environmentValue.trim(), source: "environment" };
	}

	const storedToken = await readStoredToken(tokenPath);
	if (storedToken) return { token: storedToken, source: "token.dat" };
	return { source: "none" };
}

export function formatConfigSource(source: ConfigSource | TokenSource): string {
	if (source === "config") return "config.json";
	return source;
}

export async function loadRuntimeConfig(
	options: LoadRuntimeConfigOptions = {},
): Promise<RuntimeAgentConfig> {
	const runtimeDirectory = getRuntimeDirectory();
	const configPath = join(runtimeDirectory, "config.json");
	const tokenPath = join(runtimeDirectory, "token.dat");
	const fileConfig = await readFileConfig(configPath, runtimeDirectory);

	const apiUrl = resolveApiUrl(fileConfig);
	const detectInterval = resolvePositiveNumber(
		"PRESENCE_DETECT_INTERVAL",
		"detectInterval",
		fileConfig,
		agentDefaults.detectInterval,
	);
	const heartbeatInterval = resolvePositiveNumber(
		"PRESENCE_HEARTBEAT_INTERVAL",
		"heartbeatInterval",
		fileConfig,
		agentDefaults.heartbeatInterval,
	);
	const idleTimeout = resolvePositiveNumber(
		"PRESENCE_IDLE_TIMEOUT",
		"idleTimeout",
		fileConfig,
		agentDefaults.idleTimeout,
	);
	const token = await resolveToken(tokenPath, options.loadToken ?? true);

	return {
		apiUrl: apiUrl.value,
		detectInterval: detectInterval.value,
		heartbeatInterval: heartbeatInterval.value,
		idleTimeout: idleTimeout.value,
		token: token.token,
		sources: {
			apiUrl: apiUrl.source,
			detectInterval: detectInterval.source,
			heartbeatInterval: heartbeatInterval.source,
			idleTimeout: idleTimeout.source,
			token: token.source,
		},
		runtimeDirectory,
		configPath,
		tokenPath,
	};
}
