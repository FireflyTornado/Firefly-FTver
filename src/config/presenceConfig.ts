import type {
	PresenceAgentConfig,
	PresenceBehavior,
	PresenceFrontendConfig,
	PresenceProcessRule,
	PresenceStateConfig,
	PresenceUiConfig,
} from "../types/presenceConfig";

export type {
	PresenceAgentConfig,
	PresenceAvailability,
	PresenceFrontendConfig,
	PresenceProcess,
	PresenceStateConfig,
	PresenceUiConfig,
} from "../types/presenceConfig";

/**
 * Presence 小组件配置
 *
 * 这里统一管理网页状态内容、Windows Agent 默认参数、进程映射和前端计时参数。
 * 新增普通状态时，通常只需在 states 中添加状态，再按需增加 processRules。
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
			title: "在线",
			detail: "正在电脑前",
			status: "Online",
			availability: "online",
		},
		// 编程状态；具体编辑器名称可由下方进程规则覆盖。
		coding: {
			icon: "💻",
			title: "正在写代码",
			app: "Visual Studio Code",
			detail: "工作中",
			status: "Online",
			availability: "online",
		},
		// 游戏状态；不同启动器可以共用此状态并分别覆盖 app。
		gaming: {
			icon: "🎮",
			title: "正在玩游戏",
			app: "",
			detail: "娱乐时间",
			status: "Online",
			availability: "online",
		},
		// 音乐状态；第一版只按播放器进程判断，不读取歌曲信息。
		music: {
			icon: "🎵",
			title: "正在听音乐",
			app: "Spotify",
			detail: "放松一下",
			status: "Online",
			availability: "online",
		},
		// 浏览器。
		surfing: {
			icon: "🌏",
			title: "正在冲浪",
			app: "Microsoft Edge",
			detail: "可能在看“任何东西”",
			status: "Online",
			availability: "online",
		},
		//聊天
		chating: {
			icon: "💬",
			title: "正在聊天",
			app: "QQ",
			detail: "和朋友聊天中",
			status: "Online",
			availability: "online",
		},
		// 超过 Agent Idle 阈值且没有键盘或鼠标输入时使用。
		idle: {
			icon: "☕",
			title: "暂时离开",
			detail: "稍后回来~",
			status: "Idle",
			availability: "idle",
		},
		// 前端超过 90 秒没有收到 heartbeat 后使用；Agent 不主动上报此状态。
		offline: {
			icon: "🌙",
			title: "当前离线",
			detail: "似了喵",
			status: "Offline",
			availability: "offline",
		},
	},

	// ── Windows 进程映射 (Process rules) ───────────────────
	// processes 中只填写可执行文件名，不要填写窗口标题或完整路径。
	// 规则从上到下匹配，忽略大小写且精确比较；首个命中即停止。
	// 同一状态可以列出多个程序，每个程序可分别覆盖 title/app/detail。
	processRules: [
		{
			state: "coding",
			processes: [
				{
					process: "Code.exe",
					app: "Visual Studio Code",
				},
			],
		},
		{
			state: "gaming",
			processes: [
				{
					process: "javaw.exe",
					app: "Minecraft",
				},
			],
		},
		{
			state: "music",
			processes: [
				{
					process: "cloudmusic.exe",
					app: "Spotify",
				},
			],
		},
		{
			state: "surfing",
			processes: [
				{
					process: "msedge.exe",
					app: "Microsoft Edge",
				},
			],
		},
		{
			state: "chating",
			processes: [
				{
					process: "QQ.exe",
					app: "QQ",
				},
				{
					process: "Weixin.exe",
					app: "微信",
				},
			],
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
		previewState: "online",
	},

	// ── Windows Agent 默认参数 (Agent) ──────────────────────
	// 以下时间值单位均为毫秒。对应环境变量设置了非空合法值时，会优先于这里的默认值。
	// PRESENCE_TOKEN 不属于普通配置，不应写入这里或 config.json。
	// 运行时 Token 优先从 PRESENCE_TOKEN 环境变量读取，否则从 EXE 同级 token.dat 通过 DPAPI CurrentUser 解密。
	// 使用 pnpm dev 进入开发服务器，然后使用 pnpm presence:agent 启动开发 agent，此时会从此处读取配置。
	// 一般无需修改这里的参数。
	agent: {
		// Agent 上报状态的 POST 地址。
		// 默认指向 pnpm dev 提供的本地无认证接口；仅供dev服务器使用。
		// PRESENCE_API_URL 实际使用时由powershell设置的环境变量覆盖。
		apiUrl: "http://localhost:4321/api/presence/update/",

		// 检测 Windows 前台进程及系统 Idle 时长的频率，当前为每 5 秒一次。
		// 数值越小，程序切换响应越快，但进程检测更频繁；通常不建议低于 2 秒。
		// 可通过 PRESENCE_DETECT_INTERVAL 覆盖。
		detectInterval: 5_000,

		// 当前状态未变化时，Agent 定期向 API 发送 heartbeat 的间隔，当前为 30 秒。
		// heartbeat 用于持续刷新服务端 updatedAt；不会重置表示状态起点的 since。
		// 应明显小于 frontend.offlineTimeout，通常建议离线超时至少为它的 3 倍。
		// 可通过 PRESENCE_HEARTBEAT_INTERVAL 覆盖。
		heartbeatInterval: 30_000,

		// 无键盘或鼠标输入多久后切换为 behavior.idleState，当前为 10 分钟。
		// Idle 判定优先于 processRules，因此达到阈值后不再显示前台程序对应状态。
		// 可通过 PRESENCE_IDLE_TIMEOUT 覆盖。
		idleTimeout: 600_000,
	},

	// ── 前端计时参数 (Frontend) ─────────────────────────────
	// 以下时间值单位均为毫秒，只影响 Presence 小组件，不会改变 Agent 上报频率。
	frontend: {
		// 浏览器请求 GET /api/presence/ 获取最新状态的间隔，当前为 30 秒。
		// 页面加载和从 hidden 恢复为 visible 时仍会立即请求，不必等待下一轮。
		// 缩短该值能更快看到新状态，但会相应增加 API 和 Nginx 请求量。
		pollInterval: 30_000,

		// Date.now() - updatedAt 超过该值时，前端强制显示 behavior.offlineState。
		// 当前为 90 秒，即允许错过约 3 次 30 秒 heartbeat，避免短暂网络波动造成闪烁。
		// 该判断只生成展示状态，不会覆盖服务器返回的原始 PresenceData。
		offlineTimeout: 90_000,

		// 不发起网络请求的本地 UI 刷新间隔，当前为 15 秒。
		// 用于重新计算 offline 判定和状态持续时间，使 updatedAt 超时后及时更新画面。
		// 它可以小于 pollInterval；缩短该值不会增加 API 请求频率。
		displayRefreshInterval: 15_000,
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
	agent: PresenceAgentConfig;
	frontend: PresenceFrontendConfig;
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
