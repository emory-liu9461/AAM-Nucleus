import { after } from "next/server";
import { safeEqual } from "@/lib/auth";
import { businessByEmail, handleInboundEmail, type InboundEmail } from "@/lib/email";

/*
 * Postmark inbound webhook: POST /api/email/inbound/{POSTMARK_INBOUND_TOKEN}
 * The secret in the URL proves the request came from your Postmark server.
 * Answers right away; the AI reply is written in the background.
 */
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = process.env.POSTMARK_INBOUND_TOKEN;
  if (!secret || !safeEqual(token, secret)) return new Response("Forbidden", { status: 403 });
  let p: InboundEmail;
  try {
    p = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const recipients = [p.OriginalRecipient, ...(p.ToFull ?? []).map((t) => t.Email), ...(p.CcFull ?? []).map((t) => t.Email), p.To].filter(Boolean) as string[];
  const b = await businessByEmail(recipients);
  // 200 even when no business matches, so Postmark doesn't keep retrying.
  if (!b) return Response.json({ ok: true, matched: false });
  after(async () => {
    try {
      await handleInboundEmail(b, p);
    } catch (err) {
      console.error("inbound email failed", err);
    }
  });
  return Response.json({ ok: true });
}
