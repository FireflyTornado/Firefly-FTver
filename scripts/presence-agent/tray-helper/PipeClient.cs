using System.Diagnostics;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;

namespace NightbugPresenceTray;

internal sealed class PipeClient : IDisposable
{
    private enum ConnectionState
    {
        Disconnected,
        Connecting,
        Connected,
        Disposed,
    }

    private readonly object stateGate = new();
    private readonly CancellationTokenSource cancellation = new();
    private readonly SemaphoreSlim sendLock = new(1, 1);
    private NamedPipeClientStream? pipe;
    private StreamReader? reader;
    private StreamWriter? writer;
    private Task? connectionLoop;
    private ConnectionState state = ConnectionState.Disconnected;
    private long connectionGeneration;
    private int disposed;

    public bool IsConnected
    {
        get
        {
            lock (stateGate)
            {
                return state == ConnectionState.Connected;
            }
        }
    }

    public event Action<JsonElement>? MessageReceived;
    public event Action<bool>? ConnectionChanged;

    public void Start()
    {
        lock (stateGate)
        {
            if (state == ConnectionState.Disposed || connectionLoop is not null) return;
            connectionLoop = Task.Run(ConnectionLoopAsync);
        }
    }

    public async Task<bool> SendAsync(object message)
    {
        string line;
        try
        {
            line = JsonSerializer.Serialize(message);
        }
        catch (Exception error)
        {
            Trace.WriteLine($"[Nightbug Presence] Unable to serialize pipe message: {error}");
            return false;
        }

        try
        {
            await sendLock.WaitAsync().ConfigureAwait(false);
        }
        catch (ObjectDisposedException)
        {
            return false;
        }

        try
        {
            NamedPipeClientStream? currentPipe;
            StreamWriter? currentWriter;
            lock (stateGate)
            {
                if (state != ConnectionState.Connected) return false;
                currentPipe = pipe;
                currentWriter = writer;
            }

            if (currentPipe is null || currentWriter is null) return false;
            try
            {
                if (!currentPipe.IsConnected)
                {
                    Disconnect(currentPipe);
                    return false;
                }
                await currentWriter.WriteLineAsync(line).ConfigureAwait(false);
                await currentWriter.FlushAsync().ConfigureAwait(false);
                return true;
            }
            catch (Exception error) when (IsExpectedPipeException(error))
            {
                Disconnect(currentPipe);
                return false;
            }
            catch (Exception error)
            {
                Trace.WriteLine($"[Nightbug Presence] Unexpected pipe send failure: {error}");
                Disconnect(currentPipe);
                return false;
            }
        }
        finally
        {
            sendLock.Release();
        }
    }

    public void Disconnect()
    {
        Disconnect(null);
    }

    private async Task ConnectionLoopAsync()
    {
        while (!cancellation.IsCancellationRequested)
        {
            NamedPipeClientStream? nextPipe = null;
            StreamReader? nextReader = null;
            StreamWriter? nextWriter = null;
            var adopted = false;
            long generation = 0;
            try
            {
                if (!BeginConnecting(out generation)) break;
                nextPipe = new NamedPipeClientStream(
                    ".",
                    "NightbugPresence",
                    PipeDirection.InOut,
                    PipeOptions.Asynchronous);
                await nextPipe.ConnectAsync(500, cancellation.Token).ConfigureAwait(false);
                nextReader = new StreamReader(nextPipe, Encoding.UTF8, true, 1_024, true);
                nextWriter = new StreamWriter(nextPipe, new UTF8Encoding(false), 1_024, true)
                {
                    AutoFlush = true,
                };
                adopted = TryAdoptConnection(nextPipe, nextReader, nextWriter, generation);
                if (!adopted) break;

                RaiseConnectionChanged(true);
                await ReadMessagesAsync(nextReader, cancellation.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error) when (IsExpectedPipeException(error))
            {
                // A missing or terminated Worker is a normal disconnected state.
            }
            catch (Exception error)
            {
                Trace.WriteLine($"[Nightbug Presence] Unexpected pipe connection failure: {error}");
            }
            finally
            {
                if (adopted)
                {
                    Disconnect(nextPipe);
                }
                else
                {
                    SafeDispose(nextWriter);
                    SafeDispose(nextReader);
                    SafeDispose(nextPipe);
                    MarkDisconnectedIfConnecting();
                }
            }

            try
            {
                await Task.Delay(750, cancellation.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private bool BeginConnecting(out long generation)
    {
        lock (stateGate)
        {
            generation = ++connectionGeneration;
            if (state == ConnectionState.Disposed) return false;
            state = ConnectionState.Connecting;
            return true;
        }
    }

    private bool TryAdoptConnection(
        NamedPipeClientStream nextPipe,
        StreamReader nextReader,
        StreamWriter nextWriter,
        long generation)
    {
        lock (stateGate)
        {
            if (state != ConnectionState.Connecting || generation != connectionGeneration)
                return false;
            pipe = nextPipe;
            reader = nextReader;
            writer = nextWriter;
            state = ConnectionState.Connected;
            return true;
        }
    }

    private async Task ReadMessagesAsync(StreamReader currentReader, CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            string? line;
            try
            {
                line = await currentReader.ReadLineAsync(token).ConfigureAwait(false);
            }
            catch (Exception error) when (IsExpectedPipeException(error))
            {
                return;
            }
            if (line is null) return;

            try
            {
                using var document = JsonDocument.Parse(line);
                RaiseMessageReceived(document.RootElement.Clone());
            }
            catch (JsonException)
            {
                // Ignore malformed local messages and continue reading this connection.
            }
        }
    }

    private void Disconnect(NamedPipeClientStream? expectedPipe)
    {
        NamedPipeClientStream? oldPipe;
        StreamReader? oldReader;
        StreamWriter? oldWriter;
        var notifyDisconnected = false;
        lock (stateGate)
        {
            if (expectedPipe is not null && !ReferenceEquals(pipe, expectedPipe)) return;
            oldPipe = pipe;
            oldReader = reader;
            oldWriter = writer;
            connectionGeneration++;
            pipe = null;
            reader = null;
            writer = null;
            notifyDisconnected = state == ConnectionState.Connected;
            state = Volatile.Read(ref disposed) == 1
                ? ConnectionState.Disposed
                : ConnectionState.Disconnected;
        }

        SafeDispose(oldWriter);
        SafeDispose(oldReader);
        SafeDispose(oldPipe);
        if (notifyDisconnected) RaiseConnectionChanged(false);
    }

    private void MarkDisconnectedIfConnecting()
    {
        lock (stateGate)
        {
            if (state == ConnectionState.Connecting)
            {
                state = Volatile.Read(ref disposed) == 1
                    ? ConnectionState.Disposed
                    : ConnectionState.Disconnected;
            }
        }
    }

    private void RaiseConnectionChanged(bool connected)
    {
        try
        {
            ConnectionChanged?.Invoke(connected && IsConnected);
        }
        catch (Exception error)
        {
            Trace.WriteLine($"[Nightbug Presence] Connection event handler failed: {error}");
        }
    }

    private void RaiseMessageReceived(JsonElement message)
    {
        try
        {
            MessageReceived?.Invoke(message);
        }
        catch (Exception error)
        {
            Trace.WriteLine($"[Nightbug Presence] Pipe message handler failed: {error}");
        }
    }

    private static bool IsExpectedPipeException(Exception error)
    {
        return error is IOException
            or ObjectDisposedException
            or InvalidOperationException
            or TimeoutException;
    }

    private static void SafeDispose(IDisposable? value)
    {
        if (value is null) return;
        try
        {
            value.Dispose();
        }
        catch (Exception error) when (IsExpectedPipeException(error))
        {
            // Concurrent disconnect and process termination can already close the handle.
        }
        catch (Exception error)
        {
            Trace.WriteLine($"[Nightbug Presence] Unexpected pipe disposal failure: {error}");
        }
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) == 1) return;
        lock (stateGate)
        {
            state = ConnectionState.Disposed;
        }
        try
        {
            cancellation.Cancel();
        }
        catch (ObjectDisposedException)
        {
            // Dispose is intentionally idempotent.
        }
        Disconnect();
    }
}
