import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business, ChatConversation, Contact } from "@/db/schema";
import { assistantConfigured, chatTurn } from "./assistant";
import { notify } from "./alerts";
import { alertedRecently } from "./sms";

/*
 * Email for each business through Postmark: incoming mail arrives on the inbound
 * webhook, the AI replies (if on), and staff can reply from the Inbox.
 *
 * Env: POSTMARK_SERVER_TOKEN (sending) and POSTMARK_INBOUND_TOKEN (a secret you put in
 * the inbound webhook URL, so only Postmark can post mail to Nucleus).
 */

const { businesses, contacts, leads, chatConversations, inboxMessages } = schema;

export const postmarkConfigured = () => Boolean(process.env.POSTMARK_SERVER_TOKEN);

export function emailSettings(b: Pick<Business, "emailSettings" | "email" | "name" | "phone" | "domain">) {
  const e = b.emailSettings ?? {};
  const inbound = e.inboundAddress?.toLowerCase() || b.email?.toLowerCase() || null;
  return {
    inboundAddress: inbound,
    fromAddress: e.fromAddress?.toLowerCase() || inbound,
    fromName: e.fromName || b.name,
    aiReplies: e.aiReplies ?? true,
    signature: e.signature ?? [b.name, b.phone, b.domain].filter(Boolean).join("\n"),
  };
}

const cleanEmail = (s: string | null | undefined) => {
  const m = (s ?? "").toLowerCase().match(/[^\s<>"',;]+@[^\s<>"',;]+\.[a-z]{2,}/);
  return m ? m[0] : null;
};

/** Which business an incoming email was sent to (its inbound address, or its business email). */
export async function businessByEmail(addresses: string[]) {
  const list = addresses.map(cleanEmail).filter(Boolean) as string[];
  if (!list.length) return null;
  const all = await db.select().from(businesses).where(eq(businesses.archived, false));
  return all.find((b) => {
    const s = emailSettings(b);
    return list.includes(s.inboundAddress ?? "") || list.includes(s.fromAddress ?? "");
  }) ?? null;
}

async function contactForEmail(b: Business, email: string, name: string): Promise<Contact> {
  const [found] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.businessId, b.id), sql`lower(${contacts.email}) = ${email}`))
    .orderBy(desc(contacts.createdAt))
    .limit(1);
  if (found) return found;
  const [first, ...rest] = (name || email.split("@")[0]).trim().split(/\s+/);
  const [c] = await db.insert(contacts).values({ businessId: b.id, firstName: first.slice(0, 100), lastName: rest.join(" ").slice(0, 100), email, source: "website" }).returning();
  return c;
}

async function leadForEmail(b: Business, contact: Contact, subject: string) {
  const since = new Date(Date.now() - 60 * 864e5);
  const [open] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.contactId, contact.id), eq(leads.businessId, b.id), gte(leads.createdAt, since), sql`${leads.stage} not in ('won','lost')`))
    .orderBy(desc(leads.createdAt))
    .limit(1);
  if (open) return { id: open.id, created: false };
  const [l] = await db
    .insert(leads)
    .values({ businessId: b.id, contactId: contact.id, title: "Email", source: contact.source, notes: subject ? `Subject: ${subject}` : null, attribution: { channel: "chat", formName: "email" } })
    .returning({ id: leads.id });
  return { id: l.id, created: true };
}

export async function emailConversation(b: Business, email: string, contact: Contact, leadId: string | null): Promise<ChatConversation> {
  const since = new Date(Date.now() - 30 * 864e5);
  const [existing] = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.businessId, b.id), eq(chatConversations.channel, "email"), eq(chatConversations.address, email), gte(chatConversations.updatedAt, since)))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(1);
  if (existing) return existing;
  const [c] = await db
    .insert(chatConversations)
    .values({ businessId: b.id, channel: "email", address: email, token: randomBytes(24).toString("hex"), contactId: contact.id, leadId, attribution: { channel: "chat", formName: "email" } })
    .returning();
  return c;
}

/** Low-level send through Postmark. Returns the Message-ID header value. */
export async function postmarkSend(m: {
  from: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  headers?: { Name: string; Value: string }[];
  attachments?: { Name: string; Content: string; ContentType: string }[]; // Content is base64
}) {
  const api = (process.env.POSTMARK_API_BASE ?? "https://api.postmarkapp.com").replace(/\/$/, "");
  const res = await fetch(`${api}/email`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN ?? "" },
    body: JSON.stringify({ From: m.from, To: m.to, ReplyTo: m.replyTo ?? undefined, Subject: m.subject.slice(0, 200), TextBody: m.text, Headers: m.headers ?? [], Attachments: m.attachments?.length ? m.attachments : undefined, MessageStream: "outbound" }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as { MessageID?: string; ErrorCode?: number; Message?: string };
  if (!res.ok || json.ErrorCode) throw new Error(`Postmark ${res.status} (${json.ErrorCode ?? "?"}): ${json.Message ?? "send failed"}`);
  return json.MessageID ? `<${json.MessageID}@mtasv.net>` : null;
}

/** Send an email from the business and log it in the Inbox. */
export async function sendBusinessEmail(
  b: Business,
  to: string,
  subject: string,
  body: string,
  opts: { conversationId?: string | null; contactId?: string | null; author: "assistant" | "staff" | "system"; sentById?: string | null; inReplyTo?: string | null; automated?: boolean },
) {
  const s = emailSettings(b);
  if (!s.fromAddress) return { error: "Set the business email address first (Inbox → Settings)." } as const;
  if (!postmarkConfigured()) return { error: "Email isn't connected (add POSTMARK_SERVER_TOKEN)." } as const;
  const text = `${body.trim()}\n\n${s.signature}`.slice(0, 20000);
  const headers = [
    ...(opts.inReplyTo ? [{ Name: "In-Reply-To", Value: opts.inReplyTo }, { Name: "References", Value: opts.inReplyTo }] : []),
    ...(opts.automated ? [{ Name: "Auto-Submitted", Value: "auto-replied" }] : []),
  ];
  let externalId: string | null = null;
  let status = "sent";
  let error: string | undefined;
  try {
    externalId = await postmarkSend({ from: `"${s.fromName.replace(/"/g, "")}" <${s.fromAddress}>`, to, replyTo: s.inboundAddress ?? s.fromAddress, subject, text, headers });
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : "send failed";
    console.error("email send failed", error);
  }
  const [m] = await db
    .insert(inboxMessages)
    .values({
      channel: "email", businessId: b.id, conversationId: opts.conversationId ?? null, contactId: opts.contactId ?? null, direction: "out", author: opts.author,
      subject, body: text, fromAddr: s.fromAddress, toAddr: to, externalId, status, sentById: opts.sentById ?? null,
    })
    .returning();
  if (opts.conversationId) await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, opts.conversationId));
  return error ? ({ error, message: m } as const) : ({ message: m } as const);
}

/** Postmark inbound webhook payload (the fields we use). */
export type InboundEmail = {
  FromFull?: { Email?: string; Name?: string };
  From?: string;
  FromName?: string;
  To?: string;
  ToFull?: { Email?: string }[];
  CcFull?: { Email?: string }[];
  OriginalRecipient?: string;
  Subject?: string;
  TextBody?: string;
  StrippedTextReply?: string;
  MessageID?: string;
  Headers?: { Name: string; Value: string }[];
};

const header = (p: InboundEmail, name: string) => p.Headers?.find((h) => h.Name.toLowerCase() === name.toLowerCase())?.Value ?? "";

/** Mail the AI must never answer: auto-replies, bounces, newsletters, robots, and ourselves. */
export function isAutomatedEmail(p: InboundEmail, from: string, ourAddresses: (string | null)[]) {
  const auto = header(p, "Auto-Submitted").toLowerCase();
  const precedence = header(p, "Precedence").toLowerCase();
  return (
    ourAddresses.includes(from) ||
    /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce[s]?|notifications?)[@+.-]/i.test(from) ||
    (auto !== "" && auto !== "no") ||
    ["bulk", "list", "junk", "auto_reply"].includes(precedence) ||
    Boolean(header(p, "List-Unsubscribe") || header(p, "List-Id") || header(p, "X-Autoreply") || header(p, "X-Autorespond")) ||
    /^yes/i.test(header(p, "X-Spam-Status"))
  );
}

/** Handle one incoming email: log it, then (if on) let the AI reply in the same thread. */
export async function handleInboundEmail(b: Business, p: InboundEmail) {
  const from = cleanEmail(p.FromFull?.Email ?? p.From);
  if (!from) return { replied: false, reason: "no-sender" };
  const s = emailSettings(b);
  const subject = (p.Subject ?? "").trim().slice(0, 200);
  // A crew member's calendar app answering a work invite: not a customer, so leave it out of the Inbox.
  if (/^(accepted|declined|tentative|tentatively accepted|new time proposed)\b/i.test(subject)) {
    const [crew] = await db.select({ id: schema.staffMembers.id }).from(schema.staffMembers).where(and(eq(schema.staffMembers.businessId, b.id), sql`lower(${schema.staffMembers.email}) = ${from}`)).limit(1);
    if (crew) return { replied: false, reason: "calendar-reply" };
  }
  const body = (p.StrippedTextReply?.trim() || p.TextBody?.trim() || "").slice(0, 8000);
  const contact = await contactForEmail(b, from, p.FromFull?.Name ?? p.FromName ?? "");
  const lead = await leadForEmail(b, contact, subject);
  const conv = await emailConversation(b, from, contact, lead.id);
  const messageId = header(p, "Message-ID") || null;
  await db.insert(inboxMessages).values({
    channel: "email", businessId: b.id, conversationId: conv.id, contactId: contact.id, direction: "in", author: "customer",
    subject, body: body || "(no text)", fromAddr: from, toAddr: s.inboundAddress ?? "", externalId: messageId, status: "received",
  });
  await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, conv.id));

  if (isAutomatedEmail(p, from, [s.inboundAddress, s.fromAddress])) return { replied: false, reason: "automated" };
  if (!body) return { replied: false, reason: "empty" };
  const aiOff = !s.aiReplies || conv.aiPaused || !assistantConfigured();
  const who = `${contact.firstName} ${contact.lastName}`.trim() || from;
  if (lead.created) {
    await notify(b, "newLead", { title: `New email from ${who}`, detail: `${subject || "(no subject)"}${aiOff ? "" : " · the AI is replying"}`, path: `/b/${b.slug}/inbox?c=${conv.id}` });
  } else if (aiOff && !(await alertedRecently(conv.id))) {
    await notify(b, "needsReply", { title: `Email from ${who} needs a reply`, detail: subject || undefined, path: `/b/${b.slug}/inbox?c=${conv.id}` });
  }
  if (aiOff) return { replied: false, reason: "ai-off" };

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${conv.id}))`);
    const [fresh] = await db.select().from(chatConversations).where(eq(chatConversations.id, conv.id));
    if (!fresh || fresh.aiPaused) return { replied: false, reason: "ai-off" };
    if (fresh.userTurns >= 20) return { replied: false, reason: "limit" };
    const turn = await chatTurn(b, fresh, subject && !fresh.messages.length ? `Subject: ${subject}\n\n${body}` : body, `email:${from}`);
    if (!turn.reply) return { replied: false, reason: "no-reply" };
    const reSubject = /^re:/i.test(subject) ? subject : `Re: ${subject || `Your message to ${b.name}`}`;
    const sent = await sendBusinessEmail(b, from, reSubject, turn.reply, { conversationId: conv.id, contactId: contact.id, author: "assistant", inReplyTo: messageId, automated: true });
    return { replied: !("error" in sent && sent.error), reason: "ai" };
  });
}
