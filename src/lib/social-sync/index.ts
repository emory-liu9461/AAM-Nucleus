import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business } from "@/db/schema";
import { safeEqual } from "@/lib/auth";
import { googleConfigured, googleRefresh, syncGoogle } from "./google";
import { metaConfigured, syncFacebook, syncInstagram } from "./meta";
import { decrypt, encrypt, saveItems, saveStats } from "./store";
import { syncYouTube, youtubeConfigured } from "./youtube";

export { googleConfigured, metaConfigured, youtubeConfigured };

/** Channels Nucleus can pull automatically; every other channel is entered by hand. */
export const API_CHANNELS = ["google", "facebook", "instagram", "youtube"] as const;

/** Sync every connected account of one business. Errors are saved per account, not thrown. */
export async function syncBusinessSocial(b: Pick<Business, "id">) {
  const accounts = await db.select().from(schema.socialAccounts).where(eq(schema.socialAccounts.businessId, b.id));
  const results: { channel: string; ok: boolean; error?: string }[] = [];
  for (const a of accounts) {
    try {
      let token = decrypt(a.accessToken);
      let result;
      if (a.channel === "google") {
        if (!a.tokenExpiresAt || a.tokenExpiresAt.getTime() < Date.now() + 60_000) {
          const refresh = decrypt(a.refreshToken);
          if (!refresh) throw new Error("Google sign-in expired. Reconnect Google.");
          const t = await googleRefresh(refresh);
          token = t.access_token;
          await db.update(schema.socialAccounts).set({ accessToken: encrypt(token), tokenExpiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000) }).where(eq(schema.socialAccounts.id, a.id));
        }
        result = await syncGoogle(token!, a.externalId);
      } else if (a.channel === "facebook") result = await syncFacebook(a.externalId, token!);
      else if (a.channel === "instagram") result = await syncInstagram(a.externalId, token!);
      else if (a.channel === "youtube") result = await syncYouTube(a.externalId);
      else continue;
      await saveStats(b.id, a.channel, result.stats, "api");
      await saveItems(b.id, a.channel, result.items);
      await db.update(schema.socialAccounts).set({ lastSyncAt: new Date(), lastError: null }).where(eq(schema.socialAccounts.id, a.id));
      results.push({ channel: a.channel, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.update(schema.socialAccounts).set({ lastError: msg.slice(0, 500) }).where(eq(schema.socialAccounts.id, a.id));
      results.push({ channel: a.channel, ok: false, error: msg });
    }
  }
  return results;
}

/** Save (or replace) the connected account for a channel. */
export async function upsertAccount(businessId: string, channel: string, v: { externalId: string; name?: string | null; accessToken?: string | null; refreshToken?: string | null; expiresIn?: number | null; meta?: Record<string, string> }) {
  const row = {
    businessId, channel, externalId: v.externalId, name: v.name ?? null,
    accessToken: encrypt(v.accessToken), refreshToken: encrypt(v.refreshToken),
    tokenExpiresAt: v.expiresIn ? new Date(Date.now() + v.expiresIn * 1000) : null, meta: v.meta ?? null, lastError: null,
  };
  await db.insert(schema.socialAccounts).values(row).onConflictDoUpdate({ target: [schema.socialAccounts.businessId, schema.socialAccounts.channel], set: row });
}

export async function removeAccount(businessId: string, channel: string) {
  await db.delete(schema.socialAccounts).where(and(eq(schema.socialAccounts.businessId, businessId), eq(schema.socialAccounts.channel, channel)));
}

/* Signed OAuth "state" so a sign-in can only complete for the business that started it. */
const sign = (data: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`oauth:${data}`).digest("base64url");
export function oauthState(businessSlug: string, provider: string) {
  const data = `${businessSlug}.${provider}.${Date.now()}`;
  return `${data}.${sign(data)}`;
}
export function readOauthState(state: string | null, provider: string) {
  if (!state) return null;
  const i = state.lastIndexOf(".");
  const data = state.slice(0, i);
  if (!safeEqual(state.slice(i + 1), sign(data))) return null;
  const [slug, p, ts] = data.split(".");
  if (p !== provider || Date.now() - Number(ts) > 15 * 60e3) return null;
  return slug;
}
