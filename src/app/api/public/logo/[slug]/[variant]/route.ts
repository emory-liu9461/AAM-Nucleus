import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { LOGO_VARIANTS, arcusLogo, type LogoVariant } from "@/lib/arcus-logo";
import { logoAccent } from "@/lib/site-defaults";

/** A business's generated logo: /api/public/logo/<slug>/<horizontal|white|stacked|mark> (SVG). */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; variant: string }> }) {
  const { slug, variant } = await params;
  const v = variant.replace(/\.svg$/, "") as LogoVariant;
  if (!LOGO_VARIANTS.includes(v) || !/^[a-z0-9-]{1,64}$/.test(slug)) return new Response("Not found", { status: 404 });
  const [b] = await db.select().from(schema.businesses).where(eq(schema.businesses.slug, slug));
  if (!b) return new Response("Not found", { status: 404 });
  return new Response(arcusLogo(b.name, logoAccent(b), v), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
}
