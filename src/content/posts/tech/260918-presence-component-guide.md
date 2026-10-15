---
title: 客栈的“营业状态”—— Presence 小组件
description: 让静态网站“活起来”！记录我如何为静态 Astro 博客设计一套实时 Presence 系统，以及具体的部署教程！
published: 2026-09-18
tags: [blog, 前端, 组件]
category: 技术
---

我给客栈做了一个小小的“营业状态”面板。打开网站，你可以看到我此刻是在写代码、逛网页、聊天，还是暂时离开了电脑。

它显示的内容很简单：

```text
What am I doing?

正在写代码
Visual Studio Code
工作中

● Online · 12 分钟
```

如果你也想把它放到自己的网站，这篇文章会带你从源码开始，把前端、服务端和 Windows 客户端接起来。前面用一节说明它的工作原理，后面直接进入操作步骤。

# 工作原理：三个部分，两个接口

Presence 分成三层，各自只负责一件事：

```text
你的 Windows 电脑
  Agent 检测前台程序和空闲时间
          │
          │ HTTPS POST，携带 Bearer Token
          ▼
Presence 服务端
  接收状态，保存到 presence.json
          ▲
          │ HTTPS GET，公开读取
          │
访客的浏览器
  前端组件轮询 API，显示状态
```

这里检测的是**站长自己的电脑**。访客只是在浏览器里读取结果，不需要安装客户端。

Agent 默认每 5 秒检查一次前台程序，按规则把 `Code.exe`、`msedge.exe`、`QQ.exe` 等进程名映射成 `coding`、`surfing`、`chating`。如果 10 分钟没有键盘或鼠标输入，就优先显示 `idle`。它不会采集窗口标题、文件名、网址或聊天内容；“听音乐”等状态也只是根据前台播放器进程推测，并不检测实际播放情况。

状态变化时，Agent 立即上报；状态不变时，每 30 秒发送一次心跳。服务端提供两个接口：

| 接口 | 调用者 | 用途 | 是否需要 Token |
| --- | --- | --- | --- |
| `GET /api/presence/` | 网站前端 | 读取当前状态 | 否 |
| `POST /api/presence/update/` | Windows Agent | 更新状态或发送心跳 | 是 |

返回数据里的 `since` 表示**当前状态开始的时间**，`updatedAt` 表示**服务端最后收到上报的时间**，单位都是 Unix 时间戳毫秒。同一状态的心跳只刷新 `updatedAt`；只有状态 key 改变时才重新设置 `since`。因此，在两个编辑器之间切换但都属于 `coding` 时，持续时间仍然接着计算。

前端默认每 30 秒读取一次 API。如果 `updatedAt` 已经超过 90 秒没有更新，就显示 Offline。这个判断发生在浏览器里，不会把服务器存储的状态改成 `offline`；电脑突然关机或网络断开时，也能自然转为离线。页面进入后台后会跳过网络请求，重新可见时立即刷新。

这样，网站仍然只是静态 HTML、CSS 和 JavaScript，实时状态由浏览器在运行时获取。

# 准备源码与运行环境

先从我的 [Firefly 源码仓库](https://github.com/FireflyTornado/Firefly-FTver)取得包含 Presence 的版本。本文使用的主要文件如下：

```text
src/
├── components/widget/Presence.astro    # 前端面板
├── config/presenceConfig.ts            # 状态、进程映射、默认参数
├── types/presenceConfig.ts             # 配置类型
├── utils/presence-store.ts             # 数据类型及本地开发状态存储
└── integrations/presence-dev-api.ts    # 可选：本地开发 API

server/presence/                        # Fastify 服务端
scripts/presence-agent/                 # Windows Agent 与托盘源码
deploy/presence/                        # 环境变量、systemd、Nginx 模板
```

构建服务端时，`server/presence/types.ts` 还会引用 `src/config/presenceConfig.ts` 中的类型；Agent 则直接读取这份配置。第一次部署可以保留完整仓库作为构建目录，再把生成的产物分别安装到服务器和电脑上。

| 环境 | 需要准备的内容 |
| --- | --- |
| 网站项目 | Astro；本文的前端组件按 Astro 写法接入 |
| Linux 服务器 | Node.js 24 或更新且兼容的版本、pnpm、Nginx、systemd、OpenSSL |
| Windows 构建电脑 | Windows x64、Node.js、pnpm、.NET 8 SDK |
| Windows 使用电脑 | 能运行发布版的 Windows x64 环境，以及普通用户可写的安装目录 |

版本要求以你取得的源码为准。本文对应的服务端声明 `node >=24.0.0`，仓库根目录声明 `node >=22.23.0`、`pnpm@11.22.0`；使用 Node.js 24 可以同时满足两边的要求。托盘构建脚本会使用 .NET SDK，发布产物包含运行时，使用 EXE 时无需另外安装 Node.js、pnpm 或 .NET Runtime。

以下示例统一把网站写成 `https://example.com`。请替换成自己的域名，并提前让 DNS、网站 HTTPS 和证书正常工作。

## 把前端组件移植到网站

## 1. 复制组件与配置

如果目标也是 Astro 项目，先按相同路径复制这四个文件：

```text
src/components/widget/Presence.astro
src/config/presenceConfig.ts
src/types/presenceConfig.ts
src/utils/presence-store.ts
```

`Presence.astro` 对 `presence-store.ts` 的引用使用的是 `import type`，前端只需要其中的 `PresenceData` 类型，不会因此拥有服务端存储功能。你也可以把这个接口单独移到自己的类型文件，再修改组件顶部和 `<script>` 内的两处类型导入。

源码中的 `@/` 指向 `src/`。目标项目如果没有这个别名，在原有 `tsconfig.json` 的 `compilerOptions.paths` 中合并：

```json title="tsconfig.json"
{
  "@/*": ["./src/*"]
}
```

也可以把组件里的导入改成目标项目对应的相对路径。配置文件与类型文件之间的相对路径需要一起保持正确。

## 2. 处理卡片外壳与样式

面板使用了 Firefly 的 `WidgetLayout.astro`。如果你的网站已经有这个组件，可以直接使用。

如果是其他 Astro 主题，可以换成自己的卡片容器：

在 `Presence.astro` 中删除这一行：

```ts title="src/components/widget/Presence.astro"
import WidgetLayout from "@/components/common/WidgetLayout.astro";
```

把包裹 `<presence-widget>` 的 `<WidgetLayout ...>` 和 `</WidgetLayout>` 分别替换为：

```astro title="src/components/widget/Presence.astro"
<section id="presence-widget" class:list={["presence-card", className]} style={style}>
  <!-- 原有 presence-widget 及内部内容全部保留 -->
</section>
```

上面展示的是外层替换位置，不要把组件内部内容替换成注释。原有 `<script>` 和 `<style>` 也要保留。

随后在组件原有 `<style>` 中加入卡片样式，补上它使用的 CSS 变量和工具类：

```css title="src/components/widget/Presence.astro"
.presence-card {
  --radius-large: 1rem;
  --primary: #2563eb;
  --btn-regular-bg: #f1f5f9;
  --btn-regular-bg-hover: #e2e8f0;
  --line-divider: #e5e7eb;
  padding: 1rem;
  border: 1px solid var(--line-divider);
  border-radius: var(--radius-large);
  background: #fff;
}

:global(.dark) .presence-card {
  --primary: #93c5fd;
  --btn-regular-bg: #262626;
  --btn-regular-bg-hover: #404040;
  --line-divider: #404040;
  background: #171717;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

原组件的深色样式根据祖先元素上的 `.dark` 类切换。如果你的主题用 `data-theme` 等方式控制配色，需要同步调整相关选择器。直接复制 Firefly 的 `WidgetLayout.astro` 则会继续带入 `astro-icon`、国际化模块和主题工具类依赖，移植时也要处理它们。

## 3. 在页面或侧边栏中挂载

在自己的 Astro 布局或侧边栏组件里导入并渲染：

```astro title="src/components/layout/SideBar.astro"
---
import Presence from "@/components/widget/Presence.astro";
---

<aside>
  <Presence />
</aside>
```

这个组件的交互由内置 `<script>` 注册自定义元素完成，直接使用 `<Presence />` 即可。

如果你使用的是带组件注册表的 Firefly 版本，则在 `src/components/layout/SideBar.astro` 的 `componentMap` 中注册 `presence: Presence`，在 `src/types/sidebarConfig.ts` 的 `WidgetComponentType` 中加入 `"presence"`，再向 `src/config/sidebarConfig.ts` 对应的侧栏数组添加：

```ts title="src/config/sidebarConfig.ts"
{
  type: "presence",
  enable: true,
  position: "sticky",
  showOnPostPage: true,
}
```

本文源码已包含注册项，使用这份源码时只需检查是否启用。手机端由 `mobileBottomComponents` 单独控制；其中没有 `position` 字段，需要按移动端配置单独添加。

## 4. 确认读取地址

组件的 `loadPresence()` 默认请求：

```ts title="src/components/widget/Presence.astro"
const response = await fetch("/api/presence/", {
  cache: "no-store",
  signal: this.listeners?.signal,
});
```

这意味着浏览器访问的是**网站当前域名下的 API**。下面的部署步骤会让 Nginx 把这个路径转发给 Presence 服务。

如果网站托管在其他平台，例如静态托管服务，你仍然需要在网站域名下设置相应的 API 转发，或改成自己的独立 API 地址。现有 Fastify 服务没有配置 CORS，单纯把这里换成另一个域名，并不能保证浏览器成功读取；跨域方案还需要在服务端或代理层配置允许的网站来源。使用 HTTPS 网站时，API 也应使用 HTTPS。

组件使用根路径 `/api/presence/`。即使网站放在 `/blog/` 子目录，它仍请求域名根目录的 API，代理路径需要与之对应。

前端只需要 GET 地址，**不要在组件、网页脚本或公开环境变量中填写 Bearer Token**。

## 5. 可选：先在本地预览

在完整源码仓库中执行：

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

开发模式下，组件会显示 DEV 状态切换按钮，方便预览不同状态的外观，生产构建不会显示这些按钮。源码中的 `USE_MOCK_PRESENCE` 默认是 `false`；如需持续使用模拟状态预览，可以临时改为 `true`，完成后改回 `false`。保持 `false` 时，后续真实 API 轮询会覆盖按钮设置的预览状态。

如果要在其他 Astro 项目里使用本地开发 API，还要复制 `src/integrations/presence-dev-api.ts`，并把下面的集成合并到原有 `astro.config.mjs`：

```ts title="astro.config.mjs"
import presenceDevApi from "./src/integrations/presence-dev-api";

// 在已有 integrations 数组中追加：
presenceDevApi(),
```

这套开发接口仅保存内存状态，POST 不要求 Token，只用于本地调试。它不会随静态构建变成生产 API，正式上线仍需要下面的独立服务端。

# 部署 Presence 服务端

下面采用 Linux 原生构建，再通过 systemd 常驻运行。命令中的 `<源码仓库地址>` 是包含 Presence 的完整仓库地址。

## 1. 在 Linux 上构建发布目录

先检查环境：

```bash
node -v
pnpm -v
nginx -v
```

使用一个专门的源码构建目录：

```bash
mkdir -p "$HOME/presence-build"
cd "$HOME/presence-build"
git clone <源码仓库地址> Firefly
cd Firefly

pnpm install --frozen-lockfile
pnpm presence:server:build
pnpm --filter @nightbug/presence --prod deploy ./release-presence

ls -l release-presence/dist/index.js
```

`release-presence` 在首次部署时应是一个尚未使用的输出目录。再次构建时可以换一个新目录名，避免与已有产物混在一起。

`pnpm deploy` 会带上生产依赖。不要直接把 Windows 项目中的 `node_modules` 复制到 Linux；网站的静态构建产物和这个 API 发布目录也需要分别部署。

## 2. 创建运行用户并安装程序

仍在 Linux 的源码根目录执行：

```bash
sudo useradd --system --user-group --home-dir /var/lib/nightbug-presence \
  --no-create-home --shell /usr/sbin/nologin presence

sudo install -d -o root -g root -m 755 /opt/nightbug-presence
sudo cp -a release-presence/. /opt/nightbug-presence/
sudo chown -R root:root /opt/nightbug-presence
sudo chmod -R a+rX /opt/nightbug-presence

sudo install -d -o presence -g presence -m 750 /var/lib/nightbug-presence
```

这是首次安装流程。如果 `presence` 用户已经存在，不需要重复创建。程序文件放在 `/opt/nightbug-presence`，状态文件放在 `/var/lib/nightbug-presence`；后者必须允许 `presence` 用户写入。

## 3. 设置服务端 Token

生成一份随机密钥：

```bash
openssl rand -hex 32
```

妥善保存输出，稍后在 Windows 客户端中输入同一份值。

从仓库安装环境变量模板：

```bash
sudo install -o root -g root -m 600 \
  deploy/presence/nightbug-presence.env.example /etc/nightbug-presence.env
sudoedit /etc/nightbug-presence.env
```

修改为：

```ini title="deploy/presence/nightbug-presence.env.example"
PRESENCE_TOKEN=替换为刚生成的随机密钥
PRESENCE_HOST=127.0.0.1
PRESENCE_PORT=8765
PRESENCE_STATE_FILE=/var/lib/nightbug-presence/presence.json
```

这里的 Token 是服务端用于验证 Agent 的秘密。不要把真实值提交到仓库，也不要发给访客。

## 4. 配置 systemd 并启动

安装仓库中的服务模板：

```bash
sudo install -o root -g root -m 644 \
  deploy/presence/nightbug-presence.service \
  /etc/systemd/system/nightbug-presence.service
command -v node
```

模板默认使用：

```ini title="deploy/presence/nightbug-presence.service"
User=presence
Group=presence
WorkingDirectory=/opt/nightbug-presence
EnvironmentFile=/etc/nightbug-presence.env
ExecStart=/usr/bin/node /opt/nightbug-presence/dist/index.js
```

如果 Node.js 实际位于其他位置，使用 `sudoedit /etc/systemd/system/nightbug-presence.service` 修改 `ExecStart`。路径必须让 `presence` 用户可执行；模板开启了 `ProtectHome=true`，因此不要直接指向个人 home 目录里的 Node.js。

启动并检查：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nightbug-presence
sudo systemctl status nightbug-presence --no-pager
curl -i http://127.0.0.1:8765/api/presence/
```

首次启动、尚无上报时，GET 应返回 `200`，内容类似：

```json
{
  "state": "offline",
  "title": "当前离线",
  "detail": "下次见",
  "updatedAt": 0
}
```

服务读取到已有的合法状态文件时，会恢复此前保存的数据。GET 不会自动把过期状态改成离线，这是前端负责的判断。

## 5. 用 Nginx 对外提供 HTTPS API

在**网站域名对应、监听 HTTPS 的 `server` 块内部**加入下面的配置，或把它保存到该站点已经 include 的扩展配置文件里：

```nginx title="deploy/presence/nginx-presence.conf"
location ~ ^/api/presence(?:/|/update/?)?$ {
    proxy_pass http://127.0.0.1:8765;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    client_max_body_size 16k;
    add_header Cache-Control "no-store" always;
}
```

这里的 `proxy_pass` 保留原请求路径。配置应覆盖 `/api/presence/` 和 `/api/presence/update/`，并且不能被站点已有的更高优先级规则截走。

使用宝塔面板时，可以通过站点配置编辑对应的 vhost，或使用它已 include 的站点扩展目录。不要把这段 `location` 放到 Nginx 顶层，也不要覆盖整份网站配置。

检查语法后重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -i https://example.com/api/presence/
```

宝塔等环境如果由面板管理 Nginx，应使用面板对应的检查与重载方式。公网 GET 应返回与本机接口一致的 JSON，并包含 `Cache-Control: no-store`。如果前面还有 CDN，也要让这两个 API 路径跳过缓存。

API 只监听 `127.0.0.1:8765`，不需要向公网开放 8765 端口。公网请求通过已有的 HTTPS 入口进入。

## 6. 验证上报与鉴权

先测试未携带 Token 的请求：

```bash
curl -i https://example.com/api/presence/update/ \
  -H 'Content-Type: application/json' \
  --data '{"state":"coding","title":"正在写代码"}'
```

应返回 `401 Unauthorized`。

再测试正确 Token。下面使用隐藏输入和标准输入传递密钥，避免把真实值直接写进命令历史或 curl 的参数：

```bash
read -rsp 'Presence Token: ' presence_token
printf '\n'
printf 'header = "Authorization: Bearer %s"\n' "$presence_token" | \
  curl --config - -i https://example.com/api/presence/update/ \
    -H 'Content-Type: application/json' \
    --data '{"state":"coding","title":"正在写代码","app":"Visual Studio Code","detail":"部署测试"}'
unset presence_token
```

应返回 `200`。再次 GET，确认 `state`、`title`、`app` 等字段已经变化，并且包含数值形式的 `since`、`updatedAt`。

重复发送相同 `state` 后，`since` 应保持不变，`updatedAt` 则继续刷新。至此，API 已经具备接收客户端上报的条件。

# 安装和配置 Windows 客户端

网页不会自己读取你的电脑状态。接下来需要在希望展示状态的 Windows 电脑上运行 Agent。

## 1. 构建客户端

在 Windows x64 构建电脑的完整源码根目录执行：

```powershell
node -v
pnpm -v
dotnet --list-sdks

pnpm install --frozen-lockfile
pnpm presence:agent:exe
```

确认已安装 .NET 8 SDK。成功后，发布目录是：

```text
release/presence-agent/
├── NightbugPresence.exe
├── NightbugPresenceTray.exe
├── config.example.json
└── README.md
```

如果已经拿到与你所用配置对应的发布版，可以跳过构建。两个 EXE 要一起保留：Tray 负责托盘和交互，另一个负责检测与上报。

## 2. 放入固定目录并设置 Token

将发布目录中的文件放到普通用户可写的位置，例如：

```text
D:\Apps\NightbugPresence\
```

进入该目录并设置 Token：

```powershell
Set-Location D:\Apps\NightbugPresence
.\NightbugPresence.exe --set-token
```

输入服务端 `/etc/nightbug-presence.env` 中的那份 Token。程序会通过 Windows DPAPI 的 `CurrentUser` 范围加密，保存为同目录的 `token.dat`。

这个命令也会读取或生成普通配置。不要把 Token 写进 `config.json`，也不要直接把 `token.dat` 当成可以跨机器、跨账户复用的凭据；更换 Windows 账户或电脑后，应重新设置 Token。

## 3. 编辑客户端配置

在 EXE 同级的 `config.json` 中填写：

```json title="scripts/presence-agent/config.example.json"
{
  "apiUrl": "https://example.com/api/presence/update/",
  "detectInterval": 5000,
  "heartbeatInterval": 30000,
  "idleTimeout": 600000
}
```

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| `apiUrl` | POST 上报接口，包含 `/update/` | `https://example.com/api/presence/update/` |
| `detectInterval` | 检查前台程序的间隔 | 5 秒 |
| `heartbeatInterval` | 状态不变时的心跳间隔 | 30 秒 |
| `idleTimeout` | 多久没有输入就显示 Idle | 10 分钟 |

配置中的所有时间单位都是**毫秒**。这里填写的是上报地址，不能填成前端使用的 GET 地址。

普通配置优先级为“合法的环境变量 → `config.json` → 内置默认值”。对应环境变量是 `PRESENCE_API_URL`、`PRESENCE_DETECT_INTERVAL`、`PRESENCE_HEARTBEAT_INTERVAL`、`PRESENCE_IDLE_TIMEOUT`。Token 则优先读取 `PRESENCE_TOKEN`，没有配置时再读取 `token.dat`。

如果曾经设置过这些环境变量，修改 JSON 后仍可能被覆盖。执行下面的命令检查最终值及其来源：

```powershell
.\NightbugPresence.exe --show-config
```

确认 API 是自己的 HTTPS 地址，Token 显示为已配置。修改配置或 Token 后，需要重新启动 Agent，让 Worker 重新读取。

## 4. 启动托盘与登录自启

双击 `NightbugPresenceTray.exe`，也可以通过 PowerShell 启动：

```powershell
Start-Process -FilePath .\NightbugPresenceTray.exe -WindowStyle Hidden
```

Tray 会启动后台 Worker。右键托盘图标可以查看状态、立即同步、暂停或恢复上报，也可以重新启动 Agent。

需要登录 Windows 后自动运行时，执行：

```powershell
.\NightbugPresence.exe --enable-autostart
.\NightbugPresence.exe --autostart-status
```

这是当前用户的**登录自启动**。以后移动安装目录，应先禁用旧路径，再从新目录启用一次：

```powershell
.\NightbugPresence.exe --disable-autostart
```

日常入口是 Tray。只启动其中一个后台 EXE，无法得到完整的托盘交互体验。

# 个性化

运行参数保存在 `config.json`，但**状态文案和进程映射来自源码中的 `src/config/presenceConfig.ts`**。两者的修改方式不同。

## 修改状态显示内容

例如，把已有的 `coding` 改成自己的文案：

```ts title="src/config/presenceConfig.ts"
coding: {
  icon: "💻",
  title: "正在写代码",
  app: "Visual Studio Code",
  detail: "今天也在修 Bug",
  status: "Online",
  availability: "online",
},
```

`title`、`app`、`detail` 是 Agent 上报时使用的默认内容，进程规则还可以覆盖这些值；前端显示真实 API 返回的正文。`icon`、`illustration`、`status` 和 `availability` 则用于前端表现。只修改网站上的默认正文，不会覆盖旧 Agent 继续上报的文案。

## 添加或修改进程映射

在 `processRules` 中，为已有状态增加程序：

```ts title="src/config/presenceConfig.ts"
{
  state: "coding",
  processes: [
    { process: "Code.exe", app: "Visual Studio Code" },
    { process: "Cursor.exe", app: "Cursor" },
  ],
},
```

通过 Windows 任务管理器的“详细信息”确认实际进程名。这里匹配的是前台程序的可执行文件名，忽略大小写，但需要精确匹配；规则从上往下检查，首次命中即停止。示例程序名仍应以你电脑上的实际值为准。

例如，将 `java.exe` 映射为 Minecraft，会把其他使用同名 Java 进程的前台程序也归到这个状态。规则只能反映进程级信息，需要根据自己的使用习惯取舍。

现有源码把聊天状态写成 `chating`。使用时保持这个 key 一致；如果要改为其他拼写，需要同步修改 `states` 和对应的 `processRules`。

## 新增一种状态

先在 `states` 中增加配置，再在 `processRules` 中引用同一个 key：

```ts title="src/config/presenceConfig.ts"
// 添加到 states：
drawing: {
  icon: "🎨",
  title: "正在画画",
  detail: "慢慢涂两笔",
  status: "Online",
  availability: "online",
},

// 添加到 processRules 数组：
{
  state: "drawing",
  processes: [
    { process: "Photoshop.exe", app: "Adobe Photoshop" },
  ],
},
```

这两段是添加到不同位置的配置片段，不要合并成一个对象。普通状态的 TypeScript 类型和开发接口状态列表会从 `states` 自动派生。

生产 API 目前按字符格式校验状态 key，允许字母、数字、下划线和连字符，长度最多 64；它不使用固定状态白名单。因此新增合法 key 通常无需修改服务端，但**前端必须先具备对应展示配置**，否则读取新状态时可能无法渲染。新增状态可以先发布网站，再更新 Agent。

## 使用自己的插画

例如把图片放到：

```text
public/assets/presence/coding.webp
```

在 `ui` 中打开插画，并在相应状态配置中填写路径：

```ts title="src/config/presenceConfig.ts"
// ui 中：
useIllustration: true,

// coding 中：
illustration: "/assets/presence/coding.webp",
```

文件路径里的 `public` 不会出现在访问 URL 中。原组件在没有插画或图片加载失败时会回退为 emoji。

## 修改后需要重新构建什么

| 修改内容 | 后续操作 |
| --- | --- |
| 图标、插画、底部状态文本、前端计时参数 | 重新构建并部署网站 |
| 状态正文、进程映射、Agent 内置默认值 | 重新构建 Agent，替换两个 EXE；网站也同步使用这份配置 |
| 客户端 `config.json` 或 `token.dat` | 重新启动 Agent |
| 服务端环境变量文件 | 重启 `nightbug-presence` |
| systemd 服务定义 | `daemon-reload` 后重启服务 |
| Nginx 配置 | 检查语法后重载 Nginx |

更新 Agent 前先退出 Tray，保留已有的 `config.json` 和 `token.dat`，替换两个 EXE 后再启动。已经存在的 `config.json` 会优先于新的内置默认值；想修改现有安装的检测间隔，应直接修改 JSON。

前端的 `offlineTimeout` 应明显大于 Agent 的 `heartbeatInterval`。默认 90 秒对 30 秒留出了网络波动空间；如果把心跳改为 60 秒，也要相应增加离线阈值。

# 不是 Astro 网站如何接入

`Presence.astro` 是 Astro 组件，不能直接塞进普通 HTML 页面。不过，服务端和 Windows Agent 不依赖你的网站框架，你只需要按同样的字段读取 GET API。

下面是一份可以放进普通页面的最小展示示例，默认仍走同域 API。先在页面中加入容器和脚本引用：

```html
<div id="presence" aria-live="polite">正在读取状态……</div>
<script src="/presence.js" defer></script>
```

再把下面的 JavaScript 保存为网站根路径可访问的 `presence.js`（使用 Astro 时可放在 `public/presence.js`）：

```javascript
  const panel = document.querySelector("#presence");
  let lastPresence;
  let loading = false;

  function renderPresence() {
    if (!lastPresence) return;

    if (
      lastPresence.state === "offline" ||
      Date.now() - lastPresence.updatedAt > 90_000
    ) {
      panel.textContent = "🌙 当前离线";
      return;
    }

    const parts = [lastPresence.title, lastPresence.app, lastPresence.detail];
    if (typeof lastPresence.since === "number") {
      const minutes = Math.max(
        1,
        Math.floor((Date.now() - lastPresence.since) / 60_000)
      );
      parts.push(`${minutes} 分钟`);
    }
    panel.textContent = parts.filter(Boolean).join(" · ");
  }

  async function refreshPresence() {
    if (document.hidden || loading) return;
    loading = true;
    try {
      const response = await fetch("/api/presence/", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      lastPresence = await response.json();
    } catch {
      if (!lastPresence) panel.textContent = "暂时无法读取状态";
    } finally {
      loading = false;
      renderPresence();
    }
  }

  refreshPresence();
  setInterval(refreshPresence, 30_000);
  setInterval(renderPresence, 15_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshPresence();
  });
```

这里用 `textContent` 写入内容。你可以在此基础上改成自己的卡片，或用 React、Vue、Svelte 等框架重新实现；上报端和服务端都可以继续沿用。

# 上线前验证

在部署了前端的网站里打开开发者工具，检查 GET 请求是否返回 JSON。然后在 Windows 上打开一个已配置的程序，并保持它为前台窗口。

默认检测间隔是 5 秒，前端轮询间隔是 30 秒，所以网页不会在切换窗口的同一瞬间变化。也可以用托盘的“立即同步”并刷新网页来快速确认。

部署成功后，应能观察到：

- 公网 GET 返回 `200` 和 `Cache-Control: no-store`。
- 未认证的 POST 返回 `401`，正确 Token 的 POST 返回 `200`。
- Agent 运行时，GET 数据中的 `updatedAt` 随心跳持续刷新。
- 切换到已配置的前台程序时，网页显示相应状态。
- 持续不操作超过 Idle 阈值后，网页显示暂时离开。
- 退出 Tray 或暂停上报后，超过 90 秒加上本地刷新等待时间，网页转为 Offline。
- 重新启动或恢复 Agent 后，网页在下一次读取时恢复显示。

完成这些检查后，再执行网站项目自己的诊断和构建流程。Firefly 对应的是：

```powershell
pnpm check
pnpm type-check
pnpm build
```

将网站构建产物部署到原来的静态托管位置即可。`pnpm build` 不会替你安装 Linux API 服务或启动 Windows Agent，这三个部分要分别完成。

# 常见问题与日常维护

| 现象 | 先检查什么 |
| --- | --- |
| GET 返回网页或 `404` | 请求路径是否正确，Nginx 配置是否属于当前域名且已经加载 |
| 公网 `502`，本机 GET 也失败 | systemd 服务是否运行，Node 路径和依赖是否正确 |
| 公网 `502`，本机 GET 正常 | Nginx 的代理地址及对应的站点配置 |
| POST 返回 `401` | Agent 与服务器 Token 是否一致，环境变量是否覆盖了 `token.dat` |
| POST 返回 `400` | JSON 格式、`state` 和非空 `title` 是否符合要求 |
| API 更新正常，网页总是旧状态 | CDN 缓存、组件的 `USE_MOCK_PRESENCE`、GET 地址和浏览器控制台 |
| 程序被归为普通 Online | 实际前台进程名是否匹配，映射修改后是否重新构建 Agent |
| 新增状态后页面报错 | 网站是否已经部署包含该状态的配置 |
| 改了 JSON 却没有生效 | Worker 是否已重启，是否存在更高优先级环境变量 |
| 状态偶尔误判离线 | 心跳与离线阈值是否匹配，服务器与电脑时间是否准确 |

服务端日志和状态可以这样查看：

```bash
sudo journalctl -u nightbug-presence -n 100 --no-pager
sudo systemctl status nightbug-presence --no-pager
curl -i http://127.0.0.1:8765/api/presence/
```

客户端则先检查：

```powershell
.\NightbugPresence.exe --show-config
.\NightbugPresence.exe --autostart-status
```

更换 Token 时，先修改服务端环境变量并重启服务，再在 Windows 端重新执行 `--set-token`，最后重新启动 Agent。

想暂时停止显示在线状态，可以退出 Tray 或暂停上报；前端会在超时后显示离线。准备停用整套功能时，先移除网站组件，再禁用客户端登录自启，并停止、禁用服务端：

```bash
sudo systemctl disable --now nightbug-presence
```

服务器更新、宝塔部署和完整卸载的详细说明，可以在源码的 `server/presence/` 目录中找到：

- `nightbug-presence-server-deployment-guide-merged.md`
- `nightbug-presence-bt-panel-deployment-guide-merged.md`
- `presence-windows-agent-deployment-guide.md`

装好以后，访客看到的仍然只是一块很小的状态卡片。它不需要透露你正在处理哪份文件，只用一句“正在写代码”或“稍后回来”，就能在这个静态页面上展示你的动态喔。
