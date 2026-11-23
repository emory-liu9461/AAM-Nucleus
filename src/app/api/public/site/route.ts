import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeDomain, publicSite } from "@/lib/site-defaults";

/*
 * Public website content for the site/ app.
 *   GET /api/public/site?domain=roofingco.com
 *   GET /api/public/site?slug=business-one   (previews before a domain is connected)
 * Returns only public information (name, phone, services, reviews…).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const domain = normalizeDomain(searchParams.get("domain"));
  const slug = searchParams.get("slug");
  const { businesses } = schema;
  const where = domain ? eq(businesses.domain, domain) : slug && /^[a-z0-9-]{1,64}$/.test(slug) ? eq(businesses.slug, slug) : null;
  if (!where) return NextResponse.json({ error: "Pass ?domain= or ?slug=" }, { status: 400 });
  const [b] = await db.select().from(businesses).where(and(where, eq(businesses.archived, false)));
  if (!b) return NextResponse.json({ error: "No website for that domain" }, { status: 404 });
  return NextResponse.json(publicSite(b), { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
