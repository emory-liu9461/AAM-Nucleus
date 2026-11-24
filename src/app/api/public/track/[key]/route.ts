import { db, schema } from "@/db";
import { businessByFormKey } from "@/lib/intake";

/*
 * Website visit counter: POST /api/public/track/{formKey}
 * Sent by the website with navigator.sendBeacon (no cookies, no personal data).
 * Body: { path, session, newSession, source }
 */
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime/i;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const done = new Response(null, { status: 204, headers: CORS });
  if (BOT.test(req.headers.get("user-agent") ?? "")) return done;
  const { key } = await params;
  const b = await businessByFormKey(key);
  if (!b) return done;
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(await req.text());
  } catch {
    return done;
  }
  const path = typeof body.path === "string" ? body.path.slice(0, 200) : "/";
  const session = typeof body.session === "string" && /^[a-z0-9]{8,40}$/i.test(body.session) ? body.session : null;
  const source = typeof body.source === "string" ? body.source.toLowerCase().replace(/[^a-z0-9.\-_ ]/g, "").slice(0, 60) || "direct" : "direct";
  if (!session || path.startsWith("/thank-you")) return done;
  await db.insert(schema.siteVisits).values({ businessId: b.id, sessionId: session, path, source, newSession: body.newSession === true });
  return done;
}
