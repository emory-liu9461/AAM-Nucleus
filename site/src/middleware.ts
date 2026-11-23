import { NextResponse, type NextRequest } from "next/server";

/*
 * Multi-site routing: every request is rewritten to /s/<site-key>/<path>, where
 * the key comes from the domain. One deployment serves every business's website.
 *
 * Preview addresses (localhost, *.vercel.app) have no business domain, so they show
 * DEFAULT_SITE, or ?site=<slug> to switch (remembered in a cookie).
 */
const PREVIEW_HOST = /(^localhost$)|(^127\.0\.0\.1$)|(\.vercel\.app$)/;

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const host = (req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  let key = host;
  let setCookie: string | null = null;

  if (PREVIEW_HOST.test(host)) {
    const asked = url.searchParams.get("site");
    const slug = asked && /^[a-z0-9-]{1,64}$/.test(asked) ? asked : req.cookies.get("preview_site")?.value || process.env.DEFAULT_SITE;
    if (asked && slug === asked) setCookie = asked;
    if (!slug) {
      url.pathname = "/not-configured";
      return NextResponse.rewrite(url);
    }
    key = `slug~${slug}`;
  }

  const rewritten = url.clone();
  rewritten.pathname = `/s/${encodeURIComponent(key)}${url.pathname === "/" ? "" : url.pathname}`;
  const res = NextResponse.rewrite(rewritten);
  if (setCookie) res.cookies.set("preview_site", setCookie, { path: "/", sameSite: "lax" });
  return res;
}

export const config = {
  // Everything except Next internals, the setup page and static files (but keep sitemap.xml / robots.txt).
  matcher: ["/((?!_next/|not-configured|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?)$).*)"],
};
