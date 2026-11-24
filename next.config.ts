import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Website tab is now Social; keep old bookmarks working.
  async redirects() {
    return [{ source: "/b/:slug/website/:path*", destination: "/b/:slug/social/:path*", permanent: false }];
  },
  async headers() {
    return [
      // The app itself can't be framed by other sites (prevents clickjacking)...
      { source: "/((?!f/).*)", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }, { key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      // ...but the quote form is meant to be embedded on your websites.
      { source: "/f/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }] },
      { source: "/embed.js", headers: [{ key: "Cache-Control", value: "public, max-age=3600" }, { key: "Access-Control-Allow-Origin", value: "*" }] },
    ];
  },
};

export default nextConfig;
