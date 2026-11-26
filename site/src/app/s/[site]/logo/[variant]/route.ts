import { getSite } from "@/lib/site";
import { LOGO_VARIANTS, arcusLogo, type LogoVariant } from "@/lib/arcus-logo";

/* This site's logo drawn from the business name: /logo/<horizontal|white|stacked|mark> (the middleware adds the site). */
export async function GET(_: Request, { params }: { params: Promise<{ site: string; variant: string }> }) {
  const { site, variant } = await params;
  const v = variant as LogoVariant;
  if (!LOGO_VARIANTS.includes(v)) return new Response("Not found", { status: 404 });
  const s = await getSite(site);
  return new Response(arcusLogo(s.business.name, s.business.logoAccent ?? s.business.color, v), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
}
