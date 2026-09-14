import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
	return createHash("sha256").update(value, "utf8").digest();
}

/** Validates a Bearer header without logging either secret. */
export function isAuthorized(
	authorization: string | undefined,
	expectedToken: string,
): boolean {
	if (typeof authorization !== "string") return false;
	const match = /^Bearer ([^\s]+)$/.exec(authorization);
	if (!match) return false;
	return timingSafeEqual(digest(match[1]), digest(expectedToken));
}
