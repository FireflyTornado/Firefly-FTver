import {
	type PresenceState,
	presenceConfig,
	resolvePresenceContent,
} from "../config/presenceConfig";

export type { PresenceState } from "../config/presenceConfig";

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

const initialPresence = resolvePresenceContent(
	presenceConfig.behavior.previewState,
);

let currentPresence: PresenceData = {
	...initialPresence,
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
