import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { saveContact } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Badge } from "@/components/Badge";
import { Transcript } from "@/components/Transcript";
import { ContactActions } from "@/components/ContactActions";
import { fmtDate, fmtDateTime, label, moneyExact } from "@/lib/format";
import { can, requireBusinessPage } from "@/lib/session";
import { businessTz, whenLabel } from "@/lib/calendar";
import { crewFor } from "@/lib/staff";
import { transcript } from "@/lib/assistant";
import { prettyPhone } from "@/lib/twilio";
import { STEPS } from "@/lib/workflow";

/*
 * One lead or customer: who they are, what they've asked for, the work we've done, what
 * they've spent and owe, and every conversation with them in one timeline.
 */

const { contacts, leads, jobs, invoices, payments, scheduleEvents, chatConversations, inboxMessages, calls, jobUpdates } = schema;

type Entry = { at: Date; kind: string; title: string; body?: string | null; dir?: "in" | "out"; extra?: React.ReactNode; href?: string };

export default async function ContactProfile({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { business: b, user } = await requireBusinessPage(slug);
  const money = can(user, "view_financials");
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.businessId, b.id)));
  if (!c) notFound();
  const tz = businessTz(b);

  const [leadRows, jobRows, invoiceRows, convs, callRows] = await Promise.all([
    db.select().from(leads).where(eq(leads.contactId, c.id)).orderBy(desc(leads.createdAt)),
    db.select().from(jobs).where(eq(jobs.contactId, c.id)).orderBy(desc(jobs.createdAt)),
    db
      .select({ inv: invoices, paid: sql<number>`(select coalesce(sum(p.amount),0) from payments p where p.invoice_id = "invoices"."id")` })
      .from(invoices)
      .where(eq(invoices.contactId, c.id))
      .orderBy(desc(invoices.issuedAt)),
    db.select().from(chatConversations).where(eq(chatConversations.contactId, c.id)).orderBy(desc(chatConversations.updatedAt)),
    db.select().from(calls).where(eq(calls.contactId, c.id)).orderBy(desc(calls.createdAt)).limit(100),
  ]);
  const jobIds = jobRows.map((j) => j.id);
  const convIds = convs.map((x) => x.id);
  const invIds = invoiceRows.map((r) => r.inv.id);
  const [events, msgs, updates, pays] = await Promise.all([
    jobIds.length ? db.select().from(scheduleEvents).where(inArray(scheduleEvents.jobId, jobIds)).orderBy(asc(scheduleEvents.startsAt)) : Promise.resolve([]),
    convIds.length ? db.select().from(inboxMessages).where(inArray(inboxMessages.conversationId, convIds)).orderBy(desc(inboxMessages.createdAt)).limit(300) : Promise.resolve([]),
    jobIds.length ? db.select().from(jobUpdates).where(inArray(jobUpdates.jobId, jobIds)).orderBy(desc(jobUpdates.createdAt)) : Promise.resolve([]),
    invIds.length ? db.select().from(payments).where(inArray(payments.invoiceId, invIds)).orderBy(desc(payments.receivedAt)) : Promise.resolve([]),
  ]);
  const crews = await crewFor(events.map((e) => e.id));
  const contactQuotes = money ? await db.select().from(schema.quotes).where(eq(schema.quotes.contactId, c.id)).orderBy(desc(schema.quotes.createdAt)) : [];
  const now = new Date();

  const isCustomer = jobRows.length > 0 || leadRows.some((l) => l.stage === "won");
  const openLeads = leadRows.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const activeJobs = jobRows.filter((j) => j.status === "scheduled" || j.status === "in_progress");
  const spent = pays.reduce((s, p) => s + p.amount, 0);
  const owing = invoiceRows.filter((r) => r.inv.status !== "void").reduce((s, r) => s + Math.max(0, r.inv.amount - Number(r.paid)), 0);
  const lifetime = jobRows.filter((j) => j.status !== "cancelled").reduce((s, j) => s + j.contractValue, 0);
  const upcoming = events.filter((e) => e.endsAt > now);
  const name = `${c.firstName} ${c.lastName}`.trim();

  // Everything that's happened with them, newest first.
  const AUTHOR: Record<string, string> = { customer: name || "Customer", assistant: "AI assistant", staff: "Team", system: "Automatic" };
  const timeline: Entry[] = [
    ...msgs
      .filter((m) => !updates.some((u) => u.message === m.body)) // workflow messages are shown once, as job updates
      .map((m) => ({ at: m.createdAt, kind: m.channel === "sms" ? "Text" : m.channel === "whatsapp" ? "WhatsApp" : "Email", dir: m.direction as "in" | "out", title: m.direction === "in" ? `From ${name || "the customer"}` : `To ${name || "the customer"} · ${AUTHOR[m.author]}`, body: (m.subject ? `${m.subject}\n` : "") + m.body, href: `/messages/open/${m.conversationId}` })),
    ...convs
      .filter((x) => x.channel === "web" && x.userTurns > 0)
      .map((x) => ({ at: x.createdAt, kind: "Chatbot", dir: "in" as const, title: `Website chat${x.status === "booked" ? " · booked a visit" : x.status === "handoff" ? " · asked for a person" : ""}`, body: x.summary, extra: <details className="mt-1"><summary className="cursor-pointer text-xs text-accent">Show the conversation</summary><Transcript lines={transcript(x.messages)} /></details> })),
    ...callRows.map((x) => ({
      at: x.createdAt, kind: "Call", dir: (x.direction === "out" ? "out" : "in") as "in" | "out",
      title: x.direction === "out"
        ? `You called them from Nucleus${x.status === "answered" ? `${x.durationSec ? ` · ${Math.max(1, Math.round(x.durationSec / 60))} min` : ""}` : x.status === "missed" ? " · no answer" : ""}`
        : x.status === "voicemail" ? `Voicemail${x.recordingSeconds ? ` (${x.recordingSeconds}s)` : ""}` : x.status === "missed" ? "Missed call" : `Call${x.durationSec ? ` · ${Math.max(1, Math.round(x.durationSec / 60))} min` : ""}`,
      body: x.textedBack ? "Texted back automatically" : null,
      extra: x.recordingUrl ? <audio controls preload="none" src={`/api/recordings/${x.id}`} className="mt-1 h-8 w-full max-w-sm" /> : null,
    })),
    ...updates.map((u) => ({ at: u.createdAt, kind: "Update", dir: "out" as const, title: `${STEPS.find((s) => s.key === u.kind)?.title ?? "Note"} · ${jobRows.find((j) => j.id === u.jobId)?.name ?? ""}${u.channels ? ` · sent by ${u.channels.replace("sms", "text").replace(",", " and ")}` : u.error ? " · not sent" : ""}`, body: u.kind === "progress" ? u.note : u.message })),
    ...leadRows.map((l) => ({ at: l.createdAt, kind: "Inquiry", title: `New inquiry: ${l.title} (${label(l.source)})`, body: l.notes, href: `/b/${b.slug}/leads/${l.id}` })),
    ...jobRows.map((j) => ({ at: j.createdAt, kind: "Job", title: `Job booked: ${j.name}`, body: null })),
    ...(money ? pays.map((p) => ({ at: p.receivedAt, kind: "Payment", title: `Payment received: ${moneyExact(p.amount)} (${p.method === "ach" ? "e-Transfer / bank" : label(p.method)})`, body: null })) : []),
  ].sort((a, b2) => b2.at.getTime() - a.at.getTime()).slice(0, 250);

  return (
    <div className="space-y-5">
      <Link href={`/b/${b.slug}/contacts`} className="text-sm text-muted hover:text-ink">← Contacts</Link>
      <header className="card flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold">{name || "Unnamed"}
            <span className={`rounded px-1.5 text-[11px] font-semibold uppercase ${isCustomer ? "bg-good/15 text-good" : "bg-accent/10 text-accent"}`}>{isCustomer ? "Customer" : "Lead"}</span>
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm [overflow-wrap:anywhere]">
            {c.phone && <a className="hover:underline" href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>📞 {prettyPhone(c.phone)}</a>}
            {c.email && <a className="hover:underline" href={`mailto:${c.email}`}>✉️ {c.email}</a>}
            {(c.address || c.city) && <span className="text-muted">📍 {[c.address, c.city, c.zip].filter(Boolean).join(", ")}</span>}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span>Found us: {label(c.source)}</span>
            <span>· {isCustomer ? "Customer" : "Contact"} since {fmtDate(c.createdAt)}</span>
            {c.marketingConsentAt && <span className="text-good">· OK to send offers (since {fmtDate(c.marketingConsentAt)})</span>}
            {c.smsOptOut && <span className="text-bad">· Opted out of texts</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {convs.filter((x) => x.channel !== "web").map((x) => (
            <a key={x.id} className="btn-ghost text-sm" href={`/messages/open/${x.id}`}>{x.channel === "sms" ? "Text conversation" : x.channel === "whatsapp" ? "WhatsApp conversation" : "Email conversation"}</a>
          ))}
        </div>
      </header>

      <section className={`grid gap-3 ${money ? "grid-cols-2 md:grid-cols-5" : "grid-cols-2 md:grid-cols-3"}`}>
        {money && <Tile label="Total spent" value={moneyExact(spent)} />}
        {money && <Tile label="Owing" value={moneyExact(owing)} tone={owing > 0 ? "bad" : undefined} />}
        <Tile label="Jobs" value={`${jobRows.filter((j) => j.status === "completed").length} done · ${activeJobs.length} active`} />
        {money && <Tile label="Lifetime job value" value={moneyExact(lifetime)} />}
        <Tile label="Open inquiries" value={String(openLeads.length)} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Section title="Current inquiries">
            {openLeads.length === 0 ? <Empty>No open inquiries.</Empty> : (
              <ul className="divide-y divide-line">
                {openLeads.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Link className="font-medium hover:underline" href={`/b/${b.slug}/leads/${l.id}`}>{l.title}</Link>
                    <span className="flex items-center gap-2 text-xs text-muted">{fmtDate(l.createdAt)} · {label(l.source)}{money && l.estimatedValue ? ` · ${moneyExact(l.estimatedValue)}` : ""} <Badge value={l.stage} /></span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {money && contactQuotes.length > 0 && (
            <Section title="Quotes">
              {(() => {
                const q = contactQuotes[0];
                return (
                  <Link href={`/b/${b.slug}/quotes/${q.id}`} className="block rounded-lg border border-accent/40 bg-accent/5 p-3 hover:border-accent">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{q.title}</span>
                      <Badge value={q.status} />
                    </div>
                    <div className="mt-1 text-2xl font-bold">{moneyExact(q.total)}<span className="ml-1 text-xs font-normal text-muted">{q.taxAmount ? `incl. ${q.taxLabel}` : "no tax"}</span></div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                      <span>{q.number}</span>
                      <span>Cost {moneyExact(q.cost)}</span>
                      <span className={q.price - q.cost < 0 ? "text-bad" : "text-good"}>Profit {moneyExact(q.price - q.cost)}</span>
                      {q.discount > 0 && <span>Discount {moneyExact(q.discount)}</span>}
                      {q.sentAt && <span>Sent {fmtDate(q.sentAt)}</span>}
                      {q.viewedAt && <span>Opened {fmtDate(q.viewedAt)}</span>}
                      {q.acceptedAt && <span className="text-good">Accepted {fmtDate(q.acceptedAt)}</span>}
                    </div>
                  </Link>
                );
              })()}
              {contactQuotes.length > 1 && (
                <ul className="mt-2 divide-y divide-line text-sm">
                  {contactQuotes.slice(1).map((q) => (
                    <li key={q.id} className="flex items-center justify-between gap-2 py-1.5">
                      <Link className="hover:underline" href={`/b/${b.slug}/quotes/${q.id}`}>{q.number} · {q.title}</Link>
                      <span className="flex items-center gap-2 text-xs">{moneyExact(q.total)} <Badge value={q.status} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          <Section title="Jobs">
            {jobRows.length === 0 ? <Empty>No jobs yet.</Empty> : (
              <ul className="divide-y divide-line">
                {jobRows.map((j) => (
                  <li key={j.id} className="space-y-1 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{j.name}</span>
                      <span className="flex items-center gap-2 text-xs text-muted">{j.startDate ? `${fmtDate(j.startDate)}${j.endDate && j.endDate !== j.startDate ? ` – ${fmtDate(j.endDate)}` : ""}` : "Not scheduled"}{money ? ` · ${moneyExact(j.contractValue)}` : ""} <Badge value={j.status} /></span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs">
                      {j.address && <span className="text-muted">{j.address}</span>}
                      <Link className="text-accent hover:underline" href={`/b/${b.slug}/jobs`}>Open in Jobs</Link>
                      <a className="text-accent hover:underline" href={`/p/${j.portalToken}`} target="_blank" rel="noreferrer">Customer&apos;s project page ↗</a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Conversation history">
            <p className="-mt-1 mb-2 text-xs text-muted">Every text, WhatsApp message, email, chatbot conversation, website form, call and automatic update, newest first.</p>
            {timeline.length === 0 ? <Empty>Nothing yet.</Empty> : (
              <ol className="space-y-3">
                {timeline.map((e, i) => (
                  <li key={i} className={`rounded-lg border border-line p-3 text-sm ${e.dir === "in" ? "border-l-4 border-l-accent" : e.dir === "out" ? "bg-bg" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span><span className="font-semibold uppercase tracking-wide text-muted">{e.kind}</span> · {e.title}</span>
                      <span className="text-muted">{fmtDateTime(e.at)}{e.href ? <> · <a className="text-accent hover:underline" href={e.href}>Open</a></> : null}</span>
                    </div>
                    {e.body && <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{e.body}</p>}
                    {e.extra}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <aside className="min-w-0 space-y-5">
          <Section title="Get in touch">
            <ContactActions slug={b.slug} contact={c} leadId={openLeads[0]?.id ?? null} businessName={b.name} yourPhones={(b.phoneSettings?.forwardTo ?? []).map(prettyPhone)} />
          </Section>

          <Section title="Upcoming visits">
            {upcoming.length === 0 ? <Empty>Nothing scheduled.</Empty> : (
              <ul className="space-y-2 text-sm">
                {upcoming.map((e) => (
                  <li key={e.id} className="rounded-lg border border-line p-2">
                    <div className="font-medium">{whenLabel(e, tz)}</div>
                    <div className="text-xs text-muted">{e.title}{(crews.get(e.id) ?? []).length ? ` · ${(crews.get(e.id) ?? []).map((x) => `${x.name.split(" ")[0]}${x.role ? ` (${x.role})` : ""}`).join(", ")}` : " · no crew yet"}</div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {money && (
            <Section title="Invoices">
              {invoiceRows.length === 0 ? <Empty>No invoices.</Empty> : (
                <ul className="divide-y divide-line text-sm">
                  {invoiceRows.map(({ inv, paid }) => {
                    const bal = inv.amount - Number(paid);
                    return (
                      <li key={inv.id} className="flex items-center justify-between gap-2 py-2">
                        <span>{inv.number}<span className="block text-xs text-muted">{fmtDate(inv.issuedAt)} · {moneyExact(inv.amount)}</span></span>
                        <span className="text-right text-xs">{inv.status === "void" ? <Badge value="void" /> : bal > 0 ? <a className="text-accent hover:underline" href={`/pay/${inv.payToken}`} target="_blank" rel="noreferrer">{moneyExact(bal)} owing ↗</a> : <span className="text-good">Paid ✓</span>}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          )}

          <Section title="Details and notes">
            <ActionForm action={saveContact.bind(null, b.slug, c.id)} submit="Save" className="grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="field">First name<input className="input" name="firstName" defaultValue={c.firstName} required /></label>
                <label className="field">Last name<input className="input" name="lastName" defaultValue={c.lastName} /></label>
              </div>
              <label className="field">Phone<input className="input" name="phone" type="tel" defaultValue={c.phone ?? ""} /></label>
              <label className="field">Email<input className="input" name="email" type="email" defaultValue={c.email ?? ""} /></label>
              <label className="field">Address<input className="input" name="address" defaultValue={c.address ?? ""} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="field">City<input className="input" name="city" defaultValue={c.city ?? ""} /></label>
                <label className="field">Postal code<input className="input" name="zip" defaultValue={c.zip ?? ""} /></label>
              </div>
              <label className="field">Notes (only your team sees these)<textarea className="input" name="notes" rows={4} defaultValue={c.notes ?? ""} placeholder="Gate code, dog's name, preferred colours, how they like to be contacted…" /></label>
            </ActionForm>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Tile({ label: l, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{l}</div>
      <div className={`mt-1 text-lg font-semibold ${tone === "bad" ? "text-bad" : ""}`}>{value}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="card-title">{title}</div>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted">{children}</p>;
