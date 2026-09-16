# Windows Presence Agent

Agent 的默认地址和检测、Heartbeat、Idle 参数统一来自 `src/config/presenceConfig.ts` 的 `presenceConfig.agent`。环境变量只用于临时覆盖；例如默认使用 `presenceConfig.agent.apiUrl` 连接本地 Astro 开发接口，不需要 Token：

```powershell
pnpm dev
pnpm presence:agent
```

连接正式 Presence API 时，在启动 Agent 的同一个 PowerShell 会话中设置地址和 Token：

```powershell
$env:PRESENCE_API_URL="https://example.com/api/presence/update/"
$env:PRESENCE_TOKEN="<YOUR_TOKEN>"
pnpm presence:agent
```

`PRESENCE_API_URL`、`PRESENCE_DETECT_INTERVAL`、`PRESENCE_HEARTBEAT_INTERVAL` 和 `PRESENCE_IDLE_TIMEOUT` 设置后优先于配置文件默认值。`PRESENCE_TOKEN` 例外：它永远只通过环境变量提供，在配置文件中没有默认值。Agent 只会记录 Token 是否已配置，不会输出其内容。

使用完毕后可从当前会话清除变量：

```powershell
Remove-Item Env:PRESENCE_API_URL
Remove-Item Env:PRESENCE_TOKEN
```

其余可选配置及默认值见仓库根目录的 `.env.presence.example`。该示例文件只是配置说明，Agent 不会自动加载 `.env`；实际值以当前 shell / PowerShell 环境变量为准。
