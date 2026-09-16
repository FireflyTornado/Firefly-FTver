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

/** 单个 Windows 前台程序及其可选展示内容覆盖。 */
export interface PresenceProcess {
	process: string;
	title?: string;
	app?: string;
	detail?: string;
}

/** 一种 Presence 状态与多个 Windows 前台程序之间的映射规则。 */
export interface PresenceProcessRule<TState extends string> {
	state: TState;
	processes: readonly PresenceProcess[];
}

/** Windows Agent 的默认运行参数；环境变量可以覆盖这些值。 */
export interface PresenceAgentConfig {
	apiUrl: string;
	detectInterval: number;
	heartbeatInterval: number;
	idleTimeout: number;
}

/** Presence 前端的数据轮询与本地离线判定参数。 */
export interface PresenceFrontendConfig {
	pollInterval: number;
	offlineTimeout: number;
	displayRefreshInterval: number;
}

/** Presence 的回退、离开、离线和开发预览行为。 */
export type PresenceBehavior<TState extends string> = {
	fallbackState: TState;
	idleState: TState;
	offlineState: "offline";
	previewState: TState;
};
