# Windows Presence Agent

Nightbug Presence 由两个独立 EXE 组成：

- `NightbugPresenceTray.exe`：原生 Windows WinForms 托盘程序，日常启动入口。
- `NightbugPresence.exe`：Node.js SEA Agent，负责检测、配置、Token、API 与 CLI。

托盘程序是 `WinExe`，不会创建控制台窗口；它使用 `CreateNoWindow` 启动 `NightbugPresence.exe --worker`。托盘 UI 不再由 PowerShell 承载。PowerShell 仅可能被 Agent 以隐藏的短生命周期子进程用于既有的 Windows 检测和 DPAPI。

## 安装与首次使用

将整个发布目录复制到普通用户可写的位置，例如：

```text
D:\Apps\NightbugPresence\
├── NightbugPresence.exe
├── NightbugPresenceTray.exe
├── config.example.json
└── README.md
```

不要只复制其中一个 EXE，也不建议放在 `C:\Program Files`。首次使用：

1. 运行 `NightbugPresence.exe --set-token`，Token 输入不会回显。
2. 编辑 EXE 同级的 `config.json`；如果文件不存在，首次运行命令或 Worker 时会自动生成。
3. 双击 `NightbugPresenceTray.exe`。
4. 在托盘菜单中启用“开机自启”。

日常只需运行 `NightbugPresenceTray.exe`。目标机器不需要 Node.js、pnpm、.NET Runtime、PowerShell Tray Host 或项目源码。

配置示例：

```json
{
  "apiUrl": "https://example.com/api/presence/update/",
  "detectInterval": 5000,
  "heartbeatInterval": 30000,
  "idleTimeout": 600000
}
```

Token 通过 Windows DPAPI `CurrentUser` 加密，以 Base64 密文写入同级 `token.dat`，不会写入 `config.json` 或日志。

## 托盘功能

右键托盘图标可以：

- 查看最终 Presence 标题与上次成功同步时间
- 暂停或恢复上报；暂停期间仍继续本地检测，恢复后立即同步
- 立即同步
- 打开配置目录
- 查看 Worker 返回的脱敏配置摘要
- 重新启动 Agent
- 开启或关闭当前用户的开机自启
- 正常停止 Worker 并退出托盘

如果 Worker 不可用，托盘仍会保留并显示 `Agent unavailable`。重新启动操作会先请求现有 Worker 正常退出，确认 Named Pipe 断开后才会启动新 Worker，不会主动创建多个 Worker。

## CLI

CLI 始终直接使用 `NightbugPresence.exe`，即使 Worker 正在运行也可使用：

```powershell
.\NightbugPresence.exe --set-token
.\NightbugPresence.exe --clear-token
.\NightbugPresence.exe --show-config
.\NightbugPresence.exe --enable-autostart
.\NightbugPresence.exe --disable-autostart
.\NightbugPresence.exe --autostart-status
```

`--enable-autostart` 写入当前用户的：

```text
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
NightbugPresence = "<绝对路径>\NightbugPresenceTray.exe"
```

注册值不包含 Token、API URL、环境变量或 `--background`。旧的 Agent 自启动值会在下次启用时被替换。移动发布目录后，请关闭再开启一次自启动以刷新绝对路径。

## Worker 与 IPC

托盘使用以下命令启动 Agent：

```powershell
.\NightbugPresence.exe --worker
```

Worker 不创建 Tray 或其他 UI。由 `NightbugPresenceTray.exe` 启动时使用 Windows `CreateNoWindow`，因此没有持续控制台。手动在终端运行 `--worker` 时，其日志仍会显示在当前终端，便于诊断。

Worker 监听本机 Windows Named Pipe：

```text
\\.\pipe\NightbugPresence
```

协议为 UTF-8、一行一个 JSON。Tray 可发送 `pause`、`resume`、`sync-now`、`shutdown`、`get-status`、`get-config-summary`；Worker 会发送 `status-changed`、`current-state`、`sync-success`、`sync-failed`、`last-sync`、`paused`、`resumed`、`config-summary`。Pipe 绑定同时保证 Worker 单实例；Tray 使用 `Local\NightbugPresenceTray` Mutex 保证单实例。

## 配置优先级

普通配置：

```text
有效且非空的环境变量 → config.json → presenceConfig.agent 默认值
```

支持 `PRESENCE_API_URL`、`PRESENCE_DETECT_INTERVAL`、`PRESENCE_HEARTBEAT_INTERVAL`、`PRESENCE_IDLE_TIMEOUT`。

Token：

```text
非空 PRESENCE_TOKEN → token.dat → 未配置
```

SEA 始终以 `dirname(process.execPath)` 定位运行目录，不依赖当前工作目录。

## 开发模式

开发调试继续使用控制台，不启动生产 Tray：

```powershell
pnpm presence:agent
```

也可使用 `pnpm presence:agent -- --set-token` 等 CLI。开发模式配置位于 `scripts/presence-agent/` 并已被 Git 忽略。

## 构建

在 Windows x64、Node.js 24 与 .NET 8 SDK 环境运行：

```powershell
pnpm presence:agent:exe
```

构建会依次生成 Node SEA Agent，再以 `net8.0-windows`、`OutputType=WinExe`、`win-x64`、self-contained、single-file 发布 C# Tray Helper，最后只复制两个 EXE、README 与示例配置。目标机器不需要安装 .NET Desktop Runtime。如果构建机器没有 SDK，会明确报错：

```text
.NET SDK is required to build NightbugPresenceTray.exe
```

不会自动下载或安装 SDK。

唯一的可选图标为 `scripts/presence-agent/assets/icon.ico`。有效 ICO 会嵌入 Tray EXE，并同时用于 Explorer 文件图标和运行时 NotifyIcon；Agent EXE 也会尽量应用同一图标。运行时不需要外部图标文件，release 不会复制 `icon.ico`。图标缺失、损坏或无法应用时会继续构建并使用 Windows 默认图标。构建不会读取网站的 `src/assets`，也不会转换或生成图标。

最终发布目录：

```text
release/presence-agent/
├── NightbugPresence.exe
├── NightbugPresenceTray.exe
├── config.example.json
└── README.md
```

`pnpm presence:agent:bundle` 仍可只检查 Agent CommonJS bundle，不需要 .NET SDK。
