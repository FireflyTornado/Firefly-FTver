---
title: 客栈的“营业状态”——实时 Presence 小组件
description: 让静态网站“活起来”！记录我如何为静态 Astro 博客设计一套实时 Presence 系统，以及它背后的本地 Agent、服务端与前端是如何协作的。
published: 2026-09-18
tags: [blog, 前端, 组件]
category: 技术
---

在最近折腾这个网站的时候，我开始不太满足于把它当成一个纯粹的内容容器。

文章内容、页面布局、配色等等固然重要，但这些东西无论做得多精致，本质上都还是“已经被放在那里”的内容。访客打开页面以后，看到的是我过去某个时间点留下的东西，而不是“此刻的我”。

于是我有了一种很微妙的想法：

> 一个网站能不能不仅展示“我做过什么”（did），还稍微透露一点“我现在正在做什么”（doing）？

这并不是为了做监控，也不是为了把电脑上的一切都公开出来。我真正想要的，其实只是一个很克制的小提示。

就像夜里一间亮着灯的小屋。你从外面路过，不需要知道屋里具体发生了什么，只需要知道——这里还有人在。

于是，我开始为这里制作一个 Presence 小组件。

---

## 最初想法

最开始，我只是想在侧边栏里显示一句“正在做什么”：

```text
WHAT AM I DOING?

正在写代码
Visual Studio Code

● Online · 12 分钟
```

不同状态可以配不同的图标、插画和描述，例如：

```text
coding
surfing
chating
idle
offline
```

对访客来说，这些信息已经足够了。

我并不想，也不需要展示：

- 当前窗口标题；
- 正在编辑的文件名；
- 浏览器正在访问的网址；
- 本地磁盘路径；
- 聊天内容；
- 用户名或其他更具体的信息。

Presence 真正需要回答的问题只是：

> “此刻大概在做什么？”

而不是：

> “具体正在做哪一件事情？”

这个边界在后面的实现中一直没有改变。

---

## 静态博客和“实时状态”天然有冲突

我的博客本身是 Astro 静态站点。

生产环境一直保持：

```ts title="astro.config.mjs"
output: "static"
```

构建以后真正部署到服务器上的，仍然只是：

```text
HTML
CSS
JavaScript
图片
字体
```

这也是我喜欢静态站点的地方：简单、稳定，也容易部署。

但实时状态恰恰是静态页面最不擅长的事情。

浏览器本身并不知道我的 Windows 当前打开了什么程序，更不知道我是否已经十分钟没有碰键盘和鼠标。它甚至无法判断我的电脑究竟是在线、关机，还是网络暂时断开。

所以很快就能发现：

> Presence 不应该被硬塞进 Astro 本身。

我不希望为了一个侧边栏小组件，把整个博客从静态站点改成 SSR，也不希望让网站构建和实时 API 强绑定。

于是最后，我把它拆成了三个相对独立的部分：

```text
本地 Agent
    ↓
Presence API
    ↓
Astro 前端
```

再展开一点：

```text
Windows Agent
    ↓ HTTPS + Bearer Token
Nginx
    ↓
Fastify Presence API
    ↓
presence.json
    ↓
Astro Presence Widget
```

整个系统看起来比最开始的一张卡片复杂得多，但拆开以后反而更清楚：本地 Agent 负责“观察”，服务端负责“保存”，前端负责“展示”。

---

# 它是怎么工作的

## 前端：只读取状态，不判断状态

Astro 侧的 Presence 组件不会自己判断我在做什么。

它只是定时请求：

```http
GET /api/presence/
```

默认轮询周期是 30 秒。

服务器返回当前状态、应用名称、描述和时间信息以后，前端负责：

- 渲染图标或插画；
- 显示标题；
- 显示 App；
- 显示描述；
- 计算“已经持续多久”；
- 判断当前是否应该显示 Offline。

页面如果切到后台，组件会暂停网络轮询；重新可见时，再立即刷新一次。

这样一来，Presence 的存在并没有改变 Astro 的静态本质：构建产物依旧是静态页面，实时数据只是在浏览器运行时通过 API 获取。

---

## `since`、`updatedAt` 与 Offline

> [!TIP]
> 直接把电脑关了就给我自己判断离线了呐，免得有人说我是夜猫子，虽然我好像确实是夜猫子。

服务器会保存两个时间：

```text
since
updatedAt
```

它们看起来很像，但作用完全不同。

### `since`

表示当前状态是从什么时候开始的。

比如我在 20:00 开始写代码：

```text
since = 20:00
```

此后即使 Agent 每 30 秒发送一次 heartbeat，`since` 仍然保持 20:00。

这样前端才能正确显示：

```text
正在写代码 · 12 分钟
```

### `updatedAt`

表示服务器最后一次真正收到 Agent 消息的时间。

每一次状态更新和 heartbeat 都会刷新它。

于是前端只需要计算：

```text
当前时间 - updatedAt
```

如果超过一定阈值，比如 90 秒，就把当前状态临时视为 Offline。

这样即使：

- Agent 被结束；
- Windows 关机；
- 网络断开；
- API 临时不可达；
- 电脑正在重启；

也不需要 Agent 在“消失前”还能成功发送一次 `offline`。

对这种实时状态来说，我更愿意让 Offline 成为“根据 heartbeat 推导出的事实”，而不是一个必须主动上报的动作。

---

# 本地 Agent 如何工作

> [!TIP]
> 我只是让他们知道我在线，你怎么把我的身份证号也报出去了？

Windows Agent 最核心的工作，是判断当前前台程序。

例如：

```text
Code.exe
msedge.exe
QQ.exe
Weixin.exe
```

然后通过 presenceConfig.ts 里设定的 `processRules` 把它们映射到更抽象的状态：

```text
Code.exe   → coding
msedge.exe → surfing
QQ.exe     → chating
```

这里故意只做到“进程级”。

Agent 不会采集或上传：

- 窗口标题；
- 当前文件；
- 当前 URL；
- 文件路径；
- 聊天对象；
- 文档内容。

Presence 需要知道的是“正在使用哪一类程序”，而不是“正在处理哪一份具体内容”。

## 状态、进程与 Idle

配置中，我把状态本身和进程匹配分开。

整体结构大致是：

```ts
{
  ui,
  states,
  processRules,
  behavior,
  agent,
  frontend
}
```

例如多个程序可以共享同一个状态：

```ts title="src/config/presenceConfig.ts"
{
  state: "chating",
  processes: [
    { process: "QQ.exe", app: "QQ" },
    { process: "Weixin.exe", app: "微信" }
  ]
}
```

如果前台仍然是 VS Code，但已经十分钟没有任何键盘或鼠标输入，那么继续显示“正在写代码”显然不太准确。

因此 Idle 拥有更高优先级：

```text
每 5 秒
    ↓
检查最近一次输入
    ↓
是否超过 idleTimeout
    ├─ 是 → idle
    └─ 否 → 判断前台进程
```

默认 `idleTimeout` 为 10 分钟。

## 状态变化与 heartbeat

Agent 默认每 5 秒检测一次。

如果状态发生变化：

```text
立即上报
```

如果状态没有变化：

```text
每 30 秒 heartbeat
```

这样既不会为了“实时”而持续高频请求服务器，也能让前端很快判断设备是否已经失联。

## 本地 Agent 的程序结构

为了让检测逻辑和 Windows 交互彼此独立，本地 Agent 最终拆成了两部分：

```text
NightbugPresenceTray.exe
NightbugPresence.exe
```

前者负责系统托盘和用户交互，后者负责真正的状态检测与上报。

两者通过 Windows Named Pipe 通信：

```text
\\.\pipe\NightbugPresence
```

从整个 Presence 系统来看，它们仍然共同属于“本地 Agent”这一层。

## 配置与 Token

普通配置保存在 EXE 同级的：

```text
config.json
```

例如：

```json title="config.json"
{
  "apiUrl": "https://example.com/api/presence/update/",
  "detectInterval": 5000,
  "heartbeatInterval": 30000,
  "idleTimeout": 600000
}
```

普通配置优先级：

```text
环境变量
→ config.json
→ 内置默认值
```

但 Token 不放在这里。

用于 POST 鉴权的 Bearer Token 会通过 Windows DPAPI 加密后保存到：

```text
token.dat
```

并使用：

```text
ProtectedDataScope.CurrentUser
```

这样普通配置和敏感信息被分开处理。

---

# 服务端如何工作

服务端使用独立的 Fastify 服务。

对外主要只有两个接口：

```http
GET /api/presence/
POST /api/presence/update/
```

GET 用于前端读取。

POST 用于 Agent 上报，并要求：

```http
Authorization: Bearer TOKEN
```

服务本身只监听：

```text
127.0.0.1:8765
```

不会直接暴露公网端口。

## 状态持久化

当前状态保存在：

```text
/var/lib/nightbug-presence/presence.json
```

服务器收到相同状态时：

```text
保留 since
刷新 updatedAt
```

状态发生变化时：

```text
更新 since
刷新 updatedAt
```

写入则采用临时文件、同步和 rename 的方式，尽量避免进程意外中断时留下损坏状态文件。

## Nginx 与 systemd

生产环境里，Fastify 由 systemd 托管。

公网请求则先到 Nginx，再反向代理到：

```text
127.0.0.1:8765
```

所以完整链路实际上是：

```text
Windows Agent
    ↓ HTTPS POST
Nginx
    ↓
Fastify
    ↓
presence.json
    ↓
Nginx
    ↓ HTTPS GET
Astro Widget
```

Presence API 还会显式返回：

```text
Cache-Control: no-store
```

避免实时状态被浏览器或 CDN 长时间缓存。

因为前端轮询和 Agent heartbeat 会产生大量重复 200 请求，所以 Presence 路径的 Nginx access log 也被单独关闭，错误日志则继续保留。

---

# 为什么最后保留了这样的设计

回头看整个开发过程，我真正满意的并不是用了多少技术，而是几个最后保留下来的边界。

**静态站点继续保持静态**：Presence 不值得让整个博客改成 SSR，实时功能应该独立出去，而不是改变网站本身的部署方式。

**本地只采集真正必要的信息**：知道“正在使用哪类程序”已经足够，没有必要知道窗口标题、URL 或文件内容。

**Offline 应该被推导，而不是主动上报**：电脑突然关机时，本来就无法保证最后一次请求一定发得出去，所以让前端根据 `updatedAt` 判断是否离线，反而更可靠。

**Secret 不进入普通配置**：普通配置使用 JSON，Token 使用 DPAPI，二者各自解决不同的问题。

**前端、Agent、服务端互相解耦**：前端只关心 GET API，Agent 只关心如何判断状态以及 POST 到哪里，服务端只关心接收、保存和提供状态，各司其职。这样任何一层将来都可以单独替换，而不需要把整套系统推倒重来。

---

# 结语

真正做下去以后才发现，想要让这个看起来很简单的小组件稳定、克制、长期运行，面临着许多问题：

```text
静态站点和实时数据怎么共存？
Agent 怎么知道当前程序？
电脑突然关机以后怎么判断离线？
Token 放在哪里？
服务端怎样保存状态？
前端怎样知道设备已经消失？
```

最后，它的背后逐渐形成了一套完整的小型系统：

```text
Astro
TypeScript
Node.js
Fastify
Nginx
systemd
Node SEA
C#
WinForms
Named Pipe
DPAPI
```

当这一切都运行起来以后，打开网站时，我看到的仍然只是很简单的一小块：

```text
正在写代码
Visual Studio Code

● Online · 12 分钟
```

没有复杂的控制面板，也没有暴露太多信息。

它只是让这个原本完全静态的网站，多了一点非常轻微的“此刻”。

此时此刻，这间客栈也终于活了起来。

> [!NOTE]
> 如果你也想部署这套 Presence，我把从服务端构建、Linux 部署、Nginx、systemd，到 Windows Agent、Token、前端接入和完整卸载的步骤都已单独整理在源码中的 Firefly\server\presence 目录下，你只需要移植小组件的前端面板，然后根据教程配置前后端即可。
