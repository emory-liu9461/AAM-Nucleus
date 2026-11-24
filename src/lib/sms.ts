import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business, ChatConversation, Contact, PhoneSettings } from "@/db/schema";
import { assistantConfigured, chatTurn } from "./assistant";
import { OPT_IN, OPT_OUT, prettyPhone, sendTwilioSms, toE164, twilioConfigured } from "./twilio";

/*
 * Text messaging and missed-call handling for each business's Twilio number.
 * One SMS conversation per customer number (reused for 30 days), shared by the AI
 * assistant and staff. Staff replying pauses the AI for that conversation.
 */

const { businesses, contacts, leads, chatConversations, inboxMessages } = schema;

export const DEFAULT_PHONE: Required<Omit<PhoneSettings, "number" | "forwardTo">> = {
  ringSeconds: 20,
  whisper: true,
  voicemail: true,
  missedCallTextBack: true,
  missedCallMessage: "Hi, this is {business}. Sorry we missed your call! How can we help? You can reply here to ask a question or book a free site visit.",
  smsAssistant: true,
};

export function phoneSettings(b: Pick<Business, "phoneSettings">) {
  const p = b.phoneSettings ?? {};
  return {
    ...DEFAULT_PHONE,
    ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== "")),
    forwardTo: p.forwardTo ?? [],
    number: p.number ?? null,
  } as typeof DEFAULT_PHONE & { number: string | null; forwardTo: string[] };
}

/** Which business owns the Twilio number that was called or texted. */
export async function businessByTwilioNumber(to: string) {
  const n = toE164(to);
  if (!n) return null;
  const [b] = await db
    .select()
    .from(businesses)
    .where(and(sql`${businesses.phoneSettings}->>'number' = ${n}`, eq(businesses.archived, false)));
  return b ?? null;
}

/** Find the contact for a phone number (matching on digits), or create one named after the number. */
export async function contactForPhone(b: Business, phone: string): Promise<Contact> {
  const digits = phone.replace(/\D/g, "").slice(-10);
  const [found] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.businessId, b.id), sql`right(regexp_replace(coalesce(${contacts.phone}, ''), '\\D', '', 'g'), 10) = ${digits}`))
    .orderBy(desc(contacts.createdAt))
    .limit(1);
  if (found) return found;
  const [c] = await db.insert(contacts).values({ businessId: b.id, firstName: prettyPhone(phone), lastName: "", phone: prettyPhone(phone), source: "phone" }).returning();
  return c;
}

/** An open lead for this contact from the last 60 days, or a new one ("Text message" / "Missed call"). */
export async function leadForContact(b: Business, contact: Contact, title: "Text message" | "Missed call") {
  const since = new Date(Date.now() - 60 * 864e5);
  const [open] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.contactId, contact.id), eq(leads.businessId, b.id), gte(leads.createdAt, since), sql`${leads.stage} not in ('won','lost')`))
    .orderBy(desc(leads.createdAt))
    .limit(1);
  if (open) return open.id;
  const [l] = await db
    .insert(leads)
    .values({ businessId: b.id, contactId: contact.id, title, source: contact.source === "phone" ? "phone" : contact.source, attribution: { channel: "chat", formName: title === "Missed call" ? "phone-call" : "sms" } })
    .returning({ id: leads.id });
  return l.id;
}

/** The ongoing text conversation with this number, or a new one. */
export async function smsConversation(b: Business, phone: string, contact: Contact, leadId: string | null): Promise<ChatConversation> {
  const since = new Date(Date.now() - 30 * 864e5);
  const [existing] = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.businessId, b.id), eq(chatConversations.channel, "sms"), eq(chatConversations.address, phone), gte(chatConversations.updatedAt, since)))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(1);
  if (existing) {
    if (!existing.leadId && leadId) {
      await db.update(chatConversations).set({ leadId }).where(eq(chatConversations.id, existing.id));
      existing.leadId = leadId;
    }
    return existing;
  }
  const [c] = await db
    .insert(chatConversations)
    .values({ businessId: b.id, channel: "sms", address: phone, token: randomBytes(24).toString("hex"), contactId: contact.id, leadId, attribution: { channel: "chat", formName: "sms" } })
    .returning();
  return c;
}

/**
 * Send a text from the business number and log it. Respects STOP opt-outs.
 * Returns the logged message, or an error string.
 */
export async function sendBusinessSms(
  b: Business,
  to: string,
  body: string,
  opts: { conversationId?: string | null; contactId?: string | null; author: "assistant" | "staff" | "system"; sentById?: string | null; statusCallback?: string },
) {
  const p = phoneSettings(b);
  if (!p.number) return { error: "This business has no phone number set up." } as const;
  if (!twilioConfigured()) return { error: "Twilio isn't connected (add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN)." } as const;
  if (opts.contactId) {
    const [c] = await db.select({ out: contacts.smsOptOut }).from(contacts).where(eq(contacts.id, opts.contactId));
    if (c?.out) return { error: "This customer replied STOP, so they can't be texted until they reply START." } as const;
  }
  const text = body.trim().slice(0, 1500);
  let sid: string | null = null;
  let status = "sent";
  let error: string | undefined;
  try {
    sid = await sendTwilioSms(p.number, to, text, opts.statusCallback);
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : "send failed";
    console.error("sms send failed", error);
  }
  const [m] = await db
    .insert(inboxMessages)
    .values({
      channel: "sms", businessId: b.id, conversationId: opts.conversationId ?? null, contactId: opts.contactId ?? null,
      direction: "out", author: opts.author, body: text, fromAddr: p.number, toAddr: to, externalId: sid, status, sentById: opts.sentById ?? null,
    })
    .returning();
  if (opts.conversationId) await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, opts.conversationId));
  return error ? ({ error, message: m } as const) : ({ message: m } as const);
}

/** Handle one incoming text. Logs it, handles STOP/START, and (if on) lets the AI reply. */
export async function handleInboundSms(b: Business, from: string, body: string, sid: string | null) {
  const phone = toE164(from) ?? from;
  const contact = await contactForPhone(b, phone);
  const leadId = await leadForContact(b, contact, "Text message");
  const conv = await smsConversation(b, phone, contact, leadId);
  const p = phoneSettings(b);
  await db.insert(inboxMessages).values({
    channel: "sms", businessId: b.id, conversationId: conv.id, contactId: contact.id, direction: "in", author: "customer",
    body: body.slice(0, 1600), fromAddr: phone, toAddr: p.number ?? "", externalId: sid, status: "received",
  });
  await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, conv.id));

  // Twilio sends the carrier-required STOP/START confirmations itself; we just record the choice.
  if (OPT_OUT.test(body)) {
    await db.update(contacts).set({ smsOptOut: true }).where(eq(contacts.id, contact.id));
    return { replied: false, reason: "opted-out" };
  }
  if (OPT_IN.test(body) && contact.smsOptOut) {
    await db.update(contacts).set({ smsOptOut: false }).where(eq(contacts.id, contact.id));
    return { replied: false, reason: "opted-in" };
  }
  if (contact.smsOptOut) return { replied: false, reason: "opted-out" };
  if (!p.smsAssistant || conv.aiPaused || !assistantConfigured()) return { replied: false, reason: "ai-off" };

  // One AI turn at a time per conversation, using the latest history.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${conv.id}))`);
    const [fresh] = await db.select().from(chatConversations).where(eq(chatConversations.id, conv.id));
    if (!fresh || fresh.aiPaused) return { replied: false, reason: "ai-off" };
    if (fresh.userTurns >= 40) return { replied: false, reason: "limit" };
    const turn = await chatTurn(b, fresh, body, `sms:${phone}`);
    if (!turn.reply) return { replied: false, reason: "no-reply" };
    const sent = await sendBusinessSms(b, phone, turn.reply, { conversationId: conv.id, contactId: contact.id, author: "assistant" });
    return { replied: !("error" in sent && sent.error), reason: "ai" };
  });
}

/** After a missed call: text the caller so the conversation can continue by SMS. */
export async function missedCallTextBack(b: Business, from: string) {
  const p = phoneSettings(b);
  const phone = toE164(from);
  if (!phone || !p.missedCallTextBack) return false;
  const contact = await contactForPhone(b, phone);
  if (contact.smsOptOut) return false;
  // Don't text the same caller twice within 10 minutes (repeated attempts).
  const recent = await db
    .select({ id: inboxMessages.id })
    .from(inboxMessages)
    .where(and(eq(inboxMessages.businessId, b.id), eq(inboxMessages.toAddr, phone), eq(inboxMessages.author, "system"), eq(inboxMessages.channel, "sms"), gte(inboxMessages.createdAt, new Date(Date.now() - 10 * 60e3))))
    .limit(1);
  if (recent.length) return false;
  const leadId = await leadForContact(b, contact, "Missed call");
  const conv = await smsConversation(b, phone, contact, leadId);
  // "Sample Painting Co." + "." should read "Co." not "Co.."
  const text = p.missedCallMessage.replace(/\{business\}\./g, `${b.name.replace(/\.+$/, "")}.`).replace(/\{business\}/g, b.name);
  const sent = await sendBusinessSms(b, phone, text, { conversationId: conv.id, contactId: contact.id, author: "system" });
  // Put the text-back into the AI's history too, so its next reply has context.
  if (!("error" in sent && sent.error)) {
    await db
      .update(chatConversations)
      .set({ messages: sql`${chatConversations.messages} || ${JSON.stringify([{ role: "user", content: "[The customer called and nobody answered. This automatic text was sent to them:]" }, { role: "assistant", content: text }])}::jsonb` })
      .where(eq(chatConversations.id, conv.id));
  }
  return !("error" in sent && sent.error);
}

/** Text and email threads for the Inbox, newest first. */
export async function smsThreads(businessId: string, limit = 50) {
  const convs = await db
    .select({ conv: chatConversations, contact: contacts })
    .from(chatConversations)
    .leftJoin(contacts, eq(contacts.id, chatConversations.contactId))
    .where(and(eq(chatConversations.businessId, businessId), inArray(chatConversations.channel, ["sms", "email"])))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(limit);
  if (!convs.length) return [];
  const last = await db
    .selectDistinctOn([inboxMessages.conversationId], { conversationId: inboxMessages.conversationId, body: inboxMessages.body, author: inboxMessages.author, createdAt: inboxMessages.createdAt })
    .from(inboxMessages)
    .where(inArray(inboxMessages.conversationId, convs.map((c) => c.conv.id)))
    .orderBy(inboxMessages.conversationId, desc(inboxMessages.createdAt));
  const byConv = Object.fromEntries(last.map((l) => [l.conversationId, l]));
  return convs.map((c) => ({ ...c, last: byConv[c.conv.id] ?? null }));
}
