# Presence 服务：服务器部署、运维与卸载指南

> 本文档用于在 Ubuntu 24.04 服务器上部署基于 Node.js + Fastify + systemd + Nginx 的 Presence 服务。
>
> 示例域名统一使用：`example.com`
>
> systemd 服务名保持：`nightbug-presence`

---

## 1. 部署架构

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

Presence 服务只监听：

```text
127.0.0.1:8765
```

不会直接暴露到公网。

---

## 2. 服务器要求

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

---

## 3. 安装 Node.js 与 pnpm

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

## 4. 本地 Windows 构建 Presence Release

以下操作在本地 Firefly 项目根目录执行。

安装依赖：

```powershell
pnpm install
```

编译生产 Presence 服务：

```powershell
pnpm presence:server:build
```

删除旧 release：

```powershell
Remove-Item -Recurse -Force .\release-presence -ErrorAction SilentlyContinue
```

生成只包含生产依赖的 release：

```powershell
pnpm --filter @nightbug/presence --prod deploy .\release-presence
```

检查目录：

```powershell
Get-ChildItem .\release-presence
Get-ChildItem .\release-presence\dist
```

应至少包含：

```text
release-presence/
├─ dist/
├─ node_modules/
├─ package.json
└─ ...
```

确认入口：

```powershell
Test-Path .\release-presence\dist\index.js
```

应返回：

```text
True
```

---

## 5. 上传文件到服务器

将 `<SERVER_IP>` 替换为真实服务器 IP。

上传 release：

```powershell
scp -r .\release-presence ubuntu@<SERVER_IP>:/tmp/nightbug-presence-release
```

上传 systemd 文件：

```powershell
scp .\deploy\presence\nightbug-presence.service `
  ubuntu@<SERVER_IP>:/tmp/nightbug-presence.service
```

上传 Nginx 配置：

```powershell
scp .\deploy\presence\nginx-presence.conf `
  ubuntu@<SERVER_IP>:/tmp/nginx-presence.conf
```

上传环境变量示例：

```powershell
scp .\deploy\presence\nightbug-presence.env.example `
  ubuntu@<SERVER_IP>:/tmp/nightbug-presence.env.example
```

登录服务器：

```powershell
ssh ubuntu@<SERVER_IP>
```

---

## 6. 创建专用系统用户

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

---

## 7. 创建程序目录和状态目录

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

---

## 8. 安装 Presence Release

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

---


### 8.1 Windows 构建的 Release 在 Linux 上无法运行时

> [!NOTE]
> 默认部署流程可以直接使用 Windows 本地生成并上传的 `release-presence`。如果该 Release 在 Linux 服务器上出现 `MODULE_NOT_FOUND`、`ERR_DLOPEN_FAILED`、`Exec format error`、模块存在但无法加载，或 systemd 启动后立即退出等问题，通常与跨平台依赖、原生二进制、符号链接、文件权限或构建环境差异有关。此时应删除有问题的 Release，改为在 Linux 服务器上重新安装依赖、编译并生成 production release。  
> 如果 Windows Release 运行正常，则无需执行本节，直接继续第 9 节。

#### 8.1.1 停止当前服务

如果 `nightbug-presence` 已经启动：

```bash
sudo systemctl stop nightbug-presence
```

检查：

```bash
sudo systemctl status nightbug-presence
```

此时显示 `inactive` 是正常的。

#### 8.1.2 删除有问题的 Release

删除临时上传的 Windows Release：

```bash
rm -rf /tmp/nightbug-presence-release
```

如果已经复制到了正式运行目录，也清空程序文件：

```bash
sudo rm -rf /opt/nightbug-presence/*
```

不要删除：

```text
/var/lib/nightbug-presence
/etc/nightbug-presence.env
```

其中：

- `/var/lib/nightbug-presence` 保存运行状态；
- `/etc/nightbug-presence.env` 保存生产 Token 和运行配置。

#### 8.1.3 将源码放到 Linux 构建目录

可以把完整项目源码上传到临时目录，例如：

```text
/tmp/Firefly
```

从 Windows PowerShell 上传：

```powershell
scp -r .\Firefly ubuntu@<SERVER_IP>:/tmp/
```

如果项目通过 Git 管理，也可以直接在服务器获取源码：

```bash
cd /tmp
git clone <YOUR_REPOSITORY_URL> Firefly
```

然后进入项目：

```bash
cd /tmp/Firefly
```

#### 8.1.4 删除其他平台生成的依赖

如果源码中包含 Windows 生成的 `node_modules`，不要直接复用。

删除根目录依赖：

```bash
rm -rf node_modules
```

如果 workspace 子目录也可能存在独立的 `node_modules`：

```bash
find . -type d -name node_modules -prune -exec rm -rf {} +
```

#### 8.1.5 检查 Linux 构建环境

```bash
node -v
npm -v
pnpm -v
uname -m
```

确认 Node.js 和 pnpm 均正常后继续。

#### 8.1.6 在 Linux 上重新安装依赖

```bash
pnpm install --frozen-lockfile
```

这样依赖会依据 `pnpm-lock.yaml` 在当前 Linux 环境重新安装。

如果 lockfile 与项目配置不一致，应优先回到开发环境修复并更新 lockfile，而不是直接在生产服务器修改依赖版本。

#### 8.1.7 在 Linux 上重新编译 Presence

```bash
pnpm presence:server:build
```

确认编译入口：

```bash
ls -l server/presence/dist/index.js
```

#### 8.1.8 在 Linux 上重新生成 Production Release

删除旧临时目录：

```bash
rm -rf /tmp/nightbug-presence-release
```

生成 production release：

```bash
pnpm --filter @nightbug/presence \
  --prod \
  deploy \
  /tmp/nightbug-presence-release
```

检查内容：

```bash
find /tmp/nightbug-presence-release \
  -maxdepth 2 \
  -type f \
  | sort \
  | head -50
```

确认入口：

```bash
ls -l /tmp/nightbug-presence-release/dist/index.js
```

#### 8.1.9 重新部署到正式目录

确保正式目录存在：

```bash
sudo install -d \
  -o root \
  -g root \
  -m 0755 \
  /opt/nightbug-presence
```

清空旧程序：

```bash
sudo rm -rf /opt/nightbug-presence/*
```

复制 Linux 本地生成的 Release：

```bash
sudo cp -a \
  /tmp/nightbug-presence-release/. \
  /opt/nightbug-presence/
```

恢复所有权：

```bash
sudo chown -R root:root /opt/nightbug-presence
```

确认：

```bash
ls -l /opt/nightbug-presence/dist/index.js
```

#### 8.1.10 检查状态目录权限

```bash
ls -ld /var/lib/nightbug-presence
```

如权限异常：

```bash
sudo chown -R presence:presence /var/lib/nightbug-presence
sudo chmod 750 /var/lib/nightbug-presence
```

#### 8.1.11 重新启动并验证

启动服务：

```bash
sudo systemctl start nightbug-presence
```

检查：

```bash
sudo systemctl status nightbug-presence
```

测试 API：

```bash
curl -i http://127.0.0.1:8765/api/presence/
```

确认只监听本机：

```bash
sudo ss -lntp | grep 8765
```

正确结果应包含：

```text
127.0.0.1:8765
```

确认持久化数据仍然存在：

```bash
sudo cat /var/lib/nightbug-presence/presence.json
```

如果 Nginx 已经配置，但 DNS 暂时不可用，可以继续通过：

```bash
curl -k -i \
  -H "Host: example.com" \
  https://127.0.0.1/api/presence/
```

验证完整反向代理链路。

#### 8.1.12 清理临时构建文件

确认服务正常后：

```bash
rm -rf /tmp/nightbug-presence-release
```

如果 `/tmp/Firefly` 只是临时构建目录，也可以删除：

```bash
rm -rf /tmp/Firefly
```

> [!TIP]
> 如果已经遇到过一次 Windows Release 与 Linux 环境不兼容，后续更新建议固定采用“源码上传或 Git 拉取 → Linux `pnpm install` → Linux build → Linux `pnpm deploy`”的方式。生产运行目录仍保持 `/opt/nightbug-presence`，不要与源码构建目录混用。

---

## 9. 生成 Presence Token

生成 256-bit 随机 token：

```bash
openssl rand -hex 32
```

注意：

- 不要提交到 Git
- 不要发送给别人
- 不要写进前端代码
- 推荐保存到密码管理器

---

## 10. 创建生产环境变量文件

复制示例：

```bash
sudo cp \
  /tmp/nightbug-presence.env.example \
  /etc/nightbug-presence.env
```

编辑：

```bash
sudo nano /etc/nightbug-presence.env
```

内容：

```env
PRESENCE_TOKEN=替换为真实随机token
PRESENCE_HOST=127.0.0.1
PRESENCE_PORT=8765
PRESENCE_STATE_FILE=/var/lib/nightbug-presence/presence.json
```

保存后设置权限：

```bash
sudo chown root:root /etc/nightbug-presence.env
sudo chmod 600 /etc/nightbug-presence.env
```

检查：

```bash
sudo ls -l /etc/nightbug-presence.env
```

预期：

```text
-rw------- 1 root root ...
```

---

## 11. 安装 systemd 服务

复制：

```bash
sudo cp \
  /tmp/nightbug-presence.service \
  /etc/systemd/system/nightbug-presence.service
```

检查：

```bash
sudo cat /etc/systemd/system/nightbug-presence.service
```

典型配置：

```ini
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
```

重新加载 systemd：

```bash
sudo systemctl daemon-reload
```

启用并立即启动：

```bash
sudo systemctl enable --now nightbug-presence
```

检查：

```bash
sudo systemctl status nightbug-presence
```

预期：

```text
Active: active (running)
```

---

## 12. systemd 启动失败时排查

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

### 12.1 缺少 PRESENCE_TOKEN

错误类似：

```text
[Presence] PRESENCE_TOKEN is required
```

检查：

```bash
sudo cat /etc/nightbug-presence.env
```

### 12.2 找不到入口文件

检查：

> [!TIP]
> 如果入口文件存在，但 systemd 日志显示模块加载、依赖、平台二进制或构建产物异常，请回到部署部分的 [8.1 Windows 构建的 Release 在 Linux 上无法运行时](#81-windows-构建的-release-在-linux-上无法运行时)，改为在 Linux 上本地重建。



```bash
ls -l /opt/nightbug-presence/dist/index.js
```

### 12.3 状态目录不可写

检查：

```bash
ls -ld /var/lib/nightbug-presence
```

修复：

```bash
sudo chown -R presence:presence /var/lib/nightbug-presence
sudo chmod 750 /var/lib/nightbug-presence
```

---

## 13. 测试 Fastify 本机 GET

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

---

## 14. 测试未认证 POST

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

---

## 15. 测试正确 Token POST

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

---

## 16. 检查状态文件

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

---

## 17. 安装 Nginx 配置

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

---

## 18. 检查 Nginx 配置

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

---

## 19. Reload Nginx

```bash
sudo systemctl reload nginx
```

推荐 reload，不需要 restart。

---

## 20. 尚未配置 DNS 时的测试方法

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

---

## 21. Windows hosts 临时测试

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

## 22. DNS 正式可用后的公网 GET 测试

```bash
curl -i https://example.com/api/presence/
```

预期：

```text
200
Cache-Control: no-store
```

---

## 23. 公网无 Token POST 测试

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

---

## 24. 公网正确 Token POST 测试

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

---

## 25. 确认端口只监听本机

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

---

## 26. 测试重启后状态恢复

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

## 27. 常用 systemd 运维命令

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

#
## 28. 更新 Presence 服务

当本地代码发生变化时，推荐重新生成 release。

### 28.1 本地重新构建

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

### 28.2 服务器替换

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

---

## 29. 回滚版本

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

---

## 30. 修改 Token

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

---

## 31. 修改端口

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

---

## 32. 清空当前 Presence 状态

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

## 33. Nginx 常见问题

### 33.1 返回 502 Bad Gateway

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

### 33.2 API 被缓存

检查响应：

```bash
curl -I https://example.com/api/presence/
```

应包含：

```text
Cache-Control: no-store
```

Fastify 和 Nginx 都应设置 `no-store`。

### 33.3 API 404

检查：

```bash
sudo nginx -T | grep -n "api/presence"
```

检查实际扩展配置是否被主站 include。

---

## 34. Fastify 常见问题

### 34.1 400 Invalid presence payload

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

### 34.2 401 Unauthorized

检查：

```text
Authorization: Bearer <token>
```

确认 Agent 和服务器 token 一致。

### 34.3 413 Payload Too Large

Presence API body limit 为：

```text
16 KiB
```

Presence 请求本身不应接近此大小。

---

## 35. 状态文件损坏

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

---

## 36. 查看服务是否异常重启

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

## 完整卸载

## 37. 停止服务

```bash
sudo systemctl stop nightbug-presence
```

## 38. 禁用开机启动

```bash
sudo systemctl disable nightbug-presence
```

## 39. 删除 systemd service

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

## 40. 删除 Nginx Presence 配置

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

## 41. 删除程序文件

```bash
sudo rm -rf /opt/nightbug-presence
```

## 42. 删除 Token 配置

```bash
sudo rm -f /etc/nightbug-presence.env
```

## 43. 删除状态数据

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

## 44. 删除 presence 系统用户

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

## 45. 清理临时文件

```bash
sudo rm -rf /tmp/nightbug-presence-release
sudo rm -rf /tmp/nightbug-presence-release-new
sudo rm -f /tmp/nightbug-presence.service
sudo rm -f /tmp/nginx-presence.conf
sudo rm -f /tmp/nightbug-presence.env.example
```

## 46. 卸载 Node.js（可选）

如果服务器上还有其他 Node 服务，不要执行本节。

如果确认 Node.js 只用于 Presence：

```bash
sudo apt remove nodejs
sudo apt autoremove
```

如果 pnpm 是通过 Corepack 管理，不需要额外卸载。

## 47. 完整卸载后的检查

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

## 48. 推荐的生产目录结构

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

---

## 49. 推荐权限模型

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

## 50. 部署完成检查清单

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

---

## 51. 卸载检查清单

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

---

## 52. 后续 Windows Agent 接入

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

---

## 53. 结语

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
