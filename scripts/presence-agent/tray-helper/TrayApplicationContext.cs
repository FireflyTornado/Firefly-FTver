using System.Diagnostics;
using System.Text.Json;

namespace NightbugPresenceTray;

internal sealed class TrayApplicationContext : ApplicationContext
{
    private readonly string runtimeDirectory = AppContext.BaseDirectory;
    private readonly PipeClient pipeClient = new();
    private readonly Control dispatcher = new();
    private readonly NotifyIcon notifyIcon;
    private readonly Icon? customIcon;
    private readonly ToolStripMenuItem stateItem;
    private readonly ToolStripMenuItem lastSyncItem;
    private readonly ToolStripMenuItem pauseItem;
    private readonly ToolStripMenuItem syncItem;
    private readonly ToolStripMenuItem configItem;
    private readonly ToolStripMenuItem restartItem;
    private readonly ToolStripMenuItem autostartItem;
    private readonly System.Windows.Forms.Timer displayTimer;
    private Process? workerProcess;
    private DateTimeOffset? lastSuccessfulSync;
    private bool lastSyncFailed;
    private bool paused;
    private bool connected;
    private bool exiting;
    private bool restarting;

    public TrayApplicationContext()
    {
        dispatcher.CreateControl();
        var menu = new ContextMenuStrip();
        menu.Items.Add(new ToolStripMenuItem("Nightbug Presence") { Enabled = false });
        menu.Items.Add(new ToolStripSeparator());
        stateItem = AddDisabled(menu, "当前状态：Agent unavailable");
        lastSyncItem = AddDisabled(menu, "上次同步：尚未同步");
        menu.Items.Add(new ToolStripSeparator());
        pauseItem = AddAsyncAction(menu, "暂停上报", TogglePauseAsync);
        syncItem = AddAsyncAction(menu, "立即同步", () => SendOrMarkUnavailableAsync(new { type = "sync-now" }));
        AddSafeAction(menu, "打开配置目录", OpenConfigDirectory);
        configItem = AddAsyncAction(menu, "查看配置", () => SendOrMarkUnavailableAsync(new
        {
            type = "get-config-summary",
            requestId = Guid.NewGuid().ToString("N"),
        }));
        restartItem = AddAsyncAction(menu, "重新启动 Agent", RestartAgentAsync);
        menu.Items.Add(new ToolStripSeparator());
        autostartItem = AddSafeAction(menu, "", ToggleAutostart);
        menu.Items.Add(new ToolStripSeparator());
        AddAsyncAction(menu, "退出", ExitAsync);

        customIcon = IconLoader.TryLoad();
        notifyIcon = new NotifyIcon
        {
            Icon = customIcon ?? SystemIcons.Application,
            Text = "Nightbug Presence",
            ContextMenuStrip = menu,
            Visible = true,
        };
        UpdateAutostartText();
        UpdateAvailability();

        displayTimer = new System.Windows.Forms.Timer { Interval = 1_000 };
        displayTimer.Tick += (_, _) => UpdateLastSyncText();
        displayTimer.Start();

        pipeClient.MessageReceived += message => OnUi(() => HandleMessage(message));
        pipeClient.ConnectionChanged += isConnected => OnUi(() => SetConnected(isConnected));
        pipeClient.Start();
        ObserveBackgroundTask(EnsureWorkerStartedAsync(), "initial Worker startup");
    }

    private static ToolStripMenuItem AddDisabled(ContextMenuStrip menu, string text)
    {
        var item = new ToolStripMenuItem(text) { Enabled = false };
        menu.Items.Add(item);
        return item;
    }

    private static ToolStripMenuItem AddSafeAction(ContextMenuStrip menu, string text, Action handler)
    {
        var item = new ToolStripMenuItem(text);
        item.Click += (_, _) =>
        {
            try
            {
                handler();
            }
            catch (Exception error)
            {
                Trace.WriteLine($"[Nightbug Presence] Menu action failed: {error}");
            }
        };
        menu.Items.Add(item);
        return item;
    }

    private static ToolStripMenuItem AddAsyncAction(ContextMenuStrip menu, string text, Func<Task> handler)
    {
        var item = new ToolStripMenuItem(text);
        item.Click += async (_, _) =>
        {
            try
            {
                await handler();
            }
            catch (Exception error)
            {
                Trace.WriteLine($"[Nightbug Presence] Async menu action failed: {error}");
            }
        };
        menu.Items.Add(item);
        return item;
    }

    private void OnUi(Action action)
    {
        try
        {
            if (!dispatcher.IsDisposed && dispatcher.IsHandleCreated)
                dispatcher.BeginInvoke(action);
        }
        catch (Exception error) when (error is ObjectDisposedException or InvalidOperationException)
        {
            Trace.WriteLine($"[Nightbug Presence] UI dispatcher is no longer available: {error.Message}");
        }
    }

    private static void ObserveBackgroundTask(Task task, string operation)
    {
        _ = task.ContinueWith(
            completed => Trace.WriteLine($"[Nightbug Presence] {operation} failed: {completed.Exception}"),
            CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted,
            TaskScheduler.Default);
    }

    private async Task EnsureWorkerStartedAsync()
    {
        await Task.Delay(750);
        if (exiting || pipeClient.IsConnected) return;
        if (!StartWorker())
        {
            OnUi(() => stateItem.Text = "当前状态：Agent failed to start");
            return;
        }
        await Task.Delay(5_000);
        if (!exiting && !pipeClient.IsConnected)
        {
            OnUi(() => stateItem.Text = "当前状态：Agent failed to start");
        }
    }

    private bool StartWorker()
    {
        var workerPath = Path.Combine(runtimeDirectory, "NightbugPresence.exe");
        if (!File.Exists(workerPath)) return false;
        try
        {
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = workerPath,
                    WorkingDirectory = runtimeDirectory,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                },
                EnableRaisingEvents = true,
            };
            process.StartInfo.ArgumentList.Add("--worker");
            process.Exited += (_, _) => OnUi(() => HandleWorkerExited(process));
            if (!process.Start())
            {
                process.Dispose();
                return false;
            }
            DisposeProcess(workerProcess);
            workerProcess = process;
            stateItem.Text = "当前状态：正在启动 Agent";
            return true;
        }
        catch
        {
            return false;
        }
    }

    private void SetConnected(bool value)
    {
        connected = value && pipeClient.IsConnected;
        if (connected)
        {
            ObserveBackgroundTask(
                SendOrMarkUnavailableAsync(new { type = "get-status" }),
                "status request");
        }
        else if (!exiting && !restarting)
        {
            stateItem.Text = "当前状态：Agent unavailable";
        }
        UpdateAvailability();
    }

    private void UpdateAvailability()
    {
        pauseItem.Enabled = connected && !restarting;
        syncItem.Enabled = connected && !paused && !restarting;
        configItem.Enabled = connected && !restarting;
        restartItem.Enabled = !restarting && !exiting;
    }

    private async Task TogglePauseAsync()
    {
        await SendOrMarkUnavailableAsync(new { type = paused ? "resume" : "pause" });
    }

    private async Task SendOrMarkUnavailableAsync(object message)
    {
        if (await pipeClient.SendAsync(message)) return;
        SetConnected(false);
    }

    private void HandleWorkerExited(Process process)
    {
        if (!ReferenceEquals(workerProcess, process)) return;
        if (!exiting && !restarting)
        {
            SetConnected(false);
            stateItem.Text = "当前状态：Agent unavailable";
        }
    }

    private void HandleMessage(JsonElement message)
    {
        if (!message.TryGetProperty("type", out var typeElement)) return;
        var type = typeElement.GetString();
        if (type is "status-changed" or "current-state")
        {
            if (message.TryGetProperty("title", out var titleElement))
            {
                var title = titleElement.GetString() ?? "正在检测";
                stateItem.Text = $"当前状态：{title}";
                notifyIcon.Text = TruncateTooltip($"Nightbug Presence - {title}");
            }
            return;
        }
        if (type is "sync-success" or "last-sync")
        {
            if (message.TryGetProperty("at", out var atElement) &&
                atElement.ValueKind == JsonValueKind.String &&
                DateTimeOffset.TryParse(atElement.GetString(), out var value))
            {
                lastSuccessfulSync = value;
            }
            lastSyncFailed = false;
            UpdateLastSyncText();
            return;
        }
        if (type == "sync-failed")
        {
            lastSyncFailed = true;
            UpdateLastSyncText();
            return;
        }
        if (type is "paused" or "resumed")
        {
            paused = type == "paused";
            pauseItem.Text = paused ? "恢复上报" : "暂停上报";
            UpdateAvailability();
            return;
        }
        if (type == "config-summary" && message.TryGetProperty("config", out var config))
        {
            ShowConfig(config);
        }
    }

    private void ShowConfig(JsonElement config)
    {
        static string Text(JsonElement value, string name) =>
            value.TryGetProperty(name, out var property) ? property.ToString() : "unknown";
        var tokenConfigured = config.TryGetProperty("tokenConfigured", out var tokenValue) &&
            tokenValue.ValueKind is JsonValueKind.True;
        var summary = string.Join(Environment.NewLine,
            $"API URL: {Text(config, "apiUrl")}",
            $"Detect interval: {Text(config, "detectInterval")} ms",
            $"Heartbeat interval: {Text(config, "heartbeatInterval")} ms",
            $"Idle timeout: {Text(config, "idleTimeout")} ms",
            $"Token: {(tokenConfigured ? "configured" : "not configured")}");
        MessageBox.Show(summary, "Nightbug Presence 配置", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void UpdateLastSyncText()
    {
        string value;
        if (lastSuccessfulSync is null)
        {
            value = "尚未同步";
        }
        else
        {
            var seconds = Math.Max(0, (int)(DateTimeOffset.Now - lastSuccessfulSync.Value).TotalSeconds);
            value = seconds < 5 ? "刚刚" : seconds < 60 ? $"{seconds} 秒前" : $"{seconds / 60} 分钟前";
        }
        lastSyncItem.Text = $"上次同步：{(lastSyncFailed ? $"失败（上次成功 {value}）" : value)}";
    }

    private static string TruncateTooltip(string value) => value.Length <= 63 ? value : value[..63];

    private void OpenConfigDirectory()
    {
        try
        {
            Process.Start(new ProcessStartInfo("explorer.exe", runtimeDirectory) { UseShellExecute = true });
        }
        catch
        {
            MessageBox.Show("无法打开配置目录。", "Nightbug Presence", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void ToggleAutostart()
    {
        try
        {
            AutostartManager.Toggle();
            UpdateAutostartText();
        }
        catch
        {
            MessageBox.Show("无法更新开机自启设置。", "Nightbug Presence", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private void UpdateAutostartText()
    {
        autostartItem.Text = $"开机自启：{(AutostartManager.IsEnabled() ? "已启用" : "未启用")}";
    }

    private async Task RestartAgentAsync()
    {
        if (restarting) return;
        restarting = true;
        try
        {
            stateItem.Text = "当前状态：正在重新启动 Agent";
            UpdateAvailability();
            var shutdownSent = await pipeClient.SendAsync(new { type = "shutdown" });
            if (shutdownSent)
            {
                await WaitForDisconnectAsync(TimeSpan.FromSeconds(5));
            }
            pipeClient.Disconnect();
            await StopOwnedWorkerAsync(TimeSpan.FromSeconds(2));
            await Task.Delay(250);
            if (!StartWorker())
            {
                stateItem.Text = "当前状态：Agent failed to start";
                return;
            }
            if (!await WaitForConnectionAsync(TimeSpan.FromSeconds(5)))
                stateItem.Text = "当前状态：Agent failed to start";
        }
        finally
        {
            restarting = false;
            UpdateAvailability();
        }
    }

    private async Task<bool> WaitForDisconnectAsync(TimeSpan timeout)
    {
        var started = Stopwatch.StartNew();
        while (pipeClient.IsConnected && started.Elapsed < timeout) await Task.Delay(100);
        return !pipeClient.IsConnected;
    }

    private async Task<bool> WaitForConnectionAsync(TimeSpan timeout)
    {
        var started = Stopwatch.StartNew();
        while (!pipeClient.IsConnected && started.Elapsed < timeout) await Task.Delay(100);
        return pipeClient.IsConnected;
    }

    private async Task ExitAsync()
    {
        if (exiting) return;
        exiting = true;
        UpdateAvailability();
        try
        {
            var shutdownSent = await pipeClient.SendAsync(new { type = "shutdown" });
            if (shutdownSent)
            {
                await WaitForDisconnectAsync(TimeSpan.FromSeconds(5));
            }
            pipeClient.Dispose();
            await StopOwnedWorkerAsync(TimeSpan.FromSeconds(2));
        }
        catch (Exception error)
        {
            Trace.WriteLine($"[Nightbug Presence] Tray shutdown cleanup failed: {error}");
            pipeClient.Dispose();
            await StopOwnedWorkerAsync(TimeSpan.FromSeconds(1));
        }
        finally
        {
            ExitThread();
        }
    }

    private static bool IsWorkerRunning(Process? process)
    {
        if (process is null) return false;
        try
        {
            return !process.HasExited;
        }
        catch (Exception error) when (error is InvalidOperationException or ObjectDisposedException)
        {
            return false;
        }
    }

    private async Task StopOwnedWorkerAsync(TimeSpan gracefulTimeout)
    {
        var process = workerProcess;
        if (process is null) return;
        try
        {
            if (IsWorkerRunning(process))
            {
                using var timeout = new CancellationTokenSource(gracefulTimeout);
                try
                {
                    await process.WaitForExitAsync(timeout.Token);
                }
                catch (OperationCanceledException)
                {
                    if (IsWorkerRunning(process))
                    {
                        process.Kill(true);
                        using var forcedTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                        try
                        {
                            await process.WaitForExitAsync(forcedTimeout.Token);
                        }
                        catch (OperationCanceledException)
                        {
                            Trace.WriteLine("[Nightbug Presence] Forced Worker termination timed out.");
                        }
                    }
                }
                catch (Exception error) when (error is InvalidOperationException or ObjectDisposedException)
                {
                    Trace.WriteLine($"[Nightbug Presence] Worker wait ended during cleanup: {error.Message}");
                }
            }
        }
        catch (Exception error)
        {
            Trace.WriteLine($"[Nightbug Presence] Unable to terminate owned Worker: {error}");
        }
        finally
        {
            if (ReferenceEquals(workerProcess, process)) workerProcess = null;
            DisposeProcess(process);
        }
    }

    private static void DisposeProcess(Process? process)
    {
        if (process is null) return;
        try
        {
            process.Dispose();
        }
        catch (Exception error) when (error is InvalidOperationException or ObjectDisposedException)
        {
            Trace.WriteLine($"[Nightbug Presence] Worker process was already released: {error.Message}");
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            displayTimer.Stop();
            displayTimer.Dispose();
            notifyIcon.Visible = false;
            notifyIcon.ContextMenuStrip?.Dispose();
            notifyIcon.Dispose();
            customIcon?.Dispose();
            pipeClient.Dispose();
            DisposeProcess(workerProcess);
            workerProcess = null;
            dispatcher.Dispose();
        }
        base.Dispose(disposing);
    }
}
