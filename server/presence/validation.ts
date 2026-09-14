import type { PresenceState } from "../../src/config/presenceConfig";
import type { PresenceData, PresenceUpdate } from "./types";

const STATE_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_STATE_LENGTH = 64;
const MAX_TITLE_LENGTH = 128;
const MAX_APP_LENGTH = 128;
const MAX_DETAIL_LENGTH = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeState(value: unknown): PresenceState | undefined {
	if (typeof value !== "string") return undefined;
	const state = value.trim();
	if (
		state.length === 0 ||
		state.length > MAX_STATE_LENGTH ||
		!STATE_PATTERN.test(state)
	)
		return undefined;
	// 编译期类型来自 presenceConfig；运行时保持通用，以便服务接受未来新增的安全状态 key。
	return state as PresenceState;
}

function normalizeRequiredString(
	value: unknown,
	maxLength: number,
): string | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim();
	return normalized.length > 0 && normalized.length <= maxLength
		? normalized
		: undefined;
}

function normalizeOptionalString(
	value: unknown,
	maxLength: number,
): string | undefined | null {
	if (value === undefined) return undefined;
	if (typeof value !== "string") return null;
	const normalized = value.trim();
	return normalized.length <= maxLength ? normalized : null;
}

function normalizeTimestamp(value: unknown): number | undefined | null {
	if (value === undefined) return undefined;
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: null;
}

export function parsePresenceUpdate(value: unknown): PresenceUpdate | null {
	if (!isRecord(value)) return null;
	const state = normalizeState(value.state);
	const title = normalizeRequiredString(value.title, MAX_TITLE_LENGTH);
	const app = normalizeOptionalString(value.app, MAX_APP_LENGTH);
	const detail = normalizeOptionalString(value.detail, MAX_DETAIL_LENGTH);
	const since = normalizeTimestamp(value.since);
	if (!state || !title || app === null || detail === null || since === null)
		return null;
	return { state, title, app, detail, since };
}

export function parseStoredPresence(value: unknown): PresenceData | null {
	if (!isRecord(value)) return null;
	const update = parsePresenceUpdate(value);
	const updatedAt = normalizeTimestamp(value.updatedAt);
	if (!update || updatedAt === undefined || updatedAt === null) return null;
	return { ...update, updatedAt };
}
