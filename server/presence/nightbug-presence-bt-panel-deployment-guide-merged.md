# Presence 服务：宝塔面板部署、运维与卸载指南

> 本文档用于在 **Ubuntu 24.04 + 宝塔面板 + Nginx** 环境中部署 Nightbug Presence 服务。
>
> 示例域名统一使用 `example.com`，systemd 服务名保持 `nightbug-presence`。
>
> Presence API：
>
> - `GET /api/presence/`
> - `POST /api/presence/update/`
>
> Fastify 仅监听 `127.0.0.1:8765`。

> [!NOTE]
> 宝塔面板不同版本、不同主题以及国内版 / 国际版的菜单名称可能略有差异。本文同时给出“面板操作路径”和必要的终端命令。  
> Presence 本身仍是一个独立的 Node.js/systemd 服务；宝塔主要负责 **网站、域名、SSL、Nginx 与日志**。系统用户、目录权限、环境变量、systemd 服务等步骤仍建议通过终端完成。

---

## 1. 架构与部署约定

**服务架构与职责划分**

```text
Windows Presence Agent
        │
        │ HTTPS + Bearer Token
        ▼
https://example.com/api/presence/update/
        │
        ▼
      Nginx
   （宝塔管理）
        │
        ▼
127.0.0.1:8765
        │
        ▼
 Fastify Presence API
        │
        ▼
/var/lib/nightbug-presence/presence.json
```

浏览器读取状态：

```text
Browser
  │ GET /api/presence/
  ▼
Nginx
  ▼
Fastify Presence API
```

对外接口边界：

```text
Windows Agent
→ POST https://example.com/api/presence/update/
→ 需要 Bearer Token

网站前端
→ GET https://example.com/api/presence/
→ 不需要、也不应知道 Bearer Token
```

职责划分：

```text
宝塔面板
├─ 网站
├─ 域名
├─ SSL
├─ Nginx
└─ 访问/错误日志

systemd
└─ 守护 Node Presence 服务

Fastify
├─ GET Presence
├─ POST Presence
├─ Bearer Token
└─ JSON 持久化
```

**前置环境**

推荐：

```text
Ubuntu 24.04 LTS
宝塔面板
Nginx
Node.js 24 LTS
npm
pnpm
systemd
OpenSSL
```

检查：

```bash
node -v
npm -v
pnpm -v
nginx -v
systemctl --version
openssl version
```

生产目录约定：

```text
/opt/nightbug-presence
/var/lib/nightbug-presence
/etc/nightbug-presence.env
/etc/systemd/system/nightbug-presence.service
```

**推荐的宝塔配置方式**

本项目推荐：

```text
宝塔网站
    ↓
主站 Nginx 配置
    ↓
include extension/example.com/*.conf
    ↓
presence.conf
    ↓
127.0.0.1:8765
```

优点：

- Presence 与主站配置解耦
- 更新主站时不容易误删
- 卸载时只需要删除 `presence.conf`
- 不依赖宝塔图形化反向代理自动生成复杂规则

**推荐目录结构**

```text
/opt/nightbug-presence/
├── dist/
├── node_modules/
├── package.json
└── ...

/var/lib/nightbug-presence/
└── presence.json

/etc/
└── nightbug-presence.env

/etc/systemd/system/
└── nightbug-presence.service

/www/server/panel/vhost/nginx/extension/example.com/
└── presence.conf
```

**推荐权限**

程序目录：

```text
root:root
0755
```

状态目录：

```text
presence:presence
0750
```

环境变量：

```text
root:root
0600
```

服务进程：

```text
User=presence
Group=presence
```

---

## 2. 准备网站与运行环境

**创建或确认网站**

如果站点已经存在，跳过本节。

进入：

```text
宝塔面板
→ 网站
→ 添加站点
```

填写：

```text
域名：example.com
根目录：按实际静态站点目录填写
PHP：纯静态 / 不使用 PHP
数据库：不需要
```

然后：

```text
网站
→ example.com
→ 设置
→ 域名管理
```

确认域名已经绑定。

**配置 DNS**

在 DNS 服务商处设置：

```text
记录类型：A
主机记录：@
记录值：<SERVER_IP>
```

如果实际使用子域名，例如：

```text
inn.example.com
```

则：

```text
记录类型：A
主机记录：inn
记录值：<SERVER_IP>
```

Windows 检查：

```powershell
Resolve-DnsName example.com
```

或：

```powershell
nslookup example.com
```

**配置 SSL**

进入：

```text
宝塔面板
→ 网站
→ example.com
→ SSL
```

域名已经正常解析后，可申请 Let's Encrypt。

建议启用：

```text
强制 HTTPS
```

确认：

```text
https://example.com
```

浏览器无证书警告。

---

## 3. 构建并上传 Presence

推荐将**源码与 lockfile 放到 Linux 服务器，在 Linux 环境中安装依赖、构建并生成 production release**。宝塔只负责提供终端或文件管理入口，构建本身仍按普通 Linux 环境完成。

> [!TIP]
> 生产运行目录 `/opt/nightbug-presence` 只存放最终 Release；源码建议临时放在 `/tmp/Firefly`，不要把源码工作目录和正式运行目录混在一起。

**将源码上传到服务器**

推荐从 Windows PowerShell 使用 `scp`：

```powershell
scp -r .\Firefly ubuntu@<SERVER_IP>:/tmp/
```

也可以在宝塔中进入：

```text
宝塔面板
→ 文件
→ /tmp
→ 上传
```

如果项目通过 Git 管理，也可以直接在宝塔终端或 SSH 中执行：

```bash
cd /tmp
git clone <YOUR_REPOSITORY_URL> Firefly
```

进入项目：

```bash
cd /tmp/Firefly
```

如果目录中带有 Windows 或其他平台生成的 `node_modules`，不要直接复用：

```bash
rm -rf node_modules
find . -type d -name node_modules -prune -exec rm -rf {} +
```

**在 Linux 上安装依赖并构建**

```bash
pnpm install --frozen-lockfile
pnpm presence:server:build

rm -rf /tmp/nightbug-presence-release

pnpm --filter @nightbug/presence \
  --prod \
  deploy \
  /tmp/nightbug-presence-release
```

确认：

```bash
ls -l /tmp/nightbug-presence-release/dist/index.js
```

### 可选：Windows 本地生成 Release

如果依赖均为跨平台 JavaScript 包，也可以继续在 Windows 本地构建：

```powershell
pnpm install
pnpm presence:server:build
Remove-Item -Recurse -Force .\release-presence -ErrorAction SilentlyContinue
pnpm --filter @nightbug/presence --prod deploy .\release-presence
Test-Path .\release-presence\dist\index.js
scp -r .\release-presence ubuntu@<SERVER_IP>:/tmp/nightbug-presence-release
```

也可以通过宝塔文件管理上传到 `/tmp`，但大量 `node_modules` 文件不适合通过浏览器上传。

> [!NOTE]
> 如果 Windows Release 在 Linux 上出现 `MODULE_NOT_FOUND`、`ERR_DLOPEN_FAILED`、`Exec format error`、模块加载失败或 systemd 启动后立即退出，直接改用前面的 Linux 原生构建流程。不要直接复制 Windows 项目中的 `node_modules`。

**部署配置文件**

后面的环境变量、systemd 与 Nginx 配置都可以直接在宝塔终端中通过命令创建，因此不要求必须预先上传模板。

如果希望使用仓库中的现成模板，也可以上传：

```powershell
scp .\deploy\presence\nightbug-presence.service ubuntu@<SERVER_IP>:/tmp/nightbug-presence.service
scp .\deploy\presence\nightbug-presence.env.example ubuntu@<SERVER_IP>:/tmp/nightbug-presence.env.example
```

## 4. 安装并启动 Presence 服务

**创建系统用户与目录**

进入：

```text
宝塔面板
→ 终端
```

或 SSH 登录。

创建用户：

```bash
sudo useradd   --system   --home /nonexistent   --shell /usr/sbin/nologin   presence
```

如果用户已经存在可忽略。

检查：

```bash
id presence
```

创建程序目录：

```bash
sudo install -d   -o root   -g root   -m 0755   /opt/nightbug-presence
```

创建状态目录：

```bash
sudo install -d   -o presence   -g presence   -m 0750   /var/lib/nightbug-presence
```

检查：

```bash
ls -ld /opt/nightbug-presence
ls -ld /var/lib/nightbug-presence
```

**安装 Release**

清空旧程序：

```bash
sudo rm -rf /opt/nightbug-presence/*
```

复制：

```bash
sudo cp -a   /tmp/nightbug-presence-release/.   /opt/nightbug-presence/
```

设置所有权：

```bash
sudo chown -R root:root /opt/nightbug-presence
```

确认入口：

```bash
ls -l /opt/nightbug-presence/dist/index.js
```

**生成生产 Token**

推荐生成 32 字节随机 Token：

```bash
openssl rand -hex 32
```

如果系统没有 OpenSSL，也可以：

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Token 需要同时配置在 Linux Server 与 Windows Agent，两边必须完全一致。

不要：

```text
提交到 Git
写进前端
发给第三方
```

建议保存到密码管理器。

**创建环境变量文件**

推荐在：

```text
宝塔面板
→ 终端
```

直接执行：

```bash
sudo install -m 600 /dev/null /etc/nightbug-presence.env

sudo tee /etc/nightbug-presence.env > /dev/null <<'EOF_ENV'
PRESENCE_TOKEN=替换为真实随机token
PRESENCE_HOST=127.0.0.1
PRESENCE_PORT=8765
PRESENCE_STATE_FILE=/var/lib/nightbug-presence/presence.json
EOF_ENV
```

然后：

```bash
sudo chown root:root /etc/nightbug-presence.env
sudo chmod 600 /etc/nightbug-presence.env
sudo ls -l /etc/nightbug-presence.env
```

如果已经上传 env 示例，也可以继续采用：

```bash
sudo cp /tmp/nightbug-presence.env.example /etc/nightbug-presence.env
sudo nano /etc/nightbug-presence.env
```

**创建 systemd 服务**

推荐直接在终端创建：

```bash
sudo tee /etc/systemd/system/nightbug-presence.service > /dev/null <<'EOF_SERVICE'
[Unit]
Description=Nightbug Presence Service
After=network.target

[Service]
Type=simple
User=presence
Group=presence
WorkingDirectory=/opt/nightbug-presence
EnvironmentFile=/etc/nightbug-presence.env
ExecStart=/usr/bin/node /opt/nightbug-presence/dist/index.js
Restart=on-failure
RestartSec=5

NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/nightbug-presence
UMask=0077

[Install]
WantedBy=multi-user.target
EOF_SERVICE
```

如果已经上传仓库里的 service 文件，也可以：

```bash
sudo cp /tmp/nightbug-presence.service /etc/systemd/system/nightbug-presence.service
```

随后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nightbug-presence
sudo systemctl status nightbug-presence
```

应看到：

```text
Active: active (running)
```

## 5. 配置 Nginx 与公网访问

### 在宝塔中配置 Nginx

推荐两种方式：

```text
A. 站点配置文件
B. 独立 extension/presence.conf
```

对于本项目，更推荐 **B**。

**直接编辑站点配置**

进入：

```text
宝塔面板
→ 网站
→ example.com
→ 设置
→ 配置文件
```

在当前 `server { ... }` 内加入：

```nginx
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

注意：

```nginx
proxy_pass http://127.0.0.1:8765;
```

末尾不要额外加 `/`。

**推荐：独立 extension 配置**

如果主站已经存在类似：

```nginx
include /www/server/panel/vhost/nginx/extension/example.com/*.conf;
```

进入：

```text
宝塔面板
→ 文件
→ /www/server/panel/vhost/nginx/extension/example.com/
```

新建：

```text
presence.conf
```

可以直接在宝塔文件编辑器中写入下面的配置；也可以在宝塔终端执行：

```bash
sudo mkdir -p /www/server/panel/vhost/nginx/extension/example.com

sudo tee /www/server/panel/vhost/nginx/extension/example.com/presence.conf > /dev/null <<'EOF_NGINX'
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
EOF_NGINX
```

面板文件编辑器中对应的内容为：

```nginx
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

优点：

```text
主站配置
  ↓ include
Presence 独立配置
```

以后卸载时只需删除 `presence.conf`。

**是否使用宝塔“反向代理”图形界面**

部分宝塔版本提供：

```text
网站
→ example.com
→ 反向代理
```

理论上可以设置：

```text
目标：http://127.0.0.1:8765
发送域名：$host
```

但本项目还需要：

```text
精确限制 API 路径
client_max_body_size 16k
Cache-Control no-store
```

因此更推荐直接维护 Nginx 配置，而不是完全依赖图形界面生成规则。

**检查并重载 Nginx**

终端执行：

```bash
sudo nginx -t
```

必须看到类似：

```text
syntax is ok
test is successful
```

然后：

```bash
sudo systemctl reload nginx
```

宝塔中也可以：

```text
软件商店
→ Nginx
→ 重载配置
```

优先“重载”，无必要不要“重启”。

**DNS 尚未生效时测试**

```bash
curl -k -i   -H "Host: example.com"   https://127.0.0.1/api/presence/
```

如果返回 200，则：

```text
Nginx
→ proxy_pass
→ Fastify
```

已经正常。

---

## 6. 验证部署

**测试 Fastify 本机 API**

GET：

```bash
curl -i http://127.0.0.1:8765/api/presence/
```

预期：

```text
200 OK
Cache-Control: no-store
```

测试无认证 POST：

```bash
curl -i   -X POST   http://127.0.0.1:8765/api/presence/update/   -H 'Content-Type: application/json; charset=utf-8'   --data '{"state":"coding","title":"正在写代码"}'
```

应返回：

```text
401 Unauthorized
```

**公网 GET**

```bash
curl -i https://example.com/api/presence/
```

预期：

```text
200
Cache-Control: no-store
```

**公网无 Token POST**

```bash
curl -i   -X POST   https://example.com/api/presence/update/   -H 'Content-Type: application/json; charset=utf-8'   --data '{"state":"coding","title":"正在写代码"}'
```

应返回：

```text
401 Unauthorized
```

**公网正确 Token POST**

进入 root shell：

```bash
sudo bash
```

加载：

```bash
set -a
source /etc/nightbug-presence.env
set +a
```

发送：

```bash
curl -i   -X POST   https://example.com/api/presence/update/   -H "Authorization: Bearer $PRESENCE_TOKEN"   -H 'Content-Type: application/json; charset=utf-8'   --data '{"state":"gaming","title":"正在玩游戏","app":"Minecraft","detail":"游戏时间"}'
```

读取：

```bash
curl https://example.com/api/presence/
```

退出：

```bash
exit
```

**检查端口安全**

```bash
sudo ss -lntp | grep 8765
```

正确：

```text
127.0.0.1:8765
```

错误：

```text
0.0.0.0:8765
```

如果监听公网，检查：

```env
PRESENCE_HOST=127.0.0.1
```

然后：

```bash
sudo systemctl restart nightbug-presence
```

---

## 7. 日常运维与更新

### 查看日志

进入：

```text
宝塔面板
→ 网站
→ example.com
→ 日志
```

重点查看：

```text
访问日志
错误日志
```

如果出现：

```text
502 Bad Gateway
```

先检查：

```bash
sudo systemctl status nightbug-presence
curl http://127.0.0.1:8765/api/presence/
```

**Presence 日志**

宝塔终端执行：

```bash
sudo journalctl -u nightbug-presence -f
```

最近 100 条：

```bash
sudo journalctl   -u nightbug-presence   -n 100   --no-pager
```

### 更新 Presence 服务

本地重新构建：

```powershell
pnpm install
pnpm presence:server:build

Remove-Item -Recurse -Force .\release-presence -ErrorAction SilentlyContinue

pnpm --filter @nightbug/presence   --prod   deploy   .\release-presence
```

上传：

```powershell
scp -r .\release-presence ubuntu@<SERVER_IP>:/tmp/nightbug-presence-release-new
```

服务器停止：

```bash
sudo systemctl stop nightbug-presence
```

可选备份：

```bash
sudo rm -rf /opt/nightbug-presence.backup
sudo cp -a /opt/nightbug-presence /opt/nightbug-presence.backup
```

替换：

```bash
sudo rm -rf /opt/nightbug-presence/*
sudo cp -a /tmp/nightbug-presence-release-new/. /opt/nightbug-presence/
sudo chown -R root:root /opt/nightbug-presence
```

启动：

```bash
sudo systemctl start nightbug-presence
```

验证：

```bash
sudo systemctl status nightbug-presence
curl http://127.0.0.1:8765/api/presence/
```

**回滚**

停止：

```bash
sudo systemctl stop nightbug-presence
```

删除新版本：

```bash
sudo rm -rf /opt/nightbug-presence
```

恢复：

```bash
sudo mv   /opt/nightbug-presence.backup   /opt/nightbug-presence
```

启动：

```bash
sudo systemctl start nightbug-presence
```

**修改 Token**

生成新 Token：

```bash
openssl rand -hex 32
```

编辑：

```bash
sudo nano /etc/nightbug-presence.env
```

修改：

```env
PRESENCE_TOKEN=新token
```

重启：

```bash
sudo systemctl restart nightbug-presence
```

Windows Agent 也必须同步修改。

**修改端口**

编辑：

```bash
sudo nano /etc/nightbug-presence.env
```

例如：

```env
PRESENCE_PORT=9876
```

同步修改 Nginx：

```nginx
proxy_pass http://127.0.0.1:9876;
```

然后：

```bash
sudo systemctl restart nightbug-presence
sudo nginx -t
sudo systemctl reload nginx
```

**清空状态**

```bash
sudo systemctl stop nightbug-presence
sudo rm -f /var/lib/nightbug-presence/presence.json
sudo systemctl start nightbug-presence
```

服务会恢复默认 offline 状态。

---

## 8. 故障排查

### systemd 故障排查

最近日志：

```bash
sudo journalctl   -u nightbug-presence   -n 100   --no-pager
```

实时日志：

```bash
sudo journalctl -u nightbug-presence -f
```

常见问题：

**缺少 Token**

检查：

```bash
sudo cat /etc/nightbug-presence.env
```

**找不到入口**

```bash
ls -l /opt/nightbug-presence/dist/index.js
```

**状态目录不可写**

```bash
ls -ld /var/lib/nightbug-presence
```

修复：

```bash
sudo chown -R presence:presence /var/lib/nightbug-presence
sudo chmod 750 /var/lib/nightbug-presence
```

### 宝塔环境常见问题


**保存 Nginx 配置失败**

执行：

```bash
sudo nginx -t
```

常见原因：

```text
location 重复
括号缺失
include 路径错误
proxy_pass 拼写错误
```

**502 Bad Gateway**

```bash
sudo systemctl status nightbug-presence
curl http://127.0.0.1:8765/api/presence/
```

本机 API 也失败，说明问题在 Presence，不在宝塔。

**404**

检查：

```text
网站
→ example.com
→ 配置文件
```

确认 Presence `location` 在正确的 `server {}` 中。

如果使用 extension 文件，确认主配置确实有：

```nginx
include /www/server/panel/vhost/nginx/extension/example.com/*.conf;
```

**API 被缓存**

```bash
curl -I https://example.com/api/presence/
```

应有：

```text
Cache-Control: no-store
```

**401 Unauthorized**

通常说明代理链路已经通了，只是 Token 不匹配。

检查 Agent 的：

```text
PRESENCE_TOKEN
```

与：

```text
/etc/nightbug-presence.env
```

是否一致。

---

## 9. 完整卸载

**卸载顺序**

建议：

```text
1. 停止 systemd
2. 禁用开机启动
3. 删除 systemd service
4. 删除宝塔 Nginx Presence 配置
5. nginx -t
6. reload nginx
7. 删除程序目录
8. 删除环境变量
9. 删除状态目录
10. 删除 presence 用户
11. 清理临时文件
```

**停止并禁用服务**

```bash
sudo systemctl stop nightbug-presence
sudo systemctl disable nightbug-presence
```

**删除 systemd service**

```bash
sudo rm -f   /etc/systemd/system/nightbug-presence.service
```

然后：

```bash
sudo systemctl daemon-reload
sudo systemctl reset-failed
```

### 删除 Nginx Presence 配置


**独立 extension 文件**

进入：

```text
宝塔面板
→ 文件
→ /www/server/panel/vhost/nginx/extension/example.com/
```

删除：

```text
presence.conf
```

也可执行：

```bash
sudo rm -f   /www/server/panel/vhost/nginx/extension/example.com/presence.conf
```

**如果直接写进站点配置**

进入：

```text
网站
→ example.com
→ 设置
→ 配置文件
```

删除：

```nginx
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

保存。

**检查并重载 Nginx**

```bash
sudo nginx -t
```

成功后：

```bash
sudo systemctl reload nginx
```

或：

```text
宝塔
→ 软件商店
→ Nginx
→ 重载配置
```

**删除程序、配置与状态数据**

```bash
sudo rm -rf /opt/nightbug-presence
```

```bash
sudo rm -f /etc/nightbug-presence.env
```

直接删除：

```bash
sudo rm -rf /var/lib/nightbug-presence
```

如需备份：

```bash
sudo cp   /var/lib/nightbug-presence/presence.json   ~/presence.json.backup
```

再删除状态目录。

**删除 presence 系统用户**

```bash
sudo userdel presence
```

检查：

```bash
id presence
```

应提示不存在。

**清理临时文件**

```bash
sudo rm -rf /tmp/nightbug-presence-release
sudo rm -rf /tmp/nightbug-presence-release-new
sudo rm -f /tmp/nightbug-presence.service
sudo rm -f /tmp/nightbug-presence.env.example
```

**是否删除宝塔网站**

如果 Presence 只是现有网站中的一个 API：

> [!WARNING]
> **不要删除整个站点。**

只删除 Presence 的 Nginx 配置即可。

只有整个站点都不再需要时，才考虑：

```text
宝塔
→ 网站
→ 删除站点
```

删除前确认网站文件、SSL、日志等是否需要保留。

**是否卸载 Node.js**

如果服务器还有其他 Node 服务，不要卸载。

如果确认 Node.js 只用于 Presence：

```bash
sudo apt remove nodejs
sudo apt autoremove
```

**卸载后检查**

检查服务：

```bash
systemctl status nightbug-presence
```

检查端口：

```bash
sudo ss -lntp | grep 8765
```

正常应无输出。

检查程序目录：

```bash
ls /opt/nightbug-presence
```

应不存在。

检查 Nginx：

```bash
sudo nginx -t
```

最后：

```bash
sudo systemctl reload nginx
```

---

## 10. 检查清单与后续说明

### 部署完成检查清单

```text
[ ] 宝塔网站存在
[ ] 域名已绑定
[ ] DNS 正常
[ ] SSL 正常
[ ] Node.js 正常
[ ] pnpm 正常
[ ] presence 用户存在
[ ] /opt/nightbug-presence/dist/index.js 存在
[ ] /var/lib/nightbug-presence 属于 presence
[ ] /etc/nightbug-presence.env 权限为 600
[ ] systemd Active: active (running)
[ ] 127.0.0.1:8765 GET 200
[ ] 无 Token POST 401
[ ] 正确 Token POST 200
[ ] 宝塔 Nginx Presence 配置已安装
[ ] nginx -t 成功
[ ] Nginx 已 reload
[ ] 公网 GET 200
[ ] Cache-Control: no-store
[ ] 中文 JSON 正常
[ ] presence.json 可持久化
[ ] 服务重启后状态恢复
[ ] 8765 仅监听 127.0.0.1
```

### 卸载完成检查清单

```text
[ ] nightbug-presence 已停止
[ ] 已禁用开机启动
[ ] systemd service 已删除
[ ] 宝塔 Presence Nginx 配置已删除
[ ] nginx -t 成功
[ ] Nginx 已 reload
[ ] /opt/nightbug-presence 已删除
[ ] /etc/nightbug-presence.env 已删除
[ ] /var/lib/nightbug-presence 已删除或备份
[ ] presence 用户已删除
[ ] 8765 不再监听
[ ] 原主站仍正常
```

### 结语

建议长期保持：

```text
宝塔
→ 管理网站、域名、SSL、Nginx

systemd
→ 管理 Presence 服务生命周期

Fastify
→ API、认证、状态持久化

Windows Agent
→ 状态采集并通过 HTTPS 上报
```

这样即使以后更新 Astro、调整主题或修改宝塔站点设置，Presence 服务仍然可以独立维护、更新和卸载。
