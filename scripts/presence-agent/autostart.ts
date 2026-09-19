import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { isSea } from "node:sea";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const VALUE_NAME = "NightbugPresence";

function assertSeaRuntime(): void {
	if (!isSea()) {
		throw new Error("Autostart is only available from NightbugPresence.exe");
	}
}

function autostartCommand(): string {
	return `"${join(dirname(process.execPath), "NightbugPresenceTray.exe")}"`;
}

export async function isAutostartEnabled(): Promise<boolean> {
	if (!isSea()) return false;
	try {
		const { stdout } = await execFileAsync(
			"reg.exe",
			["query", RUN_KEY, "/v", VALUE_NAME],
			{
				windowsHide: true,
			},
		);
		return stdout.includes(autostartCommand());
	} catch {
		return false;
	}
}

export async function enableAutostart(): Promise<void> {
	assertSeaRuntime();
	await execFileAsync(
		"reg.exe",
		[
			"add",
			RUN_KEY,
			"/v",
			VALUE_NAME,
			"/t",
			"REG_SZ",
			"/d",
			autostartCommand(),
			"/f",
		],
		{ windowsHide: true },
	);
}

export async function disableAutostart(): Promise<void> {
	assertSeaRuntime();
	try {
		await execFileAsync(
			"reg.exe",
			["delete", RUN_KEY, "/v", VALUE_NAME, "/f"],
			{ windowsHide: true },
		);
	} catch {
		// Deleting an already absent value is a successful disabled state.
	}
}

export async function toggleAutostart(): Promise<boolean> {
	if (await isAutostartEnabled()) {
		await disableAutostart();
		return false;
	}
	await enableAutostart();
	return true;
}
