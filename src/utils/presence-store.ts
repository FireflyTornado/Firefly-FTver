export const PRESENCE_STATES = [
	"online",
	"coding",
	"gaming",
	"music",
	"idle",
	"offline",
] as const;

export type PresenceState = (typeof PRESENCE_STATES)[number];

export interface PresenceData {
	state: PresenceState;
	title: string;
	app?: string;
	detail?: string;
	since?: number;
	updatedAt: number;
}

export interface PresenceUpdate {
	state: PresenceState;
	title: string;
	app?: string;
	detail?: string;
	since?: number;
}

let currentPresence: PresenceData = {
	state: "coding",
	title: "正在写代码",
	app: "Visual Studio Code",
	detail: "正在维护博客",
	since: Date.now() - 25 * 60 * 1000,
	updatedAt: Date.now(),
};

export function getPresence(): PresenceData {
	return { ...currentPresence };
}

export function updatePresence(update: PresenceUpdate): PresenceData {
	const now = Date.now();
	const stateChanged = update.state !== currentPresence.state;

	currentPresence = {
		state: update.state,
		title: update.title,
		app: update.app,
		detail: update.detail,
		since: stateChanged ? (update.since ?? now) : currentPresence.since,
		updatedAt: now,
	};

	return getPresence();
}
