import { getSite, siteUrl } from "@/lib/site";

export const revalidate = 3600;

export async function GET(_: Request, { params }: { params: Promise<{ site: string }> }) {
  const s = await getSite((await params).site);
  const base = siteUrl(s);
  if (!base) return new Response("No domain connected", { status: 404 });
  const paths = [
    "/", "/services", "/about", "/quote", "/privacy",
    ...s.content.services.map((x) => `/services/${x.slug}`),
    ...(s.content.serviceAreas.length ? ["/areas", ...s.content.serviceAreas.map((a) => `/areas/${a.slug}`)] : []),
    ...(s.content.reviews.length ? ["/reviews"] : []),
    ...((s.photos?.length ?? 0) ? ["/projects"] : []),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${base}${p === "/" ? "" : p}</loc></url>`).join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml" } });
}
