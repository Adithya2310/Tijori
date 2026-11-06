// Isomorphic randomness and hashing (Web Crypto + viem). Replaces node:crypto so core runs in browsers too.
import { sha256, stringToBytes } from 'viem';

export const randomUUID = (): string => globalThis.crypto.randomUUID();
/** Uniform integer in [0, max) using rejection sampling (same contract as node:crypto randomInt(max)). */
export function randomInt(max: number): number {
 if (!Number.isSafeInteger(max) || max <= 0 || max > 2 ** 32) throw new RangeError('max must be a positive integer up to 2^32.');
 const limit = Math.floor(2 ** 32 / max) * max, buf = new Uint32Array(1);
 for (;;) { globalThis.crypto.getRandomValues(buf); if (buf[0] < limit) return buf[0] % max; }
}
/** Lowercase hex SHA-256 of a UTF-8 string, identical to createHash('sha256').update(s).digest('hex'). */
export const sha256Hex = (value: string): string => sha256(stringToBytes(value)).slice(2);
