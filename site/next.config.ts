import type { NextConfig } from "next";

let nucleusOrigin = "";
try {
  nucleusOrigin = process.env.NUCLEUS_URL ? new URL(process.env.NUCLEUS_URL).origin : "";
} catch {}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Only this site and your Nucleus portal (for the live preview) may show it in a frame.
          { key: "Content-Security-Policy", value: `frame-ancestors 'self'${nucleusOrigin ? ` ${nucleusOrigin}` : ""}` },
        ],
      },
    ];
  },
};

export default nextConfig;
