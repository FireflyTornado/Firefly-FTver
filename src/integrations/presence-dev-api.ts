import type { IncomingMessage, ServerResponse } from "node:http";
import type { AstroIntegration } from "astro";
import { PRESENCE_STATES, type PresenceState } from "../config/presenceConfig";
import {
	getPresence,
	type PresenceUpdate,
	updatePresence,
} from "../utils/presence-store";

const PRESENCE_PATHS = new Set(["/api/presence", "/api/presence/"]);
const UPDATE_PATHS = new Set(["/api/presence/update", "/api/presence/update/"]);

function sendJson(
	response: ServerResponse,
	status: number,
	payload: unknown,
): void {
	response.statusCode = status;
	response.setHeader("Content-Type", "application/json; charset=utf-8");
	response.setHeader("Cache-Control", "no-store");
	response.end(JSON.stringify(payload));
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let body = "";
		request.setEncoding("utf8");
		request.on("data", (chunk: string) => {
			body += chunk;
		});
		request.on("end", () => {
			try {
				resolve(JSON.parse(body));
			} catch (error) {
				reject(error);
			}
		});
		request.on("error", reject);
	});
}

function isPresenceState(value: unknown): value is PresenceState {
	return PRESENCE_STATES.some((state) => state === value);
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string";
}

function isValidPayload(value: unknown): value is PresenceUpdate {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;

	const payload = value as Record<string, unknown>;
	return (
		isPresenceState(payload.state) &&
		typeof payload.title === "string" &&
		payload.title.trim().length > 0 &&
		isOptionalString(payload.app) &&
		isOptionalString(payload.detail) &&
		(payload.since === undefined ||
			(typeof payload.since === "number" &&
				Number.isFinite(payload.since) &&
				payload.since >= 0))
	);
}

export default function presenceDevApi(): AstroIntegration {
	return {
		name: "presence-dev-api",
		hooks: {
			"astro:server:setup": ({ server }) => {
				server.middlewares.use(async (request, response, next) => {
					const pathname = new URL(request.url ?? "/", "http://localhost")
						.pathname;

					if (request.method === "GET" && PRESENCE_PATHS.has(pathname)) {
						sendJson(response, 200, getPresence());
						return;
					}

					if (request.method !== "POST" || !UPDATE_PATHS.has(pathname)) {
						next();
						return;
					}

					// TODO: production version must require Authorization: Bearer <secret>
					let payload: unknown;
					try {
						payload = await readJsonBody(request);
					} catch {
						sendJson(response, 400, { error: "Invalid presence payload" });
						return;
					}

					if (!isValidPayload(payload)) {
						sendJson(response, 400, { error: "Invalid presence payload" });
						return;
					}

					const presence = updatePresence({
						state: payload.state,
						title: payload.title.trim(),
						app: payload.app,
						detail: payload.detail,
						since: payload.since,
					});
					sendJson(response, 200, presence);
				});
			},
		},
	};
}
