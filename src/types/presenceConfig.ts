/** 状态圆点及呼吸动画使用的通用可用性样式。 */
export type PresenceAvailability = "online" | "idle" | "offline";

/** Presence 小组件的全局显示选项。 */
export interface PresenceUiConfig {
	useIllustration: boolean;
}

/** 单个 Presence 状态的默认展示内容。 */
export interface PresenceStateConfig {
	icon: string;
	title: string;
	app?: string;
	detail?: string;
	status: string;
	availability: PresenceAvailability;
	illustration?: string;
	accent?: string;
}

/** Windows 前台进程与 Presence 状态之间的映射规则。 */
export interface PresenceProcessRule<TState extends string> {
	process: string;
	state: TState;
	title?: string;
	app?: string;
	detail?: string;
}

/** Presence 的回退、离开、离线和开发预览行为。 */
export type PresenceBehavior<TState extends string> = {
	fallbackState: TState;
	idleState: TState;
	offlineState: "offline";
	previewState: TState;
};
