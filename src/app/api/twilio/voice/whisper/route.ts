import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readTwilioWebhook, twiml, xml } from "@/lib/twilio";

/** Played only to the person answering, so they know which business the call is for. */
export async function POST(req: Request) {
  const hook = await readTwilioWebhook(req);
  if (!hook.ok) return new Response("Invalid signature", { status: 403 });
  const slug = new URL(req.url).searchParams.get("b") ?? "";
  const [b] = /^[a-z0-9-]{1,64}$/.test(slug) ? await db.select({ name: schema.businesses.name }).from(schema.businesses).where(eq(schema.businesses.slug, slug)) : [];
  return twiml(`<Say>Call for ${xml((b?.name ?? "your business").replace(/\.+$/, ""))}.</Say>`);
}
