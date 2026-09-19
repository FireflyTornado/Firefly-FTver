# Presence 服务：服务器部署、运维与卸载指南

> 本文档用于在 Ubuntu 24.04 服务器上部署基于 Node.js + Fastify + systemd + Nginx 的 Presence 服务。
>
> 示例域名统一使用：`example.com`
>
> systemd 服务名保持：`nightbug-presence`

---

## 1. 架构与部署约定

**服务架构**

最终链路如下：

```text
Windows Presence Agent
        │
        │ HTTPS + Bearer Token
        ▼
https://example.com/api/presence/update/
        │
        ▼
      Nginx
        │
        │ proxy_pass
        ▼
127.0.0.1:8765
        │
        ▼
 Fastify Presence API
        │
        ▼
/var/lib/nightbug-presence/presence.json
```

前端读取状态时：

```text
Browser
   │
   │ GET /api/presence/
   ▼
 Nginx
   │
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

Presence 服务只监听：

```text
127.0.0.1:8765
```

不会直接暴露到公网。

**服务器环境**

推荐环境：

```text
Ubuntu 24.04 LTS
Node.js 24 LTS
npm
pnpm
Nginx
systemd
OpenSSL
```

检查版本：

```bash
node -v
npm -v
pnpm -v
nginx -v
systemctl --version
openssl version
```

示例：

```text
Node.js v24.x
npm 11.x
pnpm 12.x
Nginx 1.30.x
systemd 255
```

**推荐目录结构**

最终服务器：

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

职责划分：

```text
/opt/nightbug-presence
    程序文件，只读

/var/lib/nightbug-presence
    可变状态数据

/etc/nightbug-presence.env
    Token 和运行配置

/etc/systemd/system
    常驻服务定义

Nginx extension
    API 反向代理
```

**权限模型**

程序：

```text
root:root
0755 /opt/nightbug-presence
```

状态目录：

```text
presence:presence
0750 /var/lib/nightbug-presence
```

环境变量：

```text
root:root
0600 /etc/nightbug-presence.env
```

Presence 进程：

```text
User=presence
Group=presence
```

服务不需要 root 权限。

---

## 2. 准备运行环境

**安装 Node.js 与 pnpm**

如果服务器已经安装，可跳过本节。

更新系统：

```bash
sudo apt update
sudo apt install -y curl ca-certificates
```

安装 Node.js 24：

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x -o nodesource_setup.sh
sudo -E bash nodesource_setup.sh
sudo apt install -y nodejs
```

检查：

```bash
node -v
npm -v
```

安装 pnpm：

```bash
sudo npm install -g corepack
sudo corepack enable
corepack install --global pnpm@latest
```

检查：

```bash
pnpm -v
which node
which pnpm
```

典型路径：

```text
/usr/bin/node
/usr/bin/pnpm
```

---

## 3. 构建并上传 Presence

推荐将**源码与 lockfile 上传到 Linux 服务器，在 Linux 环境中安装依赖、构建并生成 production release**。这样可以避免直接复用 Windows `node_modules` 或 Windows 构建产物可能带来的跨平台依赖、原生二进制、符号链接和权限问题。

> [!TIP]
> 生产运行目录 `/opt/nightbug-presence` 只存放最终 Release，不要与源码构建目录混用。源码可以临时放在 `/tmp/Firefly`，部署完成后再删除。

**将源码放到 Linux 构建目录**

从 Windows PowerShell 上传完整项目：

```powershell
scp -r .\Firefly ubuntu@<SERVER_IP>:/tmp/
```

如果项目通过 Git 管理，也可以在服务器获取源码：

```bash
cd /tmp
git clone <YOUR_REPOSITORY_URL> Firefly
```

进入项目：

```bash
cd /tmp/Firefly
```

如果源码目录中带有其他平台生成的 `node_modules`，不要直接复用：

```bash
rm -rf node_modules
find . -type d -name node_modules -prune -exec rm -rf {} +
```

检查 Linux 构建环境：

```bash
node -v
npm -v
pnpm -v
uname -m
```

**安装依赖并构建**

```bash
pnpm install --frozen-lockfile
pnpm presence:server:build
```

确认编译入口：

```bash
ls -l server/presence/dist/index.js
```

生成 production release：

```bash
rm -rf /tmp/nightbug-presence-release

pnpm --filter @nightbug/presence \
  --prod \
  deploy \
  /tmp/nightbug-presence-release
```

检查：

```bash
ls -l /tmp/nightbug-presence-release/dist/index.js
```

### 可选：在 Windows 本地生成 Release

如果项目依赖均为跨平台 JavaScript 包，也可以在 Windows 本地生成 Release 后直接上传。这个方法步骤更少，但如果出现 `MODULE_NOT_FOUND`、`ERR_DLOPEN_FAILED`、`Exec format error`、模块加载失败或 systemd 启动后立即退出，应改回前面的 Linux 原生构建流程。

```powershell
pnpm install
pnpm presence:server:build
Remove-Item -Recurse -Force .\release-presence -ErrorAction SilentlyContinue
pnpm --filter @nightbug/presence --prod deploy .\release-presence
Test-Path .\release-presence\dist\index.js
scp -r .\release-presence ubuntu@<SERVER_IP>:/tmp/nightbug-presence-release
```

> [!NOTE]
> 不要把 Windows 项目目录里的 `node_modules` 直接复制到 Linux 服务器。这里上传的是 `pnpm deploy` 生成的生产 Release；一旦出现跨平台兼容问题，仍以 Linux 原生构建为准。

**部署配置文件**

后续环境变量、systemd 和 Nginx 配置都可以直接在服务器通过命令创建，因此不要求必须提前上传模板文件。

如果希望继续使用仓库中已有模板，也可以上传：

```powershell
scp .\deploy\presence\nightbug-presence.service ubuntu@<SERVER_IP>:/tmp/nightbug-presence.service
scp .\deploy\presence\nginx-presence.conf ubuntu@<SERVER_IP>:/tmp/nginx-presence.conf
scp .\deploy\presence\nightbug-presence.env.example ubuntu@<SERVER_IP>:/tmp/nightbug-presence.env.example
```

登录服务器：

```powershell
ssh ubuntu@<SERVER_IP>
```

## 4. 安装并启动 Presence 服务

**创建专用系统用户**

创建 `presence` 系统用户：

```bash
sudo useradd \
  --system \
  --home /nonexistent \
  --shell /usr/sbin/nologin \
  presence
```

如果提示用户已经存在，可以忽略。

检查：

```bash
id presence
```

**创建程序目录和状态目录**

创建程序安装目录：

```bash
sudo install -d \
  -o root \
  -g root \
  -m 0755 \
  /opt/nightbug-presence
```

创建状态数据目录：

```bash
sudo install -d \
  -o presence \
  -g presence \
  -m 0750 \
  /var/lib/nightbug-presence
```

检查：

```bash
ls -ld /opt/nightbug-presence
ls -ld /var/lib/nightbug-presence
```

预期：

```text
root     root     /opt/nightbug-presence
presence presence /var/lib/nightbug-presence
```

**安装 Presence Release**

清理旧版本：

```bash
sudo rm -rf /opt/nightbug-presence/*
```

复制 release：

```bash
sudo cp -a \
  /tmp/nightbug-presence-release/. \
  /opt/nightbug-presence/
```

设置程序目录所有权：

```bash
sudo chown -R root:root /opt/nightbug-presence
```

检查：

```bash
find /opt/nightbug-presence -maxdepth 2 -type f | sort | head -50
```

确认入口文件：

```bash
ls -l /opt/nightbug-presence/dist/index.js
```

**生成 Presence Token**

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

**创建生产环境变量**

推荐直接通过命令创建：

```bash
sudo install -m 600 /dev/null /etc/nightbug-presence.env

sudo tee /etc/nightbug-presence.env > /dev/null <<'EOF_ENV'
PRESENCE_TOKEN=替换为真实随机token
PRESENCE_HOST=127.0.0.1
PRESENCE_PORT=8765
PRESENCE_STATE_FILE=/var/lib/nightbug-presence/presence.json
EOF_ENV
```

设置并检查权限：

```bash
sudo chown root:root /etc/nightbug-presence.env
sudo chmod 600 /etc/nightbug-presence.env
sudo ls -l /etc/nightbug-presence.env
```

如果已经上传仓库中的环境变量模板，也可以继续采用：

```bash
sudo cp /tmp/nightbug-presence.env.example /etc/nightbug-presence.env
sudo nano /etc/nightbug-presence.env
```

**创建 systemd 服务**

推荐直接在服务器创建：

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

如果已经上传仓库中的 service 文件，也可以：

```bash
sudo cp /tmp/nightbug-presence.service /etc/systemd/system/nightbug-presence.service
```

随后执行：

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

如果站点主配置已经 include：

```nginx
include /www/server/panel/vhost/nginx/extension/example.com/*.conf;
```

推荐把 Presence 单独放在 `presence.conf` 中。可以直接创建：

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

如果服务器不是这种目录结构，就把同一段 `location` 放进对应站点的 `server {}` 中。

如果前面已经上传 `/tmp/nginx-presence.conf`，也可以复制到相应位置。

**安装 Nginx 配置**

将配置复制到站点扩展目录。

示例：

```bash
sudo cp \
  /tmp/nginx-presence.conf \
  /www/server/panel/vhost/nginx/extension/example.com/presence.conf
```

注意：实际目录应以服务器真实网站配置路径为准。

典型配置：

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

特别注意：

```nginx
proxy_pass http://127.0.0.1:8765;
```

末尾不要额外添加 `/`，否则可能改变转发 URI。

**检查并重载 Nginx**

执行：

```bash
sudo nginx -t
```

必须看到类似：

```text
syntax is ok
test is successful
```

只有成功后才继续。

```bash
sudo systemctl reload nginx
```

推荐 reload，不需要 restart。

**DNS 尚未配置时测试**

如果域名暂时无法通过公共 DNS 解析，可以在服务器本机绕过 DNS 测试。

假设 Nginx vhost：

```text
example.com
```

执行：

```bash
curl -k -i \
  -H "Host: example.com" \
  https://127.0.0.1/api/presence/
```

如果返回 200，则说明：

```text
Nginx
→ Presence location
→ proxy_pass
→ Fastify
```

链路正常。

注意：`-k` 仅用于测试时忽略证书校验。

**Windows hosts 临时测试**

也可以在 Windows：

```text
C:\Windows\System32\drivers\etc\hosts
```

增加：

```text
<SERVER_IP> example.com
```

然后访问：

```text
https://example.com/api/presence/
```

测试完成后删除该 hosts 记录。

---

## 6. 验证部署

**测试 Fastify 本机 GET**

执行：

```bash
curl -i http://127.0.0.1:8765/api/presence/
```

预期：

```text
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
```

初始状态示例：

```json
{
  "state": "offline",
  "title": "当前离线",
  "detail": "下次见",
  "updatedAt": 0
}
```

**测试未认证 POST**

```bash
curl -i \
  -X POST \
  http://127.0.0.1:8765/api/presence/update/ \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data '{"state":"coding","title":"正在写代码"}'
```

预期：

```text
401 Unauthorized
```

**测试正确 Token POST**

进入 root shell：

```bash
sudo bash
```

加载环境变量：

```bash
set -a
source /etc/nightbug-presence.env
set +a
```

发送：

```bash
curl -i \
  -X POST \
  http://127.0.0.1:8765/api/presence/update/ \
  -H "Authorization: Bearer $PRESENCE_TOKEN" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data '{"state":"coding","title":"正在写代码","app":"Visual Studio Code","detail":"专注工作中"}'
```

预期：

```text
200 OK
```

读取：

```bash
curl http://127.0.0.1:8765/api/presence/
```

退出：

```bash
exit
```

**检查状态文件**

查看：

```bash
sudo cat /var/lib/nightbug-presence/presence.json
```

检查权限：

```bash
sudo ls -l /var/lib/nightbug-presence/presence.json
```

状态文件应属于：

```text
presence
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
curl -i \
  -X POST \
  https://example.com/api/presence/update/ \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data '{"state":"gaming","title":"正在玩游戏"}'
```

预期：

```text
401 Unauthorized
```

**公网正确 Token POST**

```bash
sudo bash
```

加载：

```bash
set -a
source /etc/nightbug-presence.env
set +a
```

执行：

```bash
curl -i \
  -X POST \
  https://example.com/api/presence/update/ \
  -H "Authorization: Bearer $PRESENCE_TOKEN" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data '{"state":"gaming","title":"正在玩游戏","app":"Minecraft","detail":"游戏时间"}'
```

检查：

```bash
curl https://example.com/api/presence/
```

退出：

```bash
exit
```

**确认端口只监听本机**

```bash
sudo ss -lntp | grep 8765
```

正确：

```text
127.0.0.1:8765
```

错误示例：

```text
0.0.0.0:8765
```

如果发现监听公网，应检查：

```env
PRESENCE_HOST=127.0.0.1
```

然后：

```bash
sudo systemctl restart nightbug-presence
```

**测试重启后状态恢复**

```bash
sudo systemctl restart nightbug-presence
```

检查：

```bash
sudo systemctl status nightbug-presence
```

读取：

```bash
curl http://127.0.0.1:8765/api/presence/
```

如果状态仍存在，说明 JSON 持久化正常。

---

## 7. 日常运维与更新

**常用 systemd 命令**

启动：

```bash
sudo systemctl start nightbug-presence
```

停止：

```bash
sudo systemctl stop nightbug-presence
```

重启：

```bash
sudo systemctl restart nightbug-presence
```

状态：

```bash
sudo systemctl status nightbug-presence
```

启用开机启动：

```bash
sudo systemctl enable nightbug-presence
```

禁用开机启动：

```bash
sudo systemctl disable nightbug-presence
```

查看日志：

```bash
sudo journalctl -u nightbug-presence -f
```

最近 100 条：

```bash
sudo journalctl \
  -u nightbug-presence \
  -n 100 \
  --no-pager
```

---


### 更新 Presence 服务

当本地代码发生变化时，推荐重新生成 release。

```powershell
pnpm install
pnpm presence:server:build
```

重新生成 release：

```powershell
Remove-Item -Recurse -Force .\release-presence -ErrorAction SilentlyContinue
pnpm --filter @nightbug/presence --prod deploy .\release-presence
```

上传：

```powershell
scp -r .\release-presence ubuntu@<SERVER_IP>:/tmp/nightbug-presence-release-new
```

先停止：

```bash
sudo systemctl stop nightbug-presence
```

可选备份旧版本：

```bash
sudo rm -rf /opt/nightbug-presence.backup
sudo cp -a /opt/nightbug-presence /opt/nightbug-presence.backup
```

清理旧程序：

```bash
sudo rm -rf /opt/nightbug-presence/*
```

部署：

```bash
sudo cp -a \
  /tmp/nightbug-presence-release-new/. \
  /opt/nightbug-presence/
```

设置权限：

```bash
sudo chown -R root:root /opt/nightbug-presence
```

启动：

```bash
sudo systemctl start nightbug-presence
```

检查：

```bash
sudo systemctl status nightbug-presence
```

验证：

```bash
curl http://127.0.0.1:8765/api/presence/
```

状态文件：

```text
/var/lib/nightbug-presence/presence.json
```

不会因为替换程序目录而丢失。

**回滚版本**

如果新版本失败：

```bash
sudo systemctl stop nightbug-presence
```

删除新版本：

```bash
sudo rm -rf /opt/nightbug-presence
```

恢复：

```bash
sudo mv \
  /opt/nightbug-presence.backup \
  /opt/nightbug-presence
```

启动：

```bash
sudo systemctl start nightbug-presence
```

检查：

```bash
sudo systemctl status nightbug-presence
```

**修改 Token**

生成新 token：

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

Windows Agent 也必须同步更换。

**修改端口**

编辑：

```bash
sudo nano /etc/nightbug-presence.env
```

例如：

```env
PRESENCE_PORT=9876
```

同时修改 Nginx：

```nginx
proxy_pass http://127.0.0.1:9876;
```

然后：

```bash
sudo systemctl restart nightbug-presence
sudo nginx -t
sudo systemctl reload nginx
```

**清空当前 Presence 状态**

停止服务：

```bash
sudo systemctl stop nightbug-presence
```

删除状态文件：

```bash
sudo rm -f /var/lib/nightbug-presence/presence.json
```

启动：

```bash
sudo systemctl start nightbug-presence
```

服务将重新生成默认 offline 状态。

---

## 8. 故障排查

### systemd 启动失败

查看最近日志：

```bash
sudo journalctl \
  -u nightbug-presence \
  -n 100 \
  --no-pager
```

实时日志：

```bash
sudo journalctl -u nightbug-presence -f
```

常见问题：

**缺少 PRESENCE_TOKEN**

错误类似：

```text
[Presence] PRESENCE_TOKEN is required
```

检查：

```bash
sudo cat /etc/nightbug-presence.env
```

**找不到入口文件**

检查：

> [!TIP]
> 如果入口文件存在，但 systemd 日志显示模块加载、依赖、平台二进制或构建产物异常，请回到部署部分的 [8.1 Windows 构建的 Release 在 Linux 上无法运行时](#81-windows-构建的-release-在-linux-上无法运行时)，改为在 Linux 上本地重建。



```bash
ls -l /opt/nightbug-presence/dist/index.js
```

**状态目录不可写**

检查：

```bash
ls -ld /var/lib/nightbug-presence
```

修复：

```bash
sudo chown -R presence:presence /var/lib/nightbug-presence
sudo chmod 750 /var/lib/nightbug-presence
```

### Nginx 常见问题


**返回 502 Bad Gateway**

检查服务：

```bash
sudo systemctl status nightbug-presence
```

检查端口：

```bash
sudo ss -lntp | grep 8765
```

检查本机：

```bash
curl http://127.0.0.1:8765/api/presence/
```

**API 被缓存**

检查响应：

```bash
curl -I https://example.com/api/presence/
```

应包含：

```text
Cache-Control: no-store
```

Fastify 和 Nginx 都应设置 `no-store`。

**API 404**

检查：

```bash
sudo nginx -T | grep -n "api/presence"
```

检查实际扩展配置是否被主站 include。

### Fastify 常见问题


**400 Invalid presence payload**

检查请求 JSON：

```json
{
  "state": "coding",
  "title": "正在写代码"
}
```

要求：

- `state` 非空
- 状态 key 只使用安全字符
- `title` 非空
- 字段长度不过限
- `since` 必须为合法数字

**401 Unauthorized**

检查：

```text
Authorization: Bearer <token>
```

确认 Agent 和服务器 token 一致。

**413 Payload Too Large**

Presence API body limit 为：

```text
16 KiB
```

Presence 请求本身不应接近此大小。

**状态文件损坏**

查看：

```bash
sudo cat /var/lib/nightbug-presence/presence.json
```

如果 JSON 损坏，服务设计为回退到默认 offline 状态。

可以手动重置：

```bash
sudo systemctl stop nightbug-presence
sudo rm -f /var/lib/nightbug-presence/presence.json
sudo systemctl start nightbug-presence
```

**检查服务是否异常重启**

```bash
sudo systemctl show nightbug-presence \
  -p NRestarts \
  -p ActiveState \
  -p SubState
```

如果 `NRestarts` 持续增长，应查看：

```bash
sudo journalctl -u nightbug-presence -n 200 --no-pager
```

---

## 9. 完整卸载

**停止并禁用服务**

```bash
sudo systemctl stop nightbug-presence
```

```bash
sudo systemctl disable nightbug-presence
```

**删除 systemd service**

```bash
sudo rm -f /etc/systemd/system/nightbug-presence.service
sudo systemctl daemon-reload
sudo systemctl reset-failed
```

确认：

```bash
systemctl status nightbug-presence
```

应提示 service 不存在。

**删除 Nginx Presence 配置**

```bash
sudo rm -f \
  /www/server/panel/vhost/nginx/extension/example.com/presence.conf
```

检查：

```bash
sudo nginx -t
```

成功后：

```bash
sudo systemctl reload nginx
```

**删除程序、配置与状态数据**

```bash
sudo rm -rf /opt/nightbug-presence
```

```bash
sudo rm -f /etc/nightbug-presence.env
```

如果确认不再需要历史 Presence 状态：

```bash
sudo rm -rf /var/lib/nightbug-presence
```

如果希望保留状态备份，可以先：

```bash
sudo cp \
  /var/lib/nightbug-presence/presence.json \
  ~/presence.json.backup
```

**删除 presence 系统用户**

确认没有其他服务使用该用户后：

```bash
sudo userdel presence
```

检查：

```bash
id presence
```

预期：

```text
no such user
```

**清理临时文件**

```bash
sudo rm -rf /tmp/nightbug-presence-release
sudo rm -rf /tmp/nightbug-presence-release-new
sudo rm -f /tmp/nightbug-presence.service
sudo rm -f /tmp/nginx-presence.conf
sudo rm -f /tmp/nightbug-presence.env.example
```

**卸载 Node.js（可选）**

如果服务器上还有其他 Node 服务，不要执行本节。

如果确认 Node.js 只用于 Presence：

```bash
sudo apt remove nodejs
sudo apt autoremove
```

如果 pnpm 是通过 Corepack 管理，不需要额外卸载。

**卸载后检查**

检查服务：

```bash
systemctl status nightbug-presence
```

检查端口：

```bash
sudo ss -lntp | grep 8765
```

正常情况下无输出。

检查目录：

```bash
ls /opt/nightbug-presence
```

应不存在。

检查状态目录：

```bash
ls /var/lib/nightbug-presence
```

如果选择彻底删除，应不存在。

检查 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 10. 检查清单与后续说明

### 部署完成检查清单

```text
[ ] node -v 正常
[ ] pnpm -v 正常
[ ] presence 系统用户存在
[ ] /opt/nightbug-presence/dist/index.js 存在
[ ] /var/lib/nightbug-presence 属于 presence
[ ] /etc/nightbug-presence.env 权限为 600
[ ] PRESENCE_HOST=127.0.0.1
[ ] systemd Active: active (running)
[ ] 127.0.0.1:8765 GET 返回 200
[ ] 未认证 POST 返回 401
[ ] 正确 token POST 返回 200
[ ] 中文 JSON 正常
[ ] presence.json 成功写入
[ ] 重启服务后状态恢复
[ ] ss 显示只监听 127.0.0.1:8765
[ ] nginx -t 成功
[ ] Nginx API 反代正常
[ ] Cache-Control: no-store
[ ] DNS 可用后公网 GET 正常
[ ] DNS 可用后公网 POST 鉴权正常
```

### 卸载检查清单

```text
[ ] stop nightbug-presence
[ ] disable nightbug-presence
[ ] 删除 systemd service
[ ] systemctl daemon-reload
[ ] 删除 Nginx Presence 配置
[ ] nginx -t
[ ] reload nginx
[ ] 删除 /opt/nightbug-presence
[ ] 删除 /etc/nightbug-presence.env
[ ] 删除 /var/lib/nightbug-presence（如无需保留）
[ ] 删除 presence 用户
[ ] 删除 /tmp 临时部署文件
[ ] 确认 8765 不再监听
```

### 后续 Windows Agent 接入

正式域名和 DNS 可用后，Windows Agent 的生产配置应使用：

```text
PRESENCE_API_URL=https://example.com/api/presence/update/
PRESENCE_TOKEN=<与服务器一致的 token>
```

Agent：

```text
POST
https://example.com/api/presence/update/
```

前端：

```text
GET
https://example.com/api/presence/
```

前端永远不需要知道 Bearer Token。

### 结语

推荐始终保持以下边界：

```text
Astro
→ 静态站点

Presence Agent
→ 只负责采集并发送状态

Fastify Presence API
→ 负责认证、校验、持久化

Nginx
→ 负责 HTTPS 与反向代理

systemd
→ 负责守护和自动启动
```

这样 Presence 服务可以独立升级、重启、卸载，而不会影响 Astro 静态站点本身。
