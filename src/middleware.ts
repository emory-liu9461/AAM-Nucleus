import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Fast gate: rejects requests without a validly signed, unexpired session cookie.
// Pages and actions then re-check the user is still active (src/lib/session.ts).
// Public paths: /login, the website quote form (/f/...), customer project pages (/p/<token>), invoice payment pages (/pay/<token>), Stripe webhooks (signature-checked), the public lead/chat API, embed.js,
// Twilio webhooks (/api/twilio/..., which check Twilio's request signature instead) and the
// Postmark inbound email webhook (/api/email/inbound/<secret>).
export async function middleware(req: NextRequest) {
  if (await verifySession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|f/|r/|p/|pay/|api/stripe/webhook/|api/public/|api/twilio/|api/email/inbound/|api/cron/|embed\\.js|brand/|icon\\.svg|_next/static|_next/image|favicon.ico).*)"],
};
