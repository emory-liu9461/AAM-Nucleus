import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendInboxReply, setConversationAi } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { fmtDateTime } from "@/lib/format";
import { requireBusinessPage } from "@/lib/session";
import { smsThreads } from "@/lib/sms";
import { prettyPhone } from "@/lib/twilio";

const AUTHOR: Record<string, string> = { customer: "", assistant: "AI assistant", staff: "Team", system: "Automatic" };

export default async function InboxPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string; ch?: string }> }) {
  const [{ slug }, { c, ch }] = await Promise.all([params, searchParams]);
  const { business: b } = await requireBusinessPage(slug);
  const all = await smsThreads(b.id, 100);
  const threads = ch === "sms" || ch === "email" ? all.filter((t) => t.conv.channel === ch) : all;
  const active = threads.find((t) => t.conv.id === c) ?? threads[0];
  const msgs = active
    ? await db.select().from(schema.inboxMessages).where(and(eq(schema.inboxMessages.conversationId, active.conv.id), eq(schema.inboxMessages.businessId, b.id))).orderBy(asc(schema.inboxMessages.createdAt))
    : [];
  const who = (t: (typeof all)[number]) =>
    t.contact ? `${t.contact.firstName} ${t.contact.lastName}`.trim() : t.conv.channel === "sms" ? prettyPhone(t.conv.address) : t.conv.address;
  const href = (id: string) => `?${new URLSearchParams({ ...(ch ? { ch } : {}), c: id })}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="card p-0">
        <div className="flex gap-1 border-b border-line p-2 text-xs">
          {[["", "All"], ["sms", "Texts"], ["email", "Email"]].map(([v, l]) => (
            <a key={l} href={v ? `?ch=${v}` : "?"} className={`rounded-md px-2.5 py-1 ${(ch ?? "") === v ? "bg-bg font-semibold" : "text-muted"}`}>{l}</a>
          ))}
        </div>
        {threads.length === 0 && <p className="p-4 text-sm text-muted">No conversations yet. Texts and emails to this business appear here.</p>}
        <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
          {threads.map((t) => {
            const waiting = t.last?.author === "customer";
            return (
              <li key={t.conv.id}>
                <Link href={href(t.conv.id)} className={`block px-3 py-2.5 hover:bg-bg ${active?.conv.id === t.conv.id ? "bg-bg" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{t.conv.channel === "sms" ? "Text" : "Email"}</span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${waiting ? "font-semibold" : ""}`}>{who(t)}</span>
                    {waiting && <span className="h-2 w-2 rounded-full bg-accent" title="Waiting for a reply" />}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">{t.last ? `${t.last.author !== "customer" ? `${AUTHOR[t.last.author]}: ` : ""}${t.last.body}` : ""}</div>
                  <div className="mt-0.5 flex gap-2 text-[11px] text-muted">
                    <span>{t.last ? fmtDateTime(t.last.createdAt) : ""}</span>
                    {t.conv.status === "booked" && <span className="text-good">Booked</span>}
                    {t.conv.status === "handoff" && <span className="text-bad">Needs follow-up</span>}
                    {t.conv.aiPaused && <span>AI paused</span>}
                    {t.contact?.smsOptOut && t.conv.channel === "sms" && <span className="text-bad">Opted out</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      {active ? (
        <section className="card flex min-h-[60vh] flex-col p-0">
          <header className="flex flex-wrap items-center gap-3 border-b border-line p-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{who(active)}</div>
              <div className="text-xs text-muted">{active.conv.channel === "sms" ? prettyPhone(active.conv.address) : active.conv.address}</div>
            </div>
            {active.conv.leadId && <Link className="btn-ghost text-xs" href={`/b/${b.slug}/leads/${active.conv.leadId}`}>View lead</Link>}
            <form action={setConversationAi.bind(null, b.slug, active.conv.id, !active.conv.aiPaused)}>
              <button className="btn-ghost text-xs">{active.conv.aiPaused ? "Let the AI reply again" : "Pause AI replies"}</button>
            </form>
          </header>
          <div className="flex-1 space-y-2.5 overflow-y-auto bg-bg p-4 text-sm">
            {msgs.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.direction === "out" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 ${m.direction === "out" ? "bg-accent text-white" : "border border-line bg-panel"}`}>
                  {m.channel === "email" && m.subject && <div className={`mb-1 text-xs font-semibold ${m.direction === "out" ? "text-white/85" : "text-muted"}`}>{m.subject}</div>}
                  {m.body}
                </div>
                <span className="mt-0.5 text-[11px] text-muted">
                  {m.direction === "out" ? AUTHOR[m.author] : "Customer"} · {fmtDateTime(m.createdAt)}
                  {m.status === "failed" && <span className="text-bad"> · failed to send</span>}
                </span>
              </div>
            ))}
          </div>
          <ActionForm action={sendInboxReply.bind(null, b.slug, active.conv.id)} submit={active.conv.channel === "sms" ? "Send text" : "Send email"} pendingText="Sending…" className="space-y-2 border-t border-line p-3" resetOnSuccess>
            <textarea name="body" required rows={active.conv.channel === "sms" ? 2 : 5} className="input" placeholder={active.conv.channel === "sms" ? "Type a text…" : "Write your reply… (your signature is added automatically)"} />
            <p className="text-xs text-muted">Replying yourself pauses the AI for this conversation.</p>
          </ActionForm>
        </section>
      ) : (
        <section className="card text-sm text-muted">Select a conversation.</section>
      )}
    </div>
  );
}
