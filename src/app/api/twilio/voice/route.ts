import { db, schema } from "@/db";
import { businessByTwilioNumber, contactForPhone, phoneSettings } from "@/lib/sms";
import { readTwilioWebhook, toE164, twiml, xml } from "@/lib/twilio";

/*
 * Twilio "A call comes in" webhook. Rings the business's forwarding numbers at the
 * same time (first to answer gets it). If nobody answers, /voice/after takes over:
 * voicemail and the missed-call text-back.
 */
export async function POST(req: Request) {
  const hook = await readTwilioWebhook(req);
  if (!hook.ok) return new Response("Invalid signature", { status: 403 });
  const { From = "", To = "", CallSid = "" } = hook.params;
  const b = await businessByTwilioNumber(To);
  if (!b) return twiml("<Say>Sorry, this number is not in service.</Say><Hangup/>");
  const p = phoneSettings(b);
  const caller = toE164(From);
  const contact = caller ? await contactForPhone(b, caller) : null;
  await db
    .insert(schema.calls)
    .values({ businessId: b.id, contactId: contact?.id ?? null, callSid: CallSid, fromNumber: caller ?? From, toNumber: To })
    .onConflictDoNothing();

  const afterUrl = `${hook.base}/api/twilio/voice/after`;
  if (!p.forwardTo.length) return twiml(`<Redirect method="POST">${xml(afterUrl)}?DialCallStatus=no-answer</Redirect>`);
  // Slug only (no spaces or symbols), so the URL Twilio signs is exactly the one we receive.
  const whisper = p.whisper ? ` url="${xml(`${hook.base}/api/twilio/voice/whisper?b=${b.slug}`)}"` : "";
  const numbers = p.forwardTo.map((n) => `<Number${whisper}>${xml(n)}</Number>`).join("");
  // callerId is left as the customer's number, so your phone shows who's calling.
  return twiml(`<Dial timeout="${Math.min(60, Math.max(10, p.ringSeconds))}" answerOnBridge="true" action="${xml(afterUrl)}" method="POST">${numbers}</Dial>`);
}
