import {
	type AgentPresenceState,
	type ProcessRule,
	presenceConfig,
	resolvePresenceContent,
} from "../../src/config/presenceConfig";
import type { WindowsActivity } from "./windows";

export interface PresencePayload {
	state: AgentPresenceState;
	title: string;
	app?: string;
	detail?: string;
}

const processRules: readonly ProcessRule[] = presenceConfig.processRules;

export function resolvePresence(
	processName: string,
	isIdle: boolean,
): PresencePayload {
	if (isIdle) {
		return resolvePresenceContent(presenceConfig.behavior.idleState);
	}

	const normalizedProcess = processName.trim().toLowerCase();
	const rule = processRules.find(
		(candidate) => candidate.process.toLowerCase() === normalizedProcess,
	);
	const state = rule?.state ?? presenceConfig.behavior.fallbackState;
	return resolvePresenceContent(state, rule);
}

export function getPresenceForActivity(
	activity: WindowsActivity,
	idleTimeout: number,
): PresencePayload {
	return resolvePresence(activity.processName, activity.idleMs >= idleTimeout);
}
