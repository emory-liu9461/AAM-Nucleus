import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { reviewSettings } from "@/lib/reviews";

/** Tracked review link: records the click, then sends the customer to the review page. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[\w-]{6,40}$/.test(token)) return new Response("Not found", { status: 404 });
  const [row] = await db
    .select({ req: schema.reviewRequests, b: schema.businesses })
    .from(schema.reviewRequests)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.reviewRequests.businessId))
    .where(eq(schema.reviewRequests.token, token));
  const link = row ? reviewSettings(row.b).link : "";
  if (!row || !/^https:\/\//.test(link)) return new Response("This review link has expired.", { status: 404 });
  if (!row.req.clickedAt) await db.update(schema.reviewRequests).set({ clickedAt: new Date() }).where(eq(schema.reviewRequests.id, row.req.id));
  return Response.redirect(link, 302);
}
