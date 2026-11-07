// Codes carried over audio (ggwave) by the acoustic modem: 6 characters without look-alikes (no I, O, 0 or 1).
// Used by payout approval sessions and standalone proximity checks. Isomorphic: no node:* imports.
import { randomInt } from './random.ts';

export const ACOUSTIC_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ACOUSTIC_CODE_LENGTH = 6;
/** The format the modem plays and decodes (`playChallengeTone`). */
export const ACOUSTIC_CODE_PATTERN = /^[A-Z0-9]{6}$/;

/** A fresh random code (about 30 bits). */
export const newAcousticCode = (): string => Array.from({ length: ACOUSTIC_CODE_LENGTH }, () => ACOUSTIC_CODE_ALPHABET[randomInt(ACOUSTIC_CODE_ALPHABET.length)]).join('');
/** True for text in the modem's code format (use it to ignore stray decodes before sending them anywhere). */
export const validAcousticCode = (value: unknown): value is string => typeof value === 'string' && ACOUSTIC_CODE_PATTERN.test(value);
