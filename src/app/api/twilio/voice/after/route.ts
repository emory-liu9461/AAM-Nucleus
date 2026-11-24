import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { businessByTwilioNumber, missedCallTextBack, phoneSettings } from "@/lib/sms";
import { prettyPhone, readTwilioWebhook, twiml, xml } from "@/lib/twilio";
import { notify } from "@/lib/alerts";

/** Runs when the forwarded call ends: answered -> done; otherwise voicemail + text-back. */
export async function POST(req: Request) {
  const hook = await readTwilioWebhook(req);
  if (!hook.ok) return new Response("Invalid signature", { status: 403 });
  const status = hook.params.DialCallStatus ?? new URL(req.url).searchParams.get("DialCallStatus") ?? "no-answer";
  const { CallSid = "", From = "", To = "" } = hook.params;
  const b = await businessByTwilioNumber(To);
  if (!b) return twiml("<Hangup/>");

  if (status === "completed" || status === "answered") {
    await db
      .update(schema.calls)
      .set({ status: "answered", durationSec: Number(hook.params.DialCallDuration) || null })
      .where(and(eq(schema.calls.callSid, CallSid), eq(schema.calls.businessId, b.id)));
    return twiml("<Hangup/>");
  }

  await db.update(schema.calls).set({ status: "missed" }).where(and(eq(schema.calls.callSid, CallSid), eq(schema.calls.businessId, b.id)));
  after(async () => {
    try {
      if (await missedCallTextBack(b, From)) await db.update(schema.calls).set({ textedBack: true }).where(eq(schema.calls.callSid, CallSid));
    } catch (err) {
      console.error("missed-call text-back failed", err);
    }
  });

  const p = phoneSettings(b);
  const textNote = p.missedCallTextBack ? " We'll also send you a text so you can reply there." : "";
  if (!p.voicemail) {
    after(() => notify(b, "voicemail", { title: `Missed call from ${prettyPhone(From)}`, path: `/b/${b.slug}/inbox/calls` }));
    return twiml(`<Say>Sorry, we can't take your call right now.${xml(textNote)} Goodbye.</Say><Hangup/>`);
  }
  return twiml(
    `<Say>Thanks for calling ${xml(b.name.replace(/\.+$/, ""))}. Sorry we missed you. Please leave a message after the tone.${xml(textNote)}</Say>` +
      `<Record maxLength="120" playBeep="true" timeout="5" action="${xml(`${hook.base}/api/twilio/voice/voicemail`)}" method="POST"/>` +
      `<Say>We didn't get a message. Goodbye.</Say><Hangup/>`,
  );
}
