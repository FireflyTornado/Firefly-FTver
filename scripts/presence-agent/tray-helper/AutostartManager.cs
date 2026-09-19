using Microsoft.Win32;

namespace NightbugPresenceTray;

internal static class AutostartManager
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "NightbugPresence";

    private static string ExpectedValue => $"\"{Application.ExecutablePath}\"";

    public static bool IsEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKey);
        return string.Equals(key?.GetValue(ValueName) as string, ExpectedValue, StringComparison.OrdinalIgnoreCase);
    }

    public static bool Toggle()
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKey, true);
        if (IsEnabled())
        {
            key.DeleteValue(ValueName, false);
            return false;
        }
        key.SetValue(ValueName, ExpectedValue, RegistryValueKind.String);
        return true;
    }
}
