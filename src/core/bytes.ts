/**
 * Byte and base64 helpers for byte transforms (`PageByteTransform` keys are standard base64).
 * The SDK has `base64ToBytes`; these cover the other direction and URL-safe input.
 */

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard, padded base64 of `bytes`. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += CHARS[a >> 2]! + CHARS[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? "=" : CHARS[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? "=" : CHARS[c & 63]!;
  }
  return out;
}

/** URL-safe (or standard) base64, with or without padding, as bytes; undefined when malformed. */
export function base64UrlToBytes(text: string): Uint8Array | undefined {
  const clean = text.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) return undefined;
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | CHARS.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}
