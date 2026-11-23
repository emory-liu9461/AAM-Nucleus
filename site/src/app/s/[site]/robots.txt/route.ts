import { getSite, siteUrl } from "@/lib/site";

export const revalidate = 3600;

export async function GET(_: Request, { params }: { params: Promise<{ site: string }> }) {
  const s = await getSite((await params).site);
  const base = siteUrl(s);
  // Preview addresses (no domain) are kept out of search engines.
  const body = base ? `User-agent: *\nAllow: /\nDisallow: /thank-you\n\nSitemap: ${base}/sitemap.xml\n` : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain" } });
}
