import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business } from "@/db/schema";
import { prettyPhone } from "./twilio";
import { transcript } from "./assistant";

/*
 * The Messages page: every conversation (texts, emails, website chats) and call across the
 * businesses a person can see, split into "not replied yet" and "replied".
 *
 * Unread means the customer wrote (or called and missed/left a voicemail) in the last 30 days,
 * since this person last opened it, and nobody on the team has replied since. "Mark unread"
 * forces it unread.
 */

const { chatConversations, inboxMessages, contacts, leads, calls, messageReads, messageHandled } = schema;

export type MessageKind = "sms" | "whatsapp" | "email" | "chat" | "form" | "call";
export type MessageItem = {
  kind: MessageKind;
  id: string;
  business: Pick<Business, "id" | "slug" | "name" | "color">;
  name: string;
  sub: string;
  snippet: string;
  from: "customer" | "team" | "ai" | "auto";
  at: Date;
  unread: boolean; // = not replied yet (stays until someone replies, or marks it replied)
  leadId: string | null;
  leadStage: string | null;
  contactId: string | null;
  who: "customer" | "lead"; // customer = we've done (or are doing) a job for them
  flag: string | null; // "Needs follow-up", "Booked", "Opted out"…
};

const LIMIT = 300;
/** An AI reply that hands the next step to a person ("someone will call you", "our team will be in touch") doesn't count as a reply. */
export const PROMISES_HUMAN = /\b(some(one|body)|a (team )?member|our (team|office|crew|estimator|owner|manager)|the (team|owner|office)|a person|one of (us|our [a-z]+)|we)( from [\w ]+)?('ll| will| can| are going to| shall)( be)? (call|contact|reach out|get back|follow up|be in touch|text|email|phone|give you a call|reply|respond)|\b(will|'ll) be in touch\b|\bget back to you\b|\bpassed (this|your [a-z ]+) (on|along)\b|\b(let|have) (the team|someone|our team) know\b|\b(have|ask|get) (the team|our team|someone|a team member|the owner|our [a-z]+) (to )?(call|contact|reach out|get back|follow up|text|email|phone)\b/i;
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
            lastAi: sql<Date | null>`max(${inboxMessages.createdAt}) filter (where ${inboxMessages.author} = 'assistant')`,
          })
          .from(inboxMessages)
          .where(inArray(inboxMessages.conversationId, convIds))
          .groupBy(inboxMessages.conversationId)
      : Promise.resolve([]),
    db
      .select({ call: calls, first: contacts.firstName, last: contacts.lastName, leadId: sql<string | null>`(select l.id from leads l where l.contact_id = ${calls.contactId} order by l.created_at desc limit 1)`, stage: sql<string | null>`(select l.stage::text from leads l where l.contact_id = ${calls.contactId} order by l.created_at desc limit 1)` })
      .from(calls)
      .leftJoin(contacts, eq(contacts.id, calls.contactId))
      .where(and(inArray(calls.businessId, ids), eq(calls.direction, "in")))
      .orderBy(desc(calls.createdAt))
      .limit(LIMIT),
  ]);
  // Website quote forms: each request is an item (keyed by the lead).
  const forms = await db
    .select({ l: leads, first: contacts.firstName, last: contacts.lastName, phone: contacts.phone, email: contacts.email })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .where(and(inArray(leads.businessId, ids), sql`coalesce(${leads.attribution}->>'channel', '') in ('site','hosted','embed','api')`))
    .orderBy(desc(leads.createdAt))
    .limit(LIMIT);
  const itemIds = [...convIds, ...callRows.map((r) => r.call.id), ...forms.map((f) => f.l.id)];
  // "Mark as replied" / "not replied" (shared by the team), and when the team last messaged each person from Nucleus.
  const handledRows = itemIds.length ? await db.select().from(messageHandled).where(inArray(messageHandled.itemId, itemIds)) : [];
  const handledOf = new Map(handledRows.map((r) => [r.itemId, r]));
  const contactIdsAll = [...new Set([...convs.map((r) => r.c.contactId), ...callRows.map((r) => r.call.contactId), ...forms.map((f) => f.l.contactId)].filter(Boolean))] as string[];
  const teamRows = contactIdsAll.length
    ? await db
        .select({ contactId: inboxMessages.contactId, at: sql<Date>`max(${inboxMessages.createdAt})` })
        .from(inboxMessages)
        .where(and(inArray(inboxMessages.contactId, contactIdsAll), eq(inboxMessages.direction, "out"), eq(inboxMessages.author, "staff")))
        .groupBy(inboxMessages.contactId)
    : [];
  // Calls placed from Nucleus that connected count as replies too.
  const callOuts = contactIdsAll.length
    ? await db
        .select({ contactId: calls.contactId, at: sql<Date>`max(${calls.createdAt})` })
        .from(calls)
        .where(and(inArray(calls.contactId, contactIdsAll), eq(calls.direction, "out"), eq(calls.status, "answered")))
        .groupBy(calls.contactId)
    : [];
  const teamOf = new Map<string | null, Date>(teamRows.map((r) => [r.contactId, r.at]));
  for (const r of callOuts) {
    const prev = teamOf.get(r.contactId);
    if (!prev || new Date(r.at) > new Date(prev)) teamOf.set(r.contactId, r.at);
  }
  const lastOf = new Map(lastMsgs.map((m) => [m.conversationId, m]));
  const statOf = new Map(stats.map((s) => [s.conversationId, s]));
  const t = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0);

  const items: MessageItem[] = [];
  const promised = new Set<string>(); // AI said a person will follow up
  const flagged = (status: string) => status === "handoff" || status === "booked";
  for (const { c, first, last, phone, optOut, stage } of convs) {
    const b = biz.get(c.businessId)!;
    const person = `${first ?? ""} ${last ?? ""}`.trim();
    const h = handledOf.get(c.id);
    let snippet = "";
    let from: MessageItem["from"] = "customer";
    let at = c.updatedAt;
    let lastCustomer = 0;
    let lastReply = 0;
    if (c.channel === "web") {
      const lines = transcript(c.messages).filter((l) => l.role !== "event");
      const end = lines[lines.length - 1];
      snippet = c.summary || end?.text || "Website chat";
      from = end?.role === "assistant" ? "ai" : "customer";
      // The chatbot answers every website chat; it only needs a person when it handed the visitor off
      // or told them someone will be in touch.
      const promisedHere = end?.role === "assistant" && PROMISES_HUMAN.test(end.text);
      if (promisedHere && !flagged(c.status)) promised.add(c.id);
      lastCustomer = c.status === "handoff" || promisedHere ? t(c.updatedAt) : 0;
      lastReply = t(c.contactId ? teamOf.get(c.contactId) : null);
    } else {
      const m = lastOf.get(c.id);
      const st = statOf.get(c.id);
      if (m) {
        snippet = (c.channel === "email" && m.subject && m.author === "customer" ? `${m.subject} · ` : "") + m.body;
        from = m.author === "customer" ? "customer" : m.author === "staff" ? "team" : m.author === "assistant" ? "ai" : "auto";
        at = m.createdAt;
      }
      lastCustomer = t(st?.lastCustomer);
      // A person's reply always counts (here, or a text/email/call to them elsewhere in Nucleus). The AI's
      // reply counts too, unless it handed off or promised that someone will get back to them.
      const aiPromised = m?.author === "assistant" && PROMISES_HUMAN.test(m.body);
      lastReply = Math.max(t(st?.lastTeam), t(c.contactId ? teamOf.get(c.contactId) : null), c.status === "handoff" || aiPromised ? 0 : t(st?.lastAi));
      if (aiPromised && !flagged(c.status)) promised.add(c.id);
    }
    const unread = h && h.handledAt === null ? true : lastCustomer > Math.max(lastReply, t(h?.handledAt), STALE());
    items.push({
      kind: c.channel === "web" ? "chat" : c.channel,
      id: c.id,
      business: b,
      name: person || (c.channel === "sms" || c.channel === "whatsapp" ? prettyPhone(c.address) : c.channel === "email" ? c.address ?? "" : "Website visitor"),
      sub: c.channel === "sms" || c.channel === "whatsapp" ? prettyPhone(c.address) : c.channel === "email" ? c.address ?? "" : phone ? prettyPhone(phone) : "Website chat",
      snippet: snippet.replace(/\s+/g, " ").slice(0, 180),
      from,
      at,
      unread,
      leadId: c.leadId,
      leadStage: stage ?? null,
      contactId: c.contactId,
      who: "lead",
      flag: c.status === "handoff" ? "Needs follow-up" : c.status === "booked" ? "Booked" : promised.has(c.id) ? "AI promised a call back" : optOut && c.channel === "sms" ? "Opted out" : null,
    });
  }
  for (const { l, first, last, phone, email } of forms) {
    const h = handledOf.get(l.id);
    // Replied once someone texts/emails them from Nucleus, the lead moves past "New", or it's marked replied.
    const replied = Math.max(t(teamOf.get(l.contactId)), t(h?.handledAt)) > l.createdAt.getTime() || l.stage !== "new";
    const unread = h && h.handledAt === null ? true : !replied && l.createdAt.getTime() > STALE();
    items.push({
      kind: "form",
      id: l.id,
      business: biz.get(l.businessId)!,
      name: `${first} ${last}`.trim() || email || "Website visitor",
      sub: [phone ? prettyPhone(phone) : null, email].filter(Boolean).join(" · ") || "Website form",
      snippet: [l.title, l.notes].filter(Boolean).join(" · ").replace(/\s+/g, " ").slice(0, 180),
      from: "customer",
      at: l.createdAt,
      unread,
      leadId: l.id,
      leadStage: l.stage,
      contactId: l.contactId,
      who: "lead",
      flag: l.intake?.timeline?.startsWith("As soon") ? "Urgent" : null,
    });
  }

  for (const { call, first, last, leadId, stage } of callRows) {
    const b = biz.get(call.businessId)!;
    const h = handledOf.get(call.id);
    const needsYou = call.status === "missed" || call.status === "voicemail";
    const calledBack = Math.max(t(call.contactId ? teamOf.get(call.contactId) : null), t(h?.handledAt)) > call.createdAt.getTime();
    const unread = h && h.handledAt === null ? true : needsYou && !calledBack && call.createdAt.getTime() > STALE();
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
  // Not replied first, then replied; newest first within each (the page can re-sort).
  return items.sort((a, b) => Number(b.unread) - Number(a.unread) || b.at.getTime() - a.at.getTime());
}

/** Mark something read (or unread) for one person. */
export async function setRead(userId: string, itemId: string, read: boolean) {
  await db
    .insert(messageReads)
    .values({ userId, itemId, readAt: read ? new Date() : null })
    .onConflictDoUpdate({ target: [messageReads.userId, messageReads.itemId], set: { readAt: read ? new Date() : null } });
}

/** Mark an item replied (e.g. you called back from your cell) or not replied, for the whole team. */
export async function setHandled(itemId: string, userId: string, handled: boolean) {
  const v = { handledAt: handled ? new Date() : null, userId, updatedAt: new Date() };
  await db.insert(messageHandled).values({ itemId, ...v }).onConflictDoUpdate({ target: messageHandled.itemId, set: v });
}

export async function unreadCount(userId: string, list: Business[]) {
  return (await messageFeed(userId, list)).filter((i) => i.unread).length;
}
