import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const WINDOWS_ACTIVITY_SCRIPT = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class PresenceWindowsApi
{
    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO info);

    public static string GetForegroundProcessName()
    {
        var window = GetForegroundWindow();
        if (window == IntPtr.Zero) return String.Empty;

        uint processId;
        GetWindowThreadProcessId(window, out processId);
        if (processId == 0) return String.Empty;

        try
        {
            return Process.GetProcessById((int)processId).ProcessName + ".exe";
        }
        catch
        {
            return String.Empty;
        }
    }

    public static uint GetIdleMilliseconds()
    {
        var info = new LASTINPUTINFO();
        info.cbSize = (uint)Marshal.SizeOf(info);
        if (!GetLastInputInfo(ref info)) return 0;
        return unchecked((uint)Environment.TickCount - info.dwTime);
    }
}
'@

[PSCustomObject]@{
    processName = [PresenceWindowsApi]::GetForegroundProcessName()
    idleMs = [PresenceWindowsApi]::GetIdleMilliseconds()
} | ConvertTo-Json -Compress
`;

export interface WindowsActivity {
	processName: string;
	idleMs: number;
}

export async function getWindowsActivity(
	signal?: AbortSignal,
): Promise<WindowsActivity> {
	const { stdout } = await execFileAsync(
		"powershell.exe",
		[
			"-NoLogo",
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			WINDOWS_ACTIVITY_SCRIPT,
		],
		{
			encoding: "utf8",
			timeout: 8_000,
			windowsHide: true,
			signal,
		},
	);
	const activity = JSON.parse(stdout.trim()) as Partial<WindowsActivity>;

	if (
		typeof activity.processName !== "string" ||
		typeof activity.idleMs !== "number" ||
		!Number.isFinite(activity.idleMs)
	) {
		throw new Error("Windows activity detection returned invalid data");
	}

	return {
		processName: activity.processName,
		idleMs: activity.idleMs,
	};
}
