import { spawn } from "node:child_process";

const DPAPI_TIMEOUT = 10_000;
const MAX_OUTPUT_BYTES = 1024 * 1024;

const PROTECT_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
    Add-Type -AssemblyName System.Security
    $plainText = [Console]::In.ReadToEnd()
    $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($plainText)
    $encrypted = [System.Security.Cryptography.ProtectedData]::Protect(
        $plainBytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [Console]::Out.Write([Convert]::ToBase64String($encrypted))
} catch {
    [Console]::Error.WriteLine('DPAPI protection failed.')
    exit 1
}
`;

const UNPROTECT_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
    Add-Type -AssemblyName System.Security
    $encryptedText = [Console]::In.ReadToEnd().Trim()
    $encryptedBytes = [Convert]::FromBase64String($encryptedText)
    $plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $encryptedBytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    [Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($plainBytes))
} catch {
    [Console]::Error.WriteLine('DPAPI unprotection failed.')
    exit 1
}
`;

async function runDpapi(script: string, input: string): Promise<string> {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(
			"powershell.exe",
			["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
			{
				windowsHide: true,
				stdio: ["pipe", "pipe", "pipe"],
			},
		);

		let stdout = "";
		let outputBytes = 0;
		let settled = false;

		const finishWithError = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			child.kill();
			rejectPromise(new Error("Windows DPAPI operation failed"));
		};

		const timeout = setTimeout(finishWithError, DPAPI_TIMEOUT);
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			outputBytes += Buffer.byteLength(chunk);
			if (outputBytes > MAX_OUTPUT_BYTES) {
				finishWithError();
				return;
			}
			stdout += chunk;
		});
		child.stderr.resume();
		child.once("error", finishWithError);
		child.once("exit", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (code === 0) {
				resolvePromise(stdout);
			} else {
				rejectPromise(new Error("Windows DPAPI operation failed"));
			}
		});
		child.stdin.on("error", finishWithError);
		child.stdin.end(input, "utf8");
	});
}

export async function protectToken(token: string): Promise<string> {
	const encrypted = (await runDpapi(PROTECT_SCRIPT, token)).trim();
	if (encrypted === "") throw new Error("Windows DPAPI returned empty data");
	return encrypted;
}

export async function unprotectToken(encrypted: string): Promise<string> {
	const token = await runDpapi(UNPROTECT_SCRIPT, encrypted.trim());
	if (token.trim() === "") throw new Error("Windows DPAPI returned empty data");
	return token.trim();
}
