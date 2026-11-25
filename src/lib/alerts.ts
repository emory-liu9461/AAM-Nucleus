import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AlertSettings, Business } from "@/db/schema";
import { emailSettings, postmarkConfigured, postmarkSend } from "./email";
import { phoneSettings } from "./sms";
import { sendTwilioSms, twilioConfigured } from "./twilio";

/*
 * Instant alerts to the owner/team: a short text and an email for each new lead,
 * AI booking, voicemail, and message that needs a person. Sent from the business's
 * own Twilio number and email address. Alerts never block or break the main action.
 */

export type AlertKind = "newLead" | "booking" | "voicemail" | "needsReply" | "payment";

export const ALERT_KINDS: [AlertKind, string][] = [
  ["newLead", "New lead (website form, chat, text, email, call)"],
  ["booking", "Site visit or call booked by the AI assistant"],
  ["voicemail", "Voicemail or missed call"],
  ["needsReply", "Customer message the AI isn't answering (paused, off or handed off)"],
  ["payment", "Invoice paid online by card"],
];

/** Settings with defaults: all alert types on; emails default to the business's owners. */
export async function alertSettings(b: Pick<Business, "alertSettings">) {
  const a: AlertSettings = b.alertSettings ?? {};
  let emails = a.emails;
  if (!emails) {
    const owners = await db.select({ email: schema.users.email }).from(schema.users).where(and(eq(schema.users.role, "owner"), eq(schema.users.active, true)));
    emails = owners.map((o) => o.email);
  }
  return {
    phones: a.phones ?? [],
    emails,
    newLead: a.newLead ?? true,
    booking: a.booking ?? true,
    voicemail: a.voicemail ?? true,
    needsReply: a.needsReply ?? true,
    payment: a.payment ?? true,
  };
}

const appUrl = () => process.env.APP_URL?.replace(/\/$/, "") ?? "";

/** Send one alert. `path` is a Nucleus page, e.g. /b/slug/leads/<id>. Never throws. */
export async function notify(b: Business, kind: AlertKind, msg: { title: string; detail?: string; path?: string }) {
  try {
    const s = await alertSettings(b);
    if (!s[kind]) return { sent: 0 };
    const link = msg.path && appUrl() ? `${appUrl()}${msg.path}` : "";
    const sends: Promise<unknown>[] = [];
    const from = phoneSettings(b).number;
    if (s.phones.length && from && twilioConfigured()) {
      const text = `${b.name}: ${msg.title}${msg.detail ? `. ${msg.detail}` : ""}${link ? ` ${link}` : ""}`.slice(0, 480);
      for (const to of s.phones) sends.push(sendTwilioSms(from, to, text));
    }
    const e = emailSettings(b);
    if (s.emails.length && e.fromAddress && postmarkConfigured()) {
      const text = [msg.title, msg.detail, link && `Open in Nucleus: ${link}`, "", `You get this because you're on the alert list for ${b.name} (Settings → Alerts in Nucleus).`].filter((x) => x !== undefined && x !== "").join("\n\n");
      for (const to of s.emails) sends.push(postmarkSend({ from: `"Nucleus · ${b.name.replace(/"/g, "")}" <${e.fromAddress}>`, to, subject: `${msg.title} · ${b.name}`, text }));
    }
    const results = await Promise.allSettled(sends);
    for (const r of results) if (r.status === "rejected") console.error("alert failed", kind, r.reason instanceof Error ? r.reason.message : r.reason);
    return { sent: results.filter((r) => r.status === "fulfilled").length };
  } catch (err) {
    console.error("alert error", kind, err);
    return { sent: 0 };
  }
}
