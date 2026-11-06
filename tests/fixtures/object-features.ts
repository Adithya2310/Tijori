import { featuresFromTokens } from '../../lib/dino.ts';

// Synthetic descriptors with a strong shared signal and distinct local details.
// These exercise matching failure modes; they are NOT real camera/model fixtures.
export function objectFeatures(offset = 0, common = 0.95) {
 const tokens = new Float32Array(257 * 384);
 tokens[offset] = 1;
 for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
  const start = (1 + y * 16 + x) * 384;
  tokens[start + offset] = common;
  tokens[start + offset + 1 + Math.floor(y / 2) * 4 + Math.floor(x / 4)] = Math.sqrt(1 - common ** 2);
 }
 return featuresFromTokens(tokens, [1,257,384]);
}
