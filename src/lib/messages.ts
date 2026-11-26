import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business } from "@/db/schema";
import { prettyPhone } from "./twilio";
import { transcript } from "./assistant";

/*
 * The Messages page: every conversation (texts, emails, website chats) and call across the
 * businesses a person can see, with their own read / unread state.
 *
 * Unread means the customer wrote (or called and missed/left a voicemail) in the last 30 days,
 * since this person last opened it, and nobody on the team has replied since. "Mark unread"
 * forces it unread.
 */

const { chatConversations, inboxMessages, contacts, leads, calls, messageReads } = schema;

export type MessageKind = "sms" | "email" | "chat" | "call";
export type MessageItem = {
  kind: MessageKind;
  id: string;
  business: Pick<Business, "id" | "slug" | "name" | "color">;
  name: string;
  sub: string;
  snippet: string;
  from: "customer" | "team" | "ai" | "auto";
  at: Date;
  unread: boolean;
  leadId: string | null;
  leadStage: string | null;
  contactId: string | null;
  who: "customer" | "lead"; // customer = we've done (or are doing) a job for them
  flag: string | null; // "Needs follow-up", "Booked", "Opted out"…
};

const LIMIT = 300;
// Anything older than this counts as read unless someone marks it unread (so old history doesn't flood "Unread").
const STALE = () => Date.now() - 30 * 864e5;

export async function messageFeed(userId: string, list: Business[]): Promise<MessageItem[]> {
  if (!list.length) return [];
  const ids = list.map((b) => b.id);
  const biz = new Map(list.map((b) => [b.id, b]));

  const convs = await db
    .select({ c: chatConversations, first: contacts.firstName, last: contacts.lastName, phone: contacts.phone, optOut: contacts.smsOptOut, stage: leads.stage })
    .from(chatConversations)
    .leftJoin(contacts, eq(contacts.id, chatConversations.contactId))
    .leftJoin(leads, eq(leads.id, chatConversations.leadId))
    .where(and(inArray(chatConversations.businessId, ids), sql`(${chatConversations.channel} <> 'web' or ${chatConversations.userTurns} > 0)`))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(LIMIT);
  const convIds = convs.map((r) => r.c.id);

  const [lastMsgs, stats, callRows] = await Promise.all([
    convIds.length
      ? db
          .selectDistinctOn([inboxMessages.conversationId], { conversationId: inboxMessages.conversationId, body: inboxMessages.body, author: inboxMessages.author, createdAt: inboxMessages.createdAt, subject: inboxMessages.subject })
          .from(inboxMessages)
          .where(inArray(inboxMessages.conversationId, convIds))
          .orderBy(inboxMessages.conversationId, desc(inboxMessages.createdAt))
      : Promise.resolve([]),
    convIds.length
      ? db
          .select({
            conversationId: inboxMessages.conversationId,
            lastCustomer: sql<Date | null>`max(${inboxMessages.createdAt}) filter (where ${inboxMessages.author} = 'customer')`,
            lastTeam: sql<Date | null>`max(${inboxMessages.createdAt}) filter (where ${inboxMessages.author} = 'staff')`,
          })
          .from(inboxMessages)
          .where(inArray(inboxMessages.conversationId, convIds))
          .groupBy(inboxMessages.conversationId)
      : Promise.resolve([]),
    db
      .select({ call: calls, first: contacts.firstName, last: contacts.lastName, leadId: sql<string | null>`(select l.id from leads l where l.contact_id = ${calls.contactId} order by l.created_at desc limit 1)`, stage: sql<string | null>`(select l.stage::text from leads l where l.contact_id = ${calls.contactId} order by l.created_at desc limit 1)` })
      .from(calls)
      .leftJoin(contacts, eq(contacts.id, calls.contactId))
      .where(inArray(calls.businessId, ids))
      .orderBy(desc(calls.createdAt))
      .limit(LIMIT),
  ]);
  const itemIds = [...convIds, ...callRows.map((r) => r.call.id)];
  const reads = itemIds.length ? await db.select().from(messageReads).where(and(eq(messageReads.userId, userId), inArray(messageReads.itemId, itemIds))) : [];
  const readOf = new Map(reads.map((r) => [r.itemId, r]));
  const lastOf = new Map(lastMsgs.map((m) => [m.conversationId, m]));
  const statOf = new Map(stats.map((s) => [s.conversationId, s]));
  const t = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0);

  const items: MessageItem[] = [];
  for (const { c, first, last, phone, optOut, stage } of convs) {
    const b = biz.get(c.businessId)!;
    const person = `${first ?? ""} ${last ?? ""}`.trim();
    const read = readOf.get(c.id);
    let snippet = "";
    let from: MessageItem["from"] = "customer";
    let at = c.updatedAt;
    let lastCustomer = 0;
    let lastTeam = 0;
    if (c.channel === "web") {
      const lines = transcript(c.messages).filter((l) => l.role !== "event");
      const end = lines[lines.length - 1];
      snippet = c.summary || end?.text || "Website chat";
      from = end?.role === "assistant" ? "ai" : "customer";
      lastCustomer = t(c.updatedAt); // web chats: the visitor's last message is when it was last updated
    } else {
      const m = lastOf.get(c.id);
      const st = statOf.get(c.id);
      if (m) {
        snippet = (c.channel === "email" && m.subject && m.author === "customer" ? `${m.subject} · ` : "") + m.body;
        from = m.author === "customer" ? "customer" : m.author === "staff" ? "team" : m.author === "assistant" ? "ai" : "auto";
        at = m.createdAt;
      }
      lastCustomer = t(st?.lastCustomer);
      lastTeam = t(st?.lastTeam);
    }
    const unread = read && read.readAt === null ? true : lastCustomer > Math.max(t(read?.readAt), lastTeam, STALE());
    items.push({
      kind: c.channel === "web" ? "chat" : c.channel,
      id: c.id,
      business: b,
      name: person || (c.channel === "sms" ? prettyPhone(c.address) : c.channel === "email" ? c.address ?? "" : "Website visitor"),
      sub: c.channel === "sms" ? prettyPhone(c.address) : c.channel === "email" ? c.address ?? "" : phone ? prettyPhone(phone) : "Website chat",
      snippet: snippet.replace(/\s+/g, " ").slice(0, 180),
      from,
      at,
      unread,
      leadId: c.leadId,
      leadStage: stage ?? null,
      contactId: c.contactId,
      who: "lead",
      flag: c.status === "handoff" ? "Needs follow-up" : c.status === "booked" ? "Booked" : optOut && c.channel === "sms" ? "Opted out" : null,
    });
  }
  for (const { call, first, last, leadId, stage } of callRows) {
    const b = biz.get(call.businessId)!;
    const read = readOf.get(call.id);
    const needsYou = call.status === "missed" || call.status === "voicemail";
    const unread = read ? read.readAt === null : needsYou && call.createdAt.getTime() > STALE();
    const person = `${first ?? ""} ${last ?? ""}`.trim();
    const mins = call.durationSec ? `${Math.max(1, Math.round(call.durationSec / 60))} min` : "";
    items.push({
      kind: "call",
      id: call.id,
      business: b,
      name: person || prettyPhone(call.fromNumber),
      sub: prettyPhone(call.fromNumber),
      snippet:
        call.status === "voicemail" ? `Voicemail${call.recordingSeconds ? ` (${call.recordingSeconds}s)` : ""}${call.textedBack ? " · texted back automatically" : ""}`
        : call.status === "missed" ? `Missed call${call.textedBack ? " · texted back automatically" : ""}`
        : call.status === "answered" ? `Answered call${mins ? ` · ${mins}` : ""}`
        : "Incoming call",
      from: "customer",
      at: call.createdAt,
      unread,
      leadId,
      leadStage: stage,
      contactId: call.contactId,
      who: "lead",
      flag: needsYou ? "Call back" : null,
    });
  }
  // Customers: anyone with a job (or a won lead); everyone else is a lead.
  const contactIds = [...new Set(items.map((i) => i.contactId).filter(Boolean))] as string[];
  if (contactIds.length) {
    const withJobs = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(inArray(contacts.id, contactIds), sql`(exists (select 1 from jobs j where j.contact_id = ${contacts.id}) or exists (select 1 from leads l where l.contact_id = ${contacts.id} and l.stage = 'won'))`));
    const customers = new Set(withJobs.map((r) => r.id));
    for (const i of items) if (i.contactId && customers.has(i.contactId)) i.who = "customer";
  }
  // Unread first, then read; newest first within each (the page can re-sort).
  return items.sort((a, b) => Number(b.unread) - Number(a.unread) || b.at.getTime() - a.at.getTime());
}

/** Mark something read (or unread) for one person. */
export async function setRead(userId: string, itemId: string, read: boolean) {
  await db
    .insert(messageReads)
    .values({ userId, itemId, readAt: read ? new Date() : null })
    .onConflictDoUpdate({ target: [messageReads.userId, messageReads.itemId], set: { readAt: read ? new Date() : null } });
}

export async function unreadCount(userId: string, list: Business[]) {
  return (await messageFeed(userId, list)).filter((i) => i.unread).length;
}
