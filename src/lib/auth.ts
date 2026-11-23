// Single-owner auth. The session cookie is an HMAC of the owner password, so changing
// OWNER_PASSWORD or AUTH_SECRET logs out every session. Swap for a real auth provider
// (Clerk / Auth.js) when you add staff accounts.
export const SESSION_COOKIE = "nucleus_session";

export async function expectedToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  const password = process.env.OWNER_PASSWORD?.trim();
  if (!secret || !password) throw new Error("AUTH_SECRET and OWNER_PASSWORD must be set");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`owner:${password}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
