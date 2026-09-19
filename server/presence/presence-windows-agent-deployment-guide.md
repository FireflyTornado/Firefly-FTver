# Presence Windows Agent：部署、配置与维护指南

> 本文档只负责 **Windows Agent** 的构建、安装、配置、运行、更新、故障排查与卸载。
>
> Presence Server 的部署、Nginx / systemd / Token 服务端配置，请参阅对应的服务器部署指南。
>
> 网站前端如何接入 Presence API，也不在本文档展开。

---

## 1. Agent 在整套 Presence 中的位置

整套系统可以简化为：

```text
Windows Agent
    ↓ HTTPS POST
Presence Server
    ↓ HTTPS GET
网站前端
```

Windows Agent 只负责：

```text
读取本机前台程序和空闲状态
        ↓
转换为 Presence 状态
        ↓
定时向服务器上报
```

当前 Agent 由两个程序组成：

```text
NightbugPresenceTray.exe
        ↓ Named Pipe
NightbugPresence.exe --worker
        ↓ HTTPS POST
Presence Server
```

其中：

- `NightbugPresenceTray.exe`：托盘程序，负责用户交互和 Worker 生命周期；
- `NightbugPresence.exe --worker`：后台 Worker，负责状态检测和上报；
- 两者之间通过 Named Pipe 通信。

> [!NOTE]
> 本文默认 Presence Server 已经部署完成，并且你已经获得：
>
> ```text
> API 地址：
> https://example.com/api/presence/update/
>
> Presence Token：
> 与服务器端 PRESENCE_TOKEN 完全一致
> ```
>
> Agent 只向 `POST /api/presence/update/` 上报状态。网站前端使用的 `GET /api/presence/` 不属于 Agent 配置范围。

---

## 2. 构建 Windows Agent

如果你已经拿到现成的 Agent Release，可以直接跳到下一节。

从源码自行构建时，需要：

```text
Node.js
pnpm
.NET 8 SDK
```

在项目根目录执行：

```bash
pnpm presence:agent:exe
```

构建完成后，最终产物位于：

```text
release/presence-agent/
├── NightbugPresence.exe
├── NightbugPresenceTray.exe
├── config.example.json
└── README.md
```

其中真正运行时需要的核心程序是：

```text
NightbugPresence.exe
NightbugPresenceTray.exe
```

---

## 3. 安装 Agent

推荐为 Agent 创建一个固定目录，例如：

```text
D:\Apps\NightbugPresence\
```

将 Release 中的文件复制进去。

> [!WARNING]
> 不建议把 Agent 放到普通用户无法写入的目录。
>
> 程序运行后会在安装目录附近使用：
>
> ```text
> config.json
> token.dat
> ```
>
> 如果目录权限不足，可能导致配置或 Token 无法正常保存。

推荐最终目录类似：

```text
D:\Apps\NightbugPresence\
├── NightbugPresence.exe
├── NightbugPresenceTray.exe
├── config.json
├── token.dat
└── README.md
```

第一次安装时，`config.json` 和 `token.dat` 可能还不存在。

---

## 4. 第一次启动

日常使用的入口是：

```text
NightbugPresenceTray.exe
```

第一次运行时，Tray 会负责启动 Worker。

正常情况下，首次启动后会生成：

```text
config.json
```

如果没有生成，可以先退出 Tray，确认安装目录具有写入权限后重新启动。

---

## 5. 配置服务器 API 地址

Agent 的运行参数保存在：

```text
config.json
```

典型配置：

```json
{
  "apiUrl": "https://example.com/api/presence/update/",
  "detectInterval": 5000,
  "heartbeatInterval": 30000,
  "idleTimeout": 600000
}
```

各字段含义：

| 字段 | 作用 |
| --- | --- |
| `apiUrl` | Presence Server 的状态上报地址 |
| `detectInterval` | 本机状态检测间隔，单位 ms |
| `heartbeatInterval` | 状态心跳上报间隔，单位 ms |
| `idleTimeout` | 多久无操作后进入空闲状态，单位 ms |

生产环境中的 `apiUrl` 应使用 HTTPS，例如：

```text
https://example.com/api/presence/update/
```

> [!NOTE]
> 这里填写的是 **POST 更新接口**，不是网站前端读取状态的 GET 接口。

---

## 6. 配置 DPAPI Token

Presence Token 不建议直接明文写进 `config.json`。

进入 Agent 安装目录：

```powershell
cd D:\Apps\NightbugPresence
```

执行：

```powershell
.\NightbugPresence.exe --set-token
```

输入与服务器端完全一致的 Presence Token。

成功后会生成：

```text
token.dat
```

`token.dat` 使用 Windows DPAPI 保存 Token，因此与当前 Windows 用户环境相关。

检查配置：

```powershell
.\NightbugPresence.exe --show-config
```

应确认类似：

```text
API URL: ...
Detect interval: ...
Heartbeat interval: ...
Idle timeout: ...
Token: configured
```

如果需要删除本机 Token：

```powershell
.\NightbugPresence.exe --clear-token
```

然后重新执行：

```powershell
.\NightbugPresence.exe --set-token
```

即可重新配置。

---

## 7. 正常运行方式

日常情况下，只需要启动：

```text
NightbugPresenceTray.exe
```

不要把：

```text
NightbugPresence.exe --worker
```

当作主要用户入口长期手动运行。

正常关系是：

```text
用户启动 Tray
    ↓
Tray 启动 Worker
    ↓
Worker 检测本机状态
    ↓
Worker 定时上报服务器
```

如果 Tray 被退出，Worker 的生命周期也应由 Tray 管理。

---

## 8. 配置登录自启动

启用 Agent 登录自启动：

```powershell
.\NightbugPresence.exe --enable-autostart
```

检查：

```powershell
.\NightbugPresence.exe --autostart-status
```

禁用：

```powershell
.\NightbugPresence.exe --disable-autostart
```

> [!TIP]
> 如果以后移动了 Agent 安装目录，建议先禁用旧的自启动项，再在新目录重新执行：
>
> ```powershell
> .\NightbugPresence.exe --enable-autostart
> ```

这样可以避免登录后仍尝试启动旧路径中的程序。

---

## 9. 常用 CLI

Agent 提供的常用命令：

```powershell
.\NightbugPresence.exe --set-token
.\NightbugPresence.exe --clear-token
.\NightbugPresence.exe --show-config
.\NightbugPresence.exe --enable-autostart
.\NightbugPresence.exe --disable-autostart
.\NightbugPresence.exe --autostart-status
```

可以按用途理解为：

```text
Token
├── --set-token
└── --clear-token

配置检查
└── --show-config

自启动
├── --enable-autostart
├── --disable-autostart
└── --autostart-status
```

---

## 10. 状态检测与自定义

Agent 会根据本机实际程序与行为规则映射 Presence 状态。

常见配置包括：

```text
states
processRules
```

例如可以定义：

```text
gaming
reading
drawing
music
working
away
```

`processRules` 中使用的 Windows 进程名需要根据自己的电脑实际情况调整。

如果增加新的状态，应确保：

```text
Agent 能产生该状态
        ↓
Presence Server 接受该状态
        ↓
前端存在对应展示配置
```

> [!NOTE]
> 本文只说明 Agent 侧需要维护 `states` / `processRules` 的事实。
>
> 服务端状态校验规则和前端展示方式分别由对应模块自己的文档负责。

---

## 11. 更新 Windows Agent

更新客户端时，不需要重新部署服务器。

推荐流程：

```text
退出 Tray
↓
保留 config.json
↓
保留 token.dat
↓
替换 NightbugPresence.exe
↓
替换 NightbugPresenceTray.exe
↓
重新启动 Tray
```

也就是说，更新时重点保留：

```text
config.json
token.dat
```

它们分别保存：

```text
config.json
→ API 地址与运行参数

token.dat
→ 当前 Windows 用户的加密 Presence Token
```

更新完成后建议执行：

```powershell
.\NightbugPresence.exe --show-config
```

确认配置仍然正常。

如果使用了登录自启动，也可以再次检查：

```powershell
.\NightbugPresence.exe --autostart-status
```

---

## 12. 迁移 Agent 安装目录

如果只是从一个目录移动到另一个目录，建议按以下顺序操作：

```text
1. 退出 Tray
2. 禁用旧路径的登录自启动
3. 复制整个 Agent 目录
4. 保留 config.json
5. 保留 token.dat
6. 从新目录启动 Tray
7. 重新启用登录自启动
```

旧目录执行：

```powershell
.\NightbugPresence.exe --disable-autostart
```

复制完成后，在新目录执行：

```powershell
.\NightbugPresence.exe --enable-autostart
.\NightbugPresence.exe --autostart-status
```

如果更换了 Windows 用户账户，原来的 `token.dat` 可能无法继续使用，因为 DPAPI 与用户环境相关。此时重新执行：

```powershell
.\NightbugPresence.exe --set-token
```

---

## 13. 故障排查

### Tray 启动后没有状态上报

先确认 Tray 和 Worker 是否都在运行。

然后检查：

```powershell
.\NightbugPresence.exe --show-config
```

重点确认：

```text
API URL
Token: configured
Detect interval
Heartbeat interval
Idle timeout
```

如果 API 地址错误，修改 `config.json`。

如果 Token 未配置：

```powershell
.\NightbugPresence.exe --set-token
```

---

### Token 未配置或失效

检查：

```powershell
.\NightbugPresence.exe --show-config
```

如果显示 Token 未配置：

```powershell
.\NightbugPresence.exe --set-token
```

如果服务器端 Token 已经更换，本机也必须重新设置为相同值。

---

### Agent 正常运行，但网站一直显示 Offline

按下面顺序判断：

```text
Agent 是否正在运行
↓
Worker 是否仍在运行
↓
Token 是否已配置
↓
apiUrl 是否正确
↓
服务器 updatedAt 是否变化
↓
网站 GET API 是否正常
```

前四项属于 Agent 侧。

如果 Agent 配置正确，但服务器状态没有变化，应转到服务器部署指南排查 API、认证、Nginx 或服务端日志，而不是在 Agent 文档中继续处理服务器配置。

---

### Agent 能运行，但某些程序识别不到

检查对应程序实际的 Windows 进程名，并与：

```text
processRules
```

中的配置对照。

如果进程名不一致，Agent 就不会映射到预期状态。

---

### Tray 与 Worker 行为异常

正常架构是：

```text
NightbugPresenceTray.exe
        ↓
NightbugPresence.exe --worker
```

如果出现重复 Worker、Tray 退出后 Worker 异常残留或无法重新启动等情况，应先完全退出 Tray，再确认旧 Worker 已结束，然后重新启动 Tray。

---

## 14. 完整卸载 Windows Agent

先从托盘退出 Agent。

然后禁用登录自启动：

```powershell
.\NightbugPresence.exe --disable-autostart
```

确认：

```powershell
.\NightbugPresence.exe --autostart-status
```

确保没有遗留的 Tray 或 Worker 进程后，删除安装目录，例如：

```powershell
Remove-Item -Recurse -Force D:\Apps\NightbugPresence
```

这会同时删除：

```text
NightbugPresence.exe
NightbugPresenceTray.exe
config.json
token.dat
README.md
```

> [!WARNING]
> 删除 `token.dat` 后，本机保存的 Presence Token 也会被删除。
>
> 卸载 Windows Agent **不会**删除服务器端 Presence 服务，也不会修改网站前端。

---

## 15. 构建临时文件

Windows Agent 构建期间可能产生：

```text
.temp/presence-agent/
scripts/presence-agent/tray-helper/bin/
scripts/presence-agent/tray-helper/obj/
```

默认情况下，构建流程完成后会自动清理。

如果需要调试构建过程，可以临时保留中间产物：

```powershell
$env:PRESENCE_KEEP_BUILD_ARTIFACTS="1"
pnpm presence:agent:exe
```

调试结束后，可手动删除这些临时目录。

---

## 16. 部署完成检查清单

```text
[ ] 已获得可用的 Presence Server POST API
[ ] 已获得与服务器一致的 Presence Token
[ ] NightbugPresence.exe 存在
[ ] NightbugPresenceTray.exe 存在
[ ] config.json 已生成
[ ] apiUrl 指向 /api/presence/update/
[ ] detectInterval 配置正确
[ ] heartbeatInterval 配置正确
[ ] idleTimeout 配置正确
[ ] --set-token 已执行
[ ] token.dat 已生成
[ ] --show-config 显示 Token: configured
[ ] Tray 可以正常启动
[ ] Worker 可以正常启动
[ ] Agent 可以成功上报状态
[ ] 登录自启动按需要启用
```

