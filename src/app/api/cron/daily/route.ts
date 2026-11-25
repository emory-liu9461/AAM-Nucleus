import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeEqual } from "@/lib/auth";
import { sendReviewReminders } from "@/lib/reviews";
import { syncBusinessSocial } from "@/lib/social-sync";
import { sendReminders } from "@/lib/workflow";

/* Daily jobs (Vercel Cron, see vercel.json): social stats sync, review reminders and customer "see you tomorrow" reminders. */
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !safeEqual(given, secret)) return new Response("Unauthorized", { status: 401 });
  const list = await db.selectDistinct({ id: schema.socialAccounts.businessId }).from(schema.socialAccounts)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.socialAccounts.businessId)).where(eq(schema.businesses.archived, false));
  const social: Record<string, unknown> = {};
  for (const b of list) social[b.id] = await syncBusinessSocial(b);
  const reviews = await sendReviewReminders();
  const customerReminders = await sendReminders();
  return Response.json({ ok: true, social, reviews, customerReminders });
}
