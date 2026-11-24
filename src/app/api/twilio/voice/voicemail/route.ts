import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { businessByTwilioNumber } from "@/lib/sms";
import { isTwilioMediaUrl, readTwilioWebhook, twiml } from "@/lib/twilio";

/** Saves the voicemail recording on the call. */
export async function POST(req: Request) {
  const hook = await readTwilioWebhook(req);
  if (!hook.ok) return new Response("Invalid signature", { status: 403 });
  const { CallSid = "", To = "", RecordingUrl = "", RecordingDuration = "0" } = hook.params;
  const b = await businessByTwilioNumber(To);
  if (b && isTwilioMediaUrl(RecordingUrl)) {
    await db
      .update(schema.calls)
      .set({ status: "voicemail", recordingUrl: RecordingUrl, recordingSeconds: Number(RecordingDuration) || null })
      .where(and(eq(schema.calls.callSid, CallSid), eq(schema.calls.businessId, b.id)));
  }
  return twiml("<Say>Thank you. We'll get back to you soon. Goodbye.</Say><Hangup/>");
}
