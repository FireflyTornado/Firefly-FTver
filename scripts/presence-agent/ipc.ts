import { createServer, type Server, type Socket } from "node:net";

export const PRESENCE_PIPE_PATH = "\\\\.\\pipe\\NightbugPresence";

export type WorkerCommand =
	| { type: "pause" }
	| { type: "resume" }
	| { type: "sync-now" }
	| { type: "shutdown" }
	| { type: "get-status" }
	| { type: "get-config-summary"; requestId?: string };

export type WorkerEvent =
	| { type: "status-changed"; title: string }
	| { type: "current-state"; title: string }
	| { type: "sync-success"; at: string }
	| { type: "sync-failed" }
	| { type: "last-sync"; at: string | null }
	| { type: "paused" }
	| { type: "resumed" }
	| {
			type: "config-summary";
			requestId?: string;
			config: {
				apiUrl: string;
				detectInterval: number;
				heartbeatInterval: number;
				idleTimeout: number;
				tokenConfigured: boolean;
			};
	  };

const validCommandTypes = new Set([
	"pause",
	"resume",
	"sync-now",
	"shutdown",
	"get-status",
	"get-config-summary",
]);

export class WorkerPipeServer {
	private readonly clients = new Set<Socket>();
	private server: Server | undefined;

	constructor(
		private readonly onCommand: (
			command: WorkerCommand,
			client: Socket,
		) => void,
	) {}

	async start(): Promise<"started" | "already-running"> {
		const server = createServer((client) => this.accept(client));
		this.server = server;
		return new Promise((resolvePromise, rejectPromise) => {
			const onError = (error: NodeJS.ErrnoException) => {
				server.off("listening", onListening);
				if (error.code === "EADDRINUSE" || error.code === "EACCES") {
					resolvePromise("already-running");
					return;
				}
				rejectPromise(error);
			};
			const onListening = () => {
				server.off("error", onError);
				server.on("error", () => {
					// Existing clients remain useful; shutdown will close the server.
				});
				resolvePromise("started");
			};
			server.once("error", onError);
			server.once("listening", onListening);
			server.listen(PRESENCE_PIPE_PATH);
		});
	}

	send(client: Socket, event: WorkerEvent): void {
		if (!client.destroyed) client.write(`${JSON.stringify(event)}\n`);
	}

	broadcast(event: WorkerEvent): void {
		for (const client of this.clients) this.send(client, event);
	}

	stop(): void {
		for (const client of this.clients) client.destroy();
		this.clients.clear();
		this.server?.close();
		this.server = undefined;
	}

	private accept(client: Socket): void {
		this.clients.add(client);
		client.setEncoding("utf8");
		let buffered = "";
		client.on("data", (chunk: string) => {
			buffered += chunk;
			if (buffered.length > 65_536) {
				client.destroy();
				return;
			}
			const lines = buffered.split(/\r?\n/);
			buffered = lines.pop() ?? "";
			for (const line of lines) this.handleLine(line, client);
		});
		client.on("close", () => this.clients.delete(client));
		client.on("error", () => this.clients.delete(client));
		this.onCommand({ type: "get-status" }, client);
	}

	private handleLine(line: string, client: Socket): void {
		try {
			const value = JSON.parse(line) as Partial<WorkerCommand>;
			if (typeof value.type !== "string" || !validCommandTypes.has(value.type))
				return;
			this.onCommand(value as WorkerCommand, client);
		} catch {
			// Ignore malformed local messages without terminating the worker.
		}
	}
}
