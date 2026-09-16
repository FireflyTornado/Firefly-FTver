# Windows Presence Agent

Agent 默认连接本地 Astro 开发接口，不需要 Token：

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

Agent 只会记录 Token 是否已配置，不会输出其内容。使用完毕后可从当前会话清除变量：

```powershell
Remove-Item Env:PRESENCE_API_URL
Remove-Item Env:PRESENCE_TOKEN
```

其余可选配置及默认值见仓库根目录的 `.env.presence.example`。该示例文件只是配置说明，Agent 不会自动加载 `.env`；实际值以当前 shell / PowerShell 环境变量为准。
