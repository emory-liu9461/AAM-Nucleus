import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** The website project's address (set on the Social tab, or SITE_PREVIEW_URL as a fallback). */
export async function websiteBaseUrl(): Promise<string | null> {
  const [row] = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, "website_url"));
  const v = row?.value || process.env.SITE_PREVIEW_URL || "";
  return v ? v.replace(/\/+$/, "") : null;
}

/** "aam-nucleus-site.vercel.app/services?x" -> "https://aam-nucleus-site.vercel.app" */
export function normalizeSiteUrl(input: string | null | undefined) {
  if (!input?.trim()) return null;
  try {
    const v = input.trim();
    // Real sites use https; a local dev address (localhost) runs on plain http.
    const u = new URL(/^https?:\/\//i.test(v) ? v : `${/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(v) ? "http" : "https"}://${v}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}
