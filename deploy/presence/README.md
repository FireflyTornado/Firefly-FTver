# Nightbug Presence API 生产部署

该服务是与 Firefly 静态站点分离的 Fastify 进程。它只监听 `127.0.0.1:8765`，由现有 Nginx vhost 同域反向代理；状态保存在 `/var/lib/nightbug-presence/presence.json`。以下命令适用于 Ubuntu 24.04、Node.js 24 和 pnpm 12。

## 1. 构建可独立部署的发布目录

在 Firefly 仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm presence:server:build
rm -rf /tmp/nightbug-presence-release
pnpm --filter @nightbug/presence --prod deploy /tmp/nightbug-presence-release
```

仓库已启用 pnpm 的 injected workspace packages，因此该命令只收集 Presence 包的 `dist`、`package.json` 和生产依赖，不会把 Astro 的开发依赖部署到服务器服务目录。systemd 最终直接运行编译后的 JavaScript，不依赖 `tsx`。

## 2. 创建系统用户和目录

```bash
sudo useradd \
  --system \
  --home /nonexistent \
  --shell /usr/sbin/nologin \
  presence

sudo install -d -o root -g root -m 0755 /opt/nightbug-presence
sudo install -d -o presence -g presence -m 0750 /var/lib/nightbug-presence
sudo cp -a /tmp/nightbug-presence-release/. /opt/nightbug-presence/
sudo chown -R root:root /opt/nightbug-presence
```

若 `presence` 用户已经存在，`useradd` 报“已存在”时可跳过该命令。以后发布新版本时，重新构建发布目录、复制到 `/opt/nightbug-presence`，再重启服务即可。

## 3. 创建环境文件

先生成一个只用于 Presence 的长随机 token：

```bash
openssl rand -hex 32
sudo cp deploy/presence/nightbug-presence.env.example /etc/nightbug-presence.env
sudo chmod 600 /etc/nightbug-presence.env
sudo nano /etc/nightbug-presence.env
```

将生成值填入 `PRESENCE_TOKEN=`，不要保留示例值。不要把真实 token 直接写进会长期保存的 shell history，也不要提交环境文件。其余默认值通常无需修改。

## 4. 安装并启动 systemd 服务

```bash
sudo cp deploy/presence/nightbug-presence.service /etc/systemd/system/nightbug-presence.service
sudo systemctl daemon-reload
sudo systemctl enable --now nightbug-presence
sudo systemctl status nightbug-presence
```

实时查看简洁服务日志：

```bash
sudo journalctl -u nightbug-presence -f
```

更新发布文件后使用：

```bash
sudo systemctl restart nightbug-presence
```

## 5. 先在服务器本机测试

公开 GET：

```bash
curl -i http://127.0.0.1:8765/api/presence/
```

在当前临时终端中设置 token，再发 POST。关闭终端后变量即消失：

```bash
export PRESENCE_TOKEN='粘贴 /etc/nightbug-presence.env 中的真实值'

curl -i -X POST \
  http://127.0.0.1:8765/api/presence/update/ \
  -H "Authorization: Bearer $PRESENCE_TOKEN" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data '{"state":"coding","title":"正在写代码","app":"Visual Studio Code"}'
```

确认 GET/POST 都是 `200`、响应包含 `Cache-Control: no-store`、中文正常，并检查持久化文件：

```bash
sudo -u presence cat /var/lib/nightbug-presence/presence.json
```

## 6. 安装 Nginx 片段

主 vhost 已 include `extension/inn.nightbugclub.cn/*.conf`，只需安装独立片段：

```bash
sudo cp deploy/presence/nginx-presence.conf \
  /www/server/panel/vhost/nginx/extension/inn.nightbugclub.cn/presence.conf
sudo nginx -t
sudo systemctl reload nginx
```

配置只匹配 `/api/presence`、`/api/presence/`、`/api/presence/update`、`/api/presence/update/`，并保留原请求 URI。它不开启 CORS，也不会影响其他页面或 API。

## 7. 公网测试

```bash
curl -i https://inn.nightbugclub.cn/api/presence/

curl -i -X POST \
  https://inn.nightbugclub.cn/api/presence/update/ \
  -H "Authorization: Bearer $PRESENCE_TOKEN" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data '{"state":"coding","title":"正在写代码","app":"Visual Studio Code"}'

curl -i -X POST \
  https://inn.nightbugclub.cn/api/presence/update/ \
  -H "Content-Type: application/json" \
  --data '{"state":"coding","title":"应返回 401"}'
```

预期前两个请求为 `200`，无 token 的 POST 为 `401`。GET 和 POST 都应带 `Cache-Control: no-store`。

## 配置与运行规则

- `PRESENCE_TOKEN` 必填；缺失时服务直接拒绝启动。
- `PRESENCE_HOST` 默认 `127.0.0.1`，不要无意改为公网监听地址。
- `PRESENCE_PORT` 默认 `8765`。
- `PRESENCE_STATE_FILE` 默认 `/var/lib/nightbug-presence/presence.json`。
- 同状态 heartbeat 保留原 `since`；状态改变时采用合法的客户端 `since`，否则使用服务器当前时间。
- `updatedAt` 始终由服务器生成，客户端提交值会被忽略。
- 文件缺失或损坏时，服务恢复为安全的 offline 默认状态，并用临时文件、`fsync`、原子重命名持久化后续更新。
