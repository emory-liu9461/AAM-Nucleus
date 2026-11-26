import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { markAllRead, markMessage } from "@/app/messages-actions";
import { sendInboxReply } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Transcript } from "@/components/Transcript";
import { fmtDateTime, label } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { messageFeed, type MessageItem } from "@/lib/messages";
import { transcript } from "@/lib/assistant";

/*
 * Every exchange with customers and leads, across all businesses this person can see:
 * texts, emails, website chats (the chatbot) and calls. Unread first, then read.
 */

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { sms: "Text", email: "Email", chat: "Chatbot", call: "Call" };
const FROM: Record<string, string> = { team: "You: ", ai: "AI: ", auto: "Automatic: ", customer: "" };

type Q = { view?: string; who?: string; via?: string; b?: string; sort?: string; open?: string };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const { user, businesses } = await requireSession();
  const scope = q.b ? businesses.filter((b) => b.slug === q.b) : businesses;

  // Opening an item goes through /messages/open/<id>, which marks it read first.

  const all = await messageFeed(user.id, scope);
  const filtered = all.filter(
    (i) =>
      (q.view === "unread" ? i.unread : q.view === "read" ? !i.unread : true) &&
      (q.who === "lead" || q.who === "customer" ? i.who === q.who : true) &&
      (q.via && KIND[q.via] ? i.kind === q.via : true),
  );
  const oldest = q.sort === "old";
  const byTime = (a: MessageItem, b: MessageItem) => (oldest ? a.at.getTime() - b.at.getTime() : b.at.getTime() - a.at.getTime());
  const unread = filtered.filter((i) => i.unread).sort(byTime);
  const read = filtered.filter((i) => !i.unread).sort(byTime);
  const open = all.find((i) => i.id === q.open) ?? null;
  const totalUnread = all.filter((i) => i.unread).length;

  const link = (patch: Partial<Q>) => {
    const p = new URLSearchParams(Object.entries({ ...q, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `?${p}`;
  };
  const Pill = ({ k, v, text, count }: { k: keyof Q; v: string; text: string; count?: number }) => (
    <Link href={link({ [k]: v, open: q.open })} className={`rounded-md px-2.5 py-1 ${(q[k] ?? "") === v ? "bg-bg font-semibold text-ink" : "text-muted hover:text-ink"}`}>
      {text}{count !== undefined ? ` (${count})` : ""}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Messages</h1>
          <p className="text-sm text-muted">Every text, email, chatbot conversation and call with your leads and customers{businesses.length > 1 ? ", across all businesses" : ""}.</p>
        </div>
        {totalUnread > 0 && (
          <form action={markAllRead.bind(null, q.b ?? null)}>
            <button className="btn-ghost text-sm">Mark all read</button>
          </form>
        )}
      </div>

      <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 p-2 text-sm">
        <div className="flex gap-1"><Pill k="view" v="" text="All" count={all.length} /><Pill k="view" v="unread" text="Unread" count={totalUnread} /><Pill k="view" v="read" text="Read" /></div>
        <div className="flex gap-1"><Pill k="who" v="" text="Everyone" /><Pill k="who" v="lead" text="Leads" /><Pill k="who" v="customer" text="Customers" /></div>
        <div className="flex gap-1"><Pill k="via" v="" text="All methods" /><Pill k="via" v="sms" text="Text" /><Pill k="via" v="email" text="Email" /><Pill k="via" v="chat" text="Chatbot" /><Pill k="via" v="call" text="Calls" /></div>
        <div className="flex gap-1"><Pill k="sort" v="" text="Newest first" /><Pill k="sort" v="old" text="Oldest first" /></div>
        {businesses.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <Pill k="b" v="" text="All businesses" />
            {businesses.map((b) => <Pill key={b.id} k="b" v={b.slug} text={b.name} />)}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
        <aside className="card p-0">
          {filtered.length === 0 && <p className="p-4 text-sm text-muted">Nothing here. Texts, emails, website chats and calls appear as they come in.</p>}
          <div className="max-h-[75vh] overflow-y-auto">
            {[["Unread", unread], ["Read", read]].map(([title, list]) =>
              (list as MessageItem[]).length ? (
                <div key={title as string}>
                  <div className="sticky top-0 z-10 border-b border-line bg-panel px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{title as string} · {(list as MessageItem[]).length}</div>
                  <ul className="divide-y divide-line">
                    {(list as MessageItem[]).map((i) => <Row key={i.id} i={i} active={i.id === q.open} href={`/messages/open/${i.id}${link({ open: undefined })}`} multi={businesses.length > 1} />)}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        </aside>
        {open ? <Detail i={open} /> : <section className="card text-sm text-muted">Pick a conversation to read and reply.</section>}
      </div>
    </div>
  );
}

function Row({ i, active, href, multi }: { i: MessageItem; active: boolean; href: string; multi: boolean }) {
  return (
    <li>
      {/* A plain link on purpose: Next's <Link> pre-loads visible links, which would mark everything read. */}
      <a href={href} className={`block px-3 py-2.5 hover:bg-bg ${active ? "bg-bg" : ""}`}>
        <div className="flex items-center gap-2">
          {i.unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-accent" title="Unread" /> : <span className="w-2 shrink-0" />}
          <span className={`min-w-0 flex-1 truncate text-sm ${i.unread ? "font-semibold" : ""}`}>{i.name}</span>
          <span className={`rounded px-1.5 text-[10px] font-semibold uppercase ${i.who === "customer" ? "bg-good/15 text-good" : "bg-accent/10 text-accent"}`}>{i.who === "customer" ? "Customer" : "Lead"}</span>
          <span className="text-[11px] text-muted">{fmtDateTime(i.at)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 pl-4 text-[11px] text-muted">
          <span className="font-semibold uppercase tracking-wide">{KIND[i.kind]}</span>
          {multi && <><span className="h-1.5 w-1.5 rounded-full" style={{ background: i.business.color }} /><span className="truncate">{i.business.name}</span></>}
          {i.leadStage && i.who === "lead" && <span>· {label(i.leadStage)}</span>}
          {i.flag && <span className={i.flag === "Booked" ? "text-good" : "text-bad"}>· {i.flag}</span>}
        </div>
        <div className={`mt-0.5 truncate pl-4 text-xs ${i.unread ? "text-ink" : "text-muted"}`}>{FROM[i.from]}{i.snippet}</div>
      </a>
    </li>
  );
}

async function Detail({ i }: { i: MessageItem }) {
  const b = i.business;
  const header = (
    <header className="flex flex-wrap items-center gap-3 border-b border-line p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-semibold">{i.name}
          <span className={`rounded px-1.5 text-[10px] font-semibold uppercase ${i.who === "customer" ? "bg-good/15 text-good" : "bg-accent/10 text-accent"}`}>{i.who === "customer" ? "Customer" : "Lead"}</span>
        </div>
        <div className="text-xs text-muted">{KIND[i.kind]} · {i.sub} · <span style={{ color: b.color }}>●</span> {b.name}</div>
      </div>
      {i.leadId && <Link className="btn-ghost text-xs" href={`/b/${b.slug}/leads/${i.leadId}`}>View lead</Link>}
      <form action={markMessage.bind(null, i.id, false)}><button className="btn-ghost text-xs">Mark unread</button></form>
    </header>
  );

  if (i.kind === "call") {
    const [call] = await db.select().from(schema.calls).where(eq(schema.calls.id, i.id));
    return (
      <section className="card flex flex-col p-0">
        {header}
        <div className="space-y-3 p-4 text-sm">
          <p><span className="font-medium">{i.snippet}</span> · {fmtDateTime(i.at)}</p>
          {call?.recordingUrl && <audio controls preload="none" src={`/api/recordings/${call.id}`} className="w-full" />}
          <div className="flex flex-wrap gap-2">
            <a className="btn" href={`tel:${call?.fromNumber ?? ""}`}>Call back</a>
            <Link className="btn-ghost" href={`/b/${b.slug}/inbox/calls`}>All calls</Link>
          </div>
        </div>
      </section>
    );
  }

  if (i.kind === "chat") {
    const [conv] = await db.select().from(schema.chatConversations).where(eq(schema.chatConversations.id, i.id));
    return (
      <section className="card flex flex-col p-0">
        {header}
        <div className="p-4">
          {conv?.summary && <p className="text-sm"><span className="font-medium">Summary:</span> {conv.summary}</p>}
          <Transcript lines={transcript(conv?.messages ?? [])} />
          <p className="mt-2 text-xs text-muted">Website chats are answered by the AI assistant. To follow up, call or text them from the lead.</p>
        </div>
      </section>
    );
  }

  const msgs = await db.select().from(schema.inboxMessages).where(and(eq(schema.inboxMessages.conversationId, i.id), eq(schema.inboxMessages.businessId, b.id))).orderBy(asc(schema.inboxMessages.createdAt));
  const AUTHOR: Record<string, string> = { customer: "Customer", assistant: "AI assistant", staff: "Team", system: "Automatic" };
  return (
    <section className="card flex min-h-[60vh] flex-col p-0">
      {header}
      <div className="max-h-[55vh] flex-1 space-y-2.5 overflow-y-auto bg-bg p-4 text-sm">
        {msgs.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.direction === "out" ? "items-end" : "items-start"}`}>
            <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 ${m.direction === "out" ? "bg-accent text-white" : "border border-line bg-panel"}`}>
              {m.channel === "email" && m.subject && <div className={`mb-1 text-xs font-semibold ${m.direction === "out" ? "text-white/85" : "text-muted"}`}>{m.subject}</div>}
              {m.body}
            </div>
            <span className="mt-0.5 text-[11px] text-muted">{AUTHOR[m.author]} · {fmtDateTime(m.createdAt)}{m.status === "failed" && <span className="text-bad"> · failed to send</span>}</span>
          </div>
        ))}
      </div>
      <ActionForm action={sendInboxReply.bind(null, b.slug, i.id)} submit={i.kind === "sms" ? "Send text" : "Send email"} pendingText="Sending…" className="space-y-2 border-t border-line p-3" resetOnSuccess>
        <textarea name="body" required rows={i.kind === "sms" ? 2 : 5} className="input" placeholder={i.kind === "sms" ? "Type a text…" : "Write your reply… (your signature is added automatically)"} />
        <p className="text-xs text-muted">Sent from {b.name}. Replying yourself pauses the AI for this conversation.</p>
      </ActionForm>
    </section>
  );
}
