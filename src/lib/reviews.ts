import { randomBytes } from "node:crypto";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business, ReviewSettings } from "@/db/schema";
import { emailSettings, postmarkConfigured, sendBusinessEmail } from "./email";
import { phoneSettings, sendBusinessSms } from "./sms";
import { toE164, twilioConfigured } from "./twilio";

/*
 * Review requests: when a job is completed, text and/or email the customer a link to
 * leave a review. The link goes through Nucleus (/r/<token>) so we can see who clicked,
 * and send one reminder to those who didn't.
 */

export const DEFAULT_REVIEW_MESSAGE =
  "Hi {name}, thanks for choosing {business}! If you were happy with the work, would you leave us a quick review? It really helps a local business: {link}";

export function reviewSettings(b: Pick<Business, "reviewSettings">) {
  const r: ReviewSettings = b.reviewSettings ?? {};
  return { enabled: r.enabled ?? false, link: r.link ?? "", sms: r.sms ?? true, email: r.email ?? true, message: r.message || DEFAULT_REVIEW_MESSAGE, reminderDays: r.reminderDays ?? 3 };
}

const appUrl = () => process.env.APP_URL?.replace(/\/$/, "") ?? "";

function fill(template: string, b: Business, firstName: string, link: string) {
  return template.replace(/\{name\}/g, firstName || "there").replace(/\{business\}/g, b.name).replace(/\{link\}/g, link);
}

async function deliver(b: Business, contact: typeof schema.contacts.$inferSelect, text: string, subject: string) {
  const s = reviewSettings(b);
  const used: string[] = [];
  const phone = toE164(contact.phone);
  if (s.sms && phone && !contact.smsOptOut && phoneSettings(b).number && twilioConfigured()) {
    const r = await sendBusinessSms(b, phone, `${text} Reply STOP to opt out.`, { contactId: contact.id, author: "system" });
    if (!("error" in r && r.error)) used.push("sms");
  }
  if (s.email && contact.email && emailSettings(b).fromAddress && postmarkConfigured()) {
    const r = await sendBusinessEmail(b, contact.email, subject, `${text}\n\nIf you'd rather not get these messages, just reply and let us know.`, { contactId: contact.id, author: "system" });
    if (!("error" in r && r.error)) used.push("email");
  }
  return used;
}

/** Send a review request for a completed job. Returns an error string or the channels used. */
export async function sendReviewRequest(b: Business, jobId: string, opts: { force?: boolean } = {}) {
  const s = reviewSettings(b);
  if (!s.link) return { error: "Add your review link in Settings → Review requests first." };
  if (!s.enabled && !opts.force) return { error: "Review requests are off." };
  const [job] = await db.select().from(schema.jobs).where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.businessId, b.id)));
  if (!job) return { error: "Job not found" };
  const [existing] = await db.select().from(schema.reviewRequests).where(eq(schema.reviewRequests.jobId, job.id));
  if (existing && !opts.force) return { error: "A review request was already sent for this job." };
  const [contact] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, job.contactId));
  if (!contact) return { error: "This job has no customer contact." };
  if (!contact.email && !contact.phone) return { error: "The customer has no phone or email." };
  const token = existing?.token ?? randomBytes(9).toString("base64url");
  const link = appUrl() ? `${appUrl()}/r/${token}` : s.link;
  const used = await deliver(b, contact, fill(s.message, b, contact.firstName, link), `How did we do? · ${b.name}`);
  if (!used.length) return { error: "Couldn't send: the customer can't be reached by text or email with the current setup (Twilio/Postmark, or they opted out)." };
  if (existing) {
    await db.update(schema.reviewRequests).set({ sentAt: new Date(), channels: used.join(","), reminderSentAt: null }).where(eq(schema.reviewRequests.id, existing.id));
  } else {
    await db.insert(schema.reviewRequests).values({ businessId: b.id, jobId: job.id, contactId: contact.id, token, channels: used.join(",") });
  }
  return { ok: true, channels: used };
}

/** One reminder for requests nobody clicked, after the business's reminder delay. Run daily. */
export async function sendReviewReminders() {
  const due = await db
    .select({ req: schema.reviewRequests, b: schema.businesses, c: schema.contacts })
    .from(schema.reviewRequests)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.reviewRequests.businessId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.reviewRequests.contactId))
    .where(and(isNull(schema.reviewRequests.clickedAt), isNull(schema.reviewRequests.reminderSentAt), lt(schema.reviewRequests.sentAt, sql`now() - interval '1 day'`)));
  let sent = 0;
  for (const { req, b, c } of due) {
    const s = reviewSettings(b);
    if (!s.enabled || !s.reminderDays || req.sentAt.getTime() > Date.now() - s.reminderDays * 864e5) continue;
    const link = appUrl() ? `${appUrl()}/r/${req.token}` : s.link;
    const used = await deliver(b, c, `Hi ${c.firstName || "there"}, just a friendly reminder from ${b.name}: if you have a minute, we'd really appreciate a review: ${link}`, `A quick favour? · ${b.name}`);
    await db.update(schema.reviewRequests).set({ reminderSentAt: new Date() }).where(eq(schema.reviewRequests.id, req.id));
    if (used.length) sent++;
  }
  return { checked: due.length, sent };
}
