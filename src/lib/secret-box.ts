import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/*
 * Encrypts secrets stored in the database (e.g. a business's Stripe key) with AES-256-GCM,
 * using a key derived from AUTH_SECRET. If AUTH_SECRET changes, saved secrets must be re-entered.
 */

const key = () => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return createHash("sha256").update(`nucleus-secret-box:${s}`).digest();
};

export function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

/** The secret, or null if it can't be read (missing, tampered, or AUTH_SECRET changed). */
export function open(sealed: string | null | undefined) {
  if (!sealed?.startsWith("v1.")) return null;
  try {
    const [, iv, tag, data] = sealed.split(".");
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
