import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeEqual } from "@/lib/auth";
import { syncBusinessSocial } from "@/lib/social-sync";

/* Daily sync of every connected social account (Vercel Cron, see vercel.json). */
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !safeEqual(given, secret)) return new Response("Unauthorized", { status: 401 });
  const list = await db.selectDistinct({ id: schema.socialAccounts.businessId }).from(schema.socialAccounts)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.socialAccounts.businessId)).where(eq(schema.businesses.archived, false));
  const out: Record<string, unknown> = {};
  for (const b of list) out[b.id] = await syncBusinessSocial(b);
  return Response.json({ ok: true, businesses: list.length, results: out });
}
