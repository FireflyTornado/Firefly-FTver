namespace NightbugPresenceTray;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        using var mutex = new Mutex(true, @"Local\NightbugPresenceTray", out var createdNew);
        if (!createdNew) return;

        ApplicationConfiguration.Initialize();
        try
        {
            Application.Run(new TrayApplicationContext());
        }
        catch (Exception error)
        {
            MessageBox.Show(
                $"Nightbug Presence could not start.\n\n{error.Message}",
                "Nightbug Presence",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
        finally
        {
            mutex.ReleaseMutex();
        }
    }
}
