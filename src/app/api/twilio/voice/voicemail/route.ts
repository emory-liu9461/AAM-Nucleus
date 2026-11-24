import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { businessByTwilioNumber } from "@/lib/sms";
import { after } from "next/server";
import { isTwilioMediaUrl, prettyPhone, readTwilioWebhook, twiml } from "@/lib/twilio";
import { notify } from "@/lib/alerts";

/** Saves the voicemail recording on the call. */
export async function POST(req: Request) {
  const hook = await readTwilioWebhook(req);
  if (!hook.ok) return new Response("Invalid signature", { status: 403 });
  const { CallSid = "", To = "", RecordingUrl = "", RecordingDuration = "0" } = hook.params;
  const b = await businessByTwilioNumber(To);
  if (b && isTwilioMediaUrl(RecordingUrl)) {
    const secs = Number(RecordingDuration) || 0;
    const [call] = await db
      .update(schema.calls)
      .set({ status: secs > 0 ? "voicemail" : "missed", recordingUrl: secs > 0 ? RecordingUrl : null, recordingSeconds: secs || null })
      .where(and(eq(schema.calls.callSid, CallSid), eq(schema.calls.businessId, b.id)))
      .returning();
    const from = prettyPhone(call?.fromNumber ?? hook.params.From ?? "");
    after(() =>
      notify(b, "voicemail", {
        title: secs > 0 ? `Voicemail from ${from}` : `Missed call from ${from}`,
        detail: secs > 0 ? `${secs} seconds. Listen in Inbox → Calls.` : "They hung up without leaving a message.",
        path: `/b/${b.slug}/inbox/calls`,
      }),
    );
  }
  return twiml("<Say>Thank you. We'll get back to you soon. Goodbye.</Say><Hangup/>");
}
