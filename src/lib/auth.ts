// Edge-safe session token helpers (used by middleware and server code).
// Token: base64(userId.sessionVersion.expiresAtMs) + "." + HMAC-SHA256 signature.
// The middleware only checks the signature and expiry; server code then checks the
// user is still active and sessionVersion still matches (so sign-out-everywhere works).
export const SESSION_COOKIE = "nucleus_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

async function hmac(data: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET must be set (at least 16 characters)");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(new Uint8Array(sig));
}

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signSession(userId: string, version: number) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = btoa(`${userId}.${version}.${exp}`).replace(/=+$/, "");
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySession(token: string | undefined): Promise<{ userId: string; version: number } | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  let expected: string;
  try {
    expected = await hmac(payload);
  } catch {
    return null;
  }
  if (!safeEqual(sig, expected)) return null;
  try {
    const [userId, version, exp] = atob(payload).split(".");
    if (!userId || Number(exp) < Date.now()) return null;
    return { userId, version: Number(version) };
  } catch {
    return null;
  }
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
