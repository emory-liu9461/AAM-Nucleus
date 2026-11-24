import { after } from "next/server";
import { businessByTwilioNumber, handleInboundSms } from "@/lib/sms";
import { readTwilioWebhook, twiml } from "@/lib/twilio";

/*
 * Twilio "A message comes in" webhook (one URL for every business number).
 * Answers Twilio right away, then lets the AI reply in the background, since an AI
 * turn can take longer than Twilio waits for a webhook.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  const hook = await readTwilioWebhook(req);
  if (!hook.ok) return new Response("Invalid signature", { status: 403 });
  const { From = "", To = "", Body = "", MessageSid = null } = hook.params;
  const b = await businessByTwilioNumber(To);
  if (!b) return twiml("");
  after(async () => {
    try {
      await handleInboundSms(b, From, Body, MessageSid);
    } catch (err) {
      console.error("inbound sms failed", err);
    }
  });
  return twiml("");
}
