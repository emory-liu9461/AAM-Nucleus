import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

/* Access tokens are stored encrypted with a key derived from AUTH_SECRET. */
const key = () => createHash("sha256").update(`${process.env.AUTH_SECRET ?? ""}:social-tokens`).digest();

export function encrypt(plain: string | null | undefined) {
  if (!plain) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${data.toString("base64")}`;
}

export function decrypt(stored: string | null | undefined) {
  if (!stored?.startsWith("v1.")) return null;
  const [, iv, tag, data] = stored.split(".");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

export type StatValues = {
  followers?: number | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  reviewsCount?: number | null;
  rating?: number | null;
  extra?: Record<string, number>;
};

/** Upsert today's numbers for a channel (one row per business, channel and day). */
export async function saveStats(businessId: string, channel: string, v: StatValues, source: "api" | "manual", day = new Date().toISOString().slice(0, 10)) {
  const values = {
    businessId, channel, day, source,
    followers: v.followers ?? null, views: v.views ?? null, likes: v.likes ?? null, comments: v.comments ?? null,
    reviewsCount: v.reviewsCount ?? null, rating: v.rating != null ? v.rating.toFixed(1) : null, extra: v.extra ?? null, updatedAt: new Date(),
  };
  await db
    .insert(schema.socialStats)
    .values(values)
    .onConflictDoUpdate({ target: [schema.socialStats.businessId, schema.socialStats.channel, schema.socialStats.day], set: values });
}

export type Item = { externalId: string; kind: "review" | "comment"; author?: string | null; text?: string | null; rating?: number | null; url?: string | null; replied?: boolean; postedAt: Date };

/** Insert new reviews/comments; update text, rating and reply status of ones we already have. */
export async function saveItems(businessId: string, channel: string, items: Item[]) {
  for (const it of items) {
    if (!it.externalId || Number.isNaN(it.postedAt.getTime())) continue;
    const row = {
      businessId, channel, kind: it.kind, externalId: it.externalId.slice(0, 300), author: it.author?.slice(0, 200) ?? null,
      text: it.text?.slice(0, 5000) ?? null, rating: it.rating ?? null, url: it.url?.slice(0, 500) ?? null, replied: it.replied ?? false, postedAt: it.postedAt,
    };
    await db
      .insert(schema.socialItems)
      .values(row)
      .onConflictDoUpdate({
        target: [schema.socialItems.businessId, schema.socialItems.channel, schema.socialItems.externalId],
        set: { text: row.text, rating: row.rating, replied: row.replied, author: row.author },
      });
  }
}

/** Small fetch wrapper: JSON in/out, and errors that include the platform's own message. */
export async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000), cache: "no-store" });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    const e = body as { error?: { message?: string; status?: string } | string; error_description?: string } | null;
    const msg = typeof e?.error === "object" ? e.error?.message : (e?.error_description ?? e?.error);
    throw new Error(`${new URL(url).hostname} ${res.status}: ${msg || text.slice(0, 200) || "request failed"}`);
  }
  return body as T;
}

export const num = (v: unknown) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
export const sum = (xs: (number | null | undefined)[]) => (xs.some((x) => typeof x === "number") ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : null);
export const dbNow = sql`now()`;
