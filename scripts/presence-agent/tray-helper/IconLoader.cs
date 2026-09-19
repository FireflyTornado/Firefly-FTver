using System.Diagnostics;

namespace NightbugPresenceTray;

internal static class IconLoader
{
    public static Icon? TryLoad()
    {
        try
        {
            using var executableIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            return executableIcon is null ? null : (Icon)executableIcon.Clone();
        }
        catch (Exception error)
        {
            Trace.WriteLine($"[Nightbug Presence] Unable to load the executable icon: {error}");
            return null;
        }
    }
}
