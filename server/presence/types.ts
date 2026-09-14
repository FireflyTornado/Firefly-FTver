import type { PresenceState } from "../../src/config/presenceConfig";

/** API 对外返回并持久化的完整 Presence 状态。 */
export interface PresenceData {
	state: PresenceState;
	title: string;
	app?: string;
	detail?: string;
	since?: number;
	updatedAt: number;
}

/** 客户端可提交的字段；updatedAt 始终由服务端生成。 */
export interface PresenceUpdate {
	state: PresenceState;
	title: string;
	app?: string;
	detail?: string;
	since?: number;
}
