import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { readTwilioWebhook, twiml } from "@/lib/twilio";

/* Call from Nucleus, step 3: how it went. Twilio posts here when the customer's leg ends (DialCallStatus),
 * and when your own leg ends (CallStatus), e.g. if you didn't pick up. */
export async function POST(req: Request) {
  const hook = await readTwilioWebhook(req);
  if (!hook.ok) return new Response("Invalid signature", { status: 403 });
  const id = new URL(req.url).searchParams.get("c") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return twiml("");
  const [call] = await db.select().from(schema.calls).where(eq(schema.calls.id, id));
  if (!call || call.direction !== "out") return twiml("");
  const p = hook.params;
  if (p.DialCallStatus) {
    const connected = p.DialCallStatus === "completed" || p.DialCallStatus === "answered";
    await db.update(schema.calls).set({ status: connected ? "answered" : "missed", durationSec: Number(p.DialCallDuration) || null }).where(eq(schema.calls.id, id));
    return twiml("<Hangup/>");
  }
  // Your own phone didn't answer (or the call ended before the customer was dialled).
  if (call.status === "ringing" && p.CallStatus && p.CallStatus !== "in-progress") await db.update(schema.calls).set({ status: "missed" }).where(eq(schema.calls.id, id));
  return twiml("");
}
