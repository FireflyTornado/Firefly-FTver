import { readFile, rm, writeFile } from "node:fs/promises";
import { protectToken, unprotectToken } from "./dpapi";

export class TokenProtectionError extends Error {}
export class TokenWriteError extends Error {}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

export async function readStoredToken(
	tokenPath: string,
): Promise<string | undefined> {
	let encrypted: string;
	try {
		encrypted = (await readFile(tokenPath, "utf8")).trim();
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return undefined;
		console.warn(
			"[Presence Agent] Unable to read token.dat; continuing without a token.",
		);
		return undefined;
	}

	if (encrypted === "") {
		console.warn(
			"[Presence Agent] Invalid token.dat; continuing without a token.",
		);
		return undefined;
	}

	try {
		return await unprotectToken(encrypted);
	} catch {
		console.warn(
			"[Presence Agent] Unable to decrypt token.dat; continuing without a token.",
		);
		return undefined;
	}
}

export async function saveStoredToken(
	tokenPath: string,
	token: string,
): Promise<void> {
	let encrypted: string;
	try {
		encrypted = await protectToken(token);
	} catch {
		throw new TokenProtectionError("Unable to protect token");
	}

	try {
		await writeFile(tokenPath, `${encrypted}\n`, "utf8");
	} catch {
		throw new TokenWriteError("Unable to write token.dat");
	}
}

export async function clearStoredToken(tokenPath: string): Promise<void> {
	await rm(tokenPath, { force: true });
}
