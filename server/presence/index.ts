import { pathToFileURL } from "node:url";
import Fastify, {
	type FastifyError,
	type FastifyInstance,
	type FastifyReply,
} from "fastify";
import { isAuthorized } from "./auth";
import { loadConfig, type PresenceServerConfig } from "./config";
import { PresenceStore } from "./store";
import { parsePresenceUpdate } from "./validation";

const BODY_LIMIT = 16 * 1024;
const GET_PATHS = ["/api/presence", "/api/presence/"] as const;
const UPDATE_PATHS = ["/api/presence/update", "/api/presence/update/"] as const;

function sendJson(reply: FastifyReply, statusCode: number, payload: unknown) {
	return reply
		.code(statusCode)
		.header("Cache-Control", "no-store")
		.type("application/json; charset=utf-8")
		.send(payload);
}

export async function buildPresenceServer(
	config: PresenceServerConfig,
): Promise<FastifyInstance> {
	const store = new PresenceStore(config.stateFile);
	await store.initialize();
	const server = Fastify({ bodyLimit: BODY_LIMIT, logger: false });

	for (const path of GET_PATHS) {
		server.get(path, (_request, reply) =>
			sendJson(reply, 200, store.getPresence()),
		);
	}

	for (const path of UPDATE_PATHS) {
		server.post(path, async (request, reply) => {
			if (!isAuthorized(request.headers.authorization, config.token)) {
				return sendJson(reply, 401, { error: "Unauthorized" });
			}
			const update = parsePresenceUpdate(request.body);
			if (!update)
				return sendJson(reply, 400, { error: "Invalid presence payload" });

			try {
				const result = await store.updatePresence(update);
				if (result.stateChanged)
					console.log(
						`[Presence] State: ${result.previousState} -> ${result.presence.state}`,
					);
				return sendJson(reply, 200, result.presence);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "unknown error";
				console.error(`[Presence] Failed to persist state: ${message}`);
				return sendJson(reply, 500, { error: "Internal server error" });
			}
		});
	}

	server.setErrorHandler((error: FastifyError, _request, reply) => {
		if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE")
			return sendJson(reply, 413, { error: "Payload too large" });
		if (
			error.code === "FST_ERR_CTP_INVALID_JSON_BODY" ||
			error.code === "FST_ERR_CTP_EMPTY_JSON_BODY" ||
			error.statusCode === 400
		) {
			return sendJson(reply, 400, { error: "Invalid presence payload" });
		}
		console.error(`[Presence] Unhandled request error: ${error.message}`);
		return sendJson(reply, 500, { error: "Internal server error" });
	});
	return server;
}

async function start(): Promise<void> {
	const config = loadConfig();
	const server = await buildPresenceServer(config);
	let shuttingDown = false;
	const shutdown = async (signal: NodeJS.Signals) => {
		if (shuttingDown) return;
		shuttingDown = true;
		console.log(`[Presence] ${signal} received; shutting down`);
		try {
			await server.close();
			process.exitCode = 0;
		} catch (error) {
			const message = error instanceof Error ? error.message : "unknown error";
			console.error(`[Presence] Failed to shut down cleanly: ${message}`);
			process.exitCode = 1;
		}
	};
	process.once("SIGTERM", () => void shutdown("SIGTERM"));
	process.once("SIGINT", () => void shutdown("SIGINT"));
	await server.listen({ host: config.host, port: config.port });
	console.log(`[Presence] Server listening on ${config.host}:${config.port}`);
	console.log(`[Presence] State file: ${config.stateFile}`);
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
	start().catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		process.exitCode = 1;
	});
}
