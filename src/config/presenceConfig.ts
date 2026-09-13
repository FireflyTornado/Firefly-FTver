import type {
	PresenceBehavior,
	PresenceProcessRule,
	PresenceStateConfig,
	PresenceUiConfig,
} from "../types/presenceConfig";

export type {
	PresenceAvailability,
	PresenceStateConfig,
	PresenceUiConfig,
} from "../types/presenceConfig";

/**
 * Presence 小组件配置
 *
 * 这里统一管理网页显示的状态内容，以及 Windows Agent 的进程映射规则。
 * 新增普通状态时，通常只需在 states 中添加状态，再按需增加 processRules。
 * Agent 的 API 地址、检测间隔和 Idle 时长仍由 scripts/presence-agent/config.ts 管理。
 */
export const presenceConfig = {
	// ── 全局显示 (UI) ───────────────────────────────────────
	ui: {
		// true：状态配置了 illustration 时优先显示图片，否则自动回退 icon。
		// false：忽略所有 illustration，始终使用当前 emoji icon。
		useIllustration: false,
	},

	// ── 状态显示 (States) ───────────────────────────────────
	// icon：左侧图标；title/app/detail：正文默认内容；status：底部状态文本。
	// availability：圆点样式，online 会呼吸，idle/offline 不呼吸。
	// illustration：可选的 public 路径，例如 "/assets/presence/coding.webp"。
	// accent 为未来强调色预留，目前 UI 不会读取。
	states: {
		// 普通在线状态，也作为未识别程序的默认回退状态。
		online: {
			icon: "🟢",
			title: "在线中",
			detail: "正在使用电脑",
			status: "Online",
			availability: "online",
		},
		// 编程状态；具体编辑器名称可由下方进程规则覆盖。
		coding: {
			icon: "💻",
			title: "正在写代码",
			app: "Visual Studio Code",
			detail: "专注工作中",
			status: "Online",
			availability: "online",
		},
		// 游戏状态；不同启动器可以共用此状态并分别覆盖 app。
		gaming: {
			icon: "🎮",
			title: "正在玩游戏",
			app: "Minecraft",
			detail: "游戏时间",
			status: "Online",
			availability: "online",
		},
		// 音乐状态；第一版只按播放器进程判断，不读取歌曲信息。
		music: {
			icon: "🎵",
			title: "正在听音乐",
			app: "Spotify",
			detail: "正在播放音乐",
			status: "Online",
			availability: "online",
		},
		// 超过 Agent Idle 阈值且没有键盘或鼠标输入时使用。
		idle: {
			icon: "☕",
			title: "暂时离开",
			detail: "稍后回来",
			status: "Idle",
			availability: "idle",
		},
		// 前端超过 90 秒没有收到 heartbeat 后使用；Agent 不主动上报此状态。
		offline: {
			icon: "🌙",
			title: "当前离线",
			detail: "下次见",
			status: "Offline",
			availability: "offline",
		},
	},

	// ── Windows 进程映射 (Process rules) ───────────────────
	// process 只填写可执行文件名，不要填写窗口标题或完整路径。
	// 匹配为忽略大小写的精确匹配；title/app/detail 可覆盖状态默认值。
	// 多个规则可以指向同一 state，例如让不同编辑器共用 coding 状态。
	processRules: [
		{
			process: "Code.exe",
			state: "coding",
			app: "Visual Studio Code",
		},
		{
			process: "MinecraftLauncher.exe",
			state: "gaming",
			app: "Minecraft",
		},
		{
			process: "Spotify.exe",
			state: "music",
			app: "Spotify",
		},
		{
			process: "javaw.exe",
			state: "online",
		},
	],

	// ── 状态选择行为 (Behavior) ────────────────────────────
	behavior: {
		// 当前台进程没有匹配任何 processRule 时使用。
		fallbackState: "online",
		// Windows LastInputInfo 超过 Idle 阈值时优先使用。
		idleState: "idle",
		// updatedAt 超过前端离线阈值时使用；Agent 不会上报此状态。
		offlineState: "offline",
		// 首次渲染和 DEV Preview mock 数据使用的默认状态。
		previewState: "coding",
	},
} as const;

// ── 派生类型与读取工具 (通常无需修改) ─────────────────────
// 状态类型、API 合法状态列表和默认内容均从上方配置自动生成，
// 日常新增状态或调整映射时不需要手动维护以下代码。
export type PresenceState = keyof typeof presenceConfig.states;
export type AgentPresenceState = Exclude<
	PresenceState,
	typeof presenceConfig.behavior.offlineState
>;

export interface PresenceContent<TState extends PresenceState = PresenceState> {
	state: TState;
	title: string;
	app?: string;
	detail?: string;
}

export interface PresenceContentOverrides {
	title?: string;
	app?: string;
	detail?: string;
}

export type ProcessRule = PresenceProcessRule<AgentPresenceState>;

type PresenceConfigShape = {
	ui: PresenceUiConfig;
	states: Record<PresenceState, PresenceStateConfig> & {
		offline: PresenceStateConfig;
	};
	processRules: readonly ProcessRule[];
	behavior: PresenceBehavior<AgentPresenceState>;
};

function validatePresenceConfig(config: PresenceConfigShape): void {
	void config;
}

validatePresenceConfig(presenceConfig);

export const PRESENCE_STATES = Object.keys(
	presenceConfig.states,
) as PresenceState[];

export function getPresenceStateConfig(
	state: PresenceState,
): PresenceStateConfig {
	return presenceConfig.states[state];
}

export function resolvePresenceContent<TState extends PresenceState>(
	state: TState,
	overrides: PresenceContentOverrides = {},
): PresenceContent<TState> {
	const defaults = getPresenceStateConfig(state);
	return {
		state,
		title: overrides.title ?? defaults.title,
		app: overrides.app ?? defaults.app,
		detail: overrides.detail ?? defaults.detail,
	};
}
