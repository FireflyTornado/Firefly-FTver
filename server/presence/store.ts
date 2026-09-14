import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { PresenceData, PresenceUpdate } from "./types";
import { parseStoredPresence } from "./validation";

const DEFAULT_PRESENCE: PresenceData = {
	state: "offline",
	title: "当前离线",
	detail: "下次见",
	updatedAt: 0,
};

export interface PresenceUpdateResult {
	presence: PresenceData;
	previousState: PresenceData["state"];
	stateChanged: boolean;
}

export class PresenceStore {
	private current: PresenceData = { ...DEFAULT_PRESENCE };
	private updateQueue: Promise<void> = Promise.resolve();

	constructor(private readonly stateFile: string) {}

	async initialize(): Promise<void> {
		await mkdir(dirname(this.stateFile), { recursive: true });
		try {
			const raw = await readFile(this.stateFile, "utf8");
			const stored = parseStoredPresence(JSON.parse(raw));
			if (!stored) throw new Error("invalid state shape");
			this.current = stored;
			return;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "ENOENT")
				console.warn("[Presence] State file is invalid; using offline default");
		}

		this.current = { ...DEFAULT_PRESENCE };
		await this.persist(this.current);
	}

	getPresence(): PresenceData {
		return { ...this.current };
	}

	updatePresence(update: PresenceUpdate): Promise<PresenceUpdateResult> {
		const operation = this.updateQueue.then(async () => {
			const now = Date.now();
			const previousState = this.current.state;
			const stateChanged = update.state !== previousState;
			const next: PresenceData = {
				state: update.state,
				title: update.title,
				app: update.app,
				detail: update.detail,
				since: stateChanged ? (update.since ?? now) : this.current.since,
				updatedAt: now,
			};
			await this.persist(next);
			this.current = next;
			return { presence: { ...next }, previousState, stateChanged };
		});
		this.updateQueue = operation.then(
			() => undefined,
			() => undefined,
		);
		return operation;
	}

	private async persist(presence: PresenceData): Promise<void> {
		const directory = dirname(this.stateFile);
		const temporaryFile = join(
			directory,
			`.${basename(this.stateFile)}.${process.pid}.${Date.now()}.tmp`,
		);
		let handle: Awaited<ReturnType<typeof open>> | undefined;
		try {
			handle = await open(temporaryFile, "w", 0o600);
			await handle.writeFile(`${JSON.stringify(presence)}\n`, "utf8");
			await handle.sync();
			await handle.close();
			handle = undefined;
			await rename(temporaryFile, this.stateFile);
			if (process.platform !== "win32") {
				const directoryHandle = await open(directory, "r");
				try {
					await directoryHandle.sync();
				} finally {
					await directoryHandle.close();
				}
			}
		} catch (error) {
			await handle?.close().catch(() => undefined);
			await unlink(temporaryFile).catch(() => undefined);
			throw error;
		}
	}
}
