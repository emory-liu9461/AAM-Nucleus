import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { setLeadStage } from "@/app/actions";
import { Badge } from "@/components/Badge";
import { fmtDate, fmtDateTime, label, money } from "@/lib/format";
import { can, requireBusinessPage } from "@/lib/session";
import { transcript } from "@/lib/assistant";
import { Transcript } from "@/components/Transcript";

const { leads, contacts, users, jobs } = schema;

const INTAKE_LABELS: [keyof NonNullable<typeof leads.$inferSelect.intake>, string][] = [
  ["timeline", "When to start"],
  ["budgetRange", "Budget"],
  ["propertyType", "Property type"],
  ["homeowner", "Owns the property"],
  ["zip", "Postal / ZIP code"],
  ["contactMethod", "Best way to reach"],
  ["bestTime", "Best time"],
  ["preferredDate", "Preferred site visit"],
  ["heardAbout", "Heard about us"],
  ["marketingConsent", "OK to send offers (CASL)"],
];

export default async function LeadDetail({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { business: b, user } = await requireBusinessPage(slug);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [row] = await db
    .select({ lead: leads, contact: contacts, addedBy: users.name })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(users, eq(users.id, leads.createdById))
    .where(and(eq(leads.id, id), eq(leads.businessId, b.id)));
  if (!row) notFound();
  const { lead, contact: c, addedBy } = row;
  const [job] = await db.select({ id: jobs.id, name: jobs.name, status: jobs.status }).from(jobs).where(eq(jobs.leadId, lead.id));
  const others = await db.select({ id: leads.id, title: leads.title, stage: leads.stage, createdAt: leads.createdAt }).from(leads).where(and(eq(leads.contactId, c.id), eq(leads.businessId, b.id)));
  const [chat] = await db
    .select()
    .from(schema.chatConversations)
    .where(and(eq(schema.chatConversations.leadId, lead.id), eq(schema.chatConversations.businessId, b.id), eq(schema.chatConversations.channel, "web")));
  const [inbox, callLog, threads] = await Promise.all([
    db.select().from(schema.inboxMessages).where(and(eq(schema.inboxMessages.contactId, c.id), eq(schema.inboxMessages.businessId, b.id))).orderBy(desc(schema.inboxMessages.createdAt)).limit(12),
    db.select().from(schema.calls).where(and(eq(schema.calls.contactId, c.id), eq(schema.calls.businessId, b.id))).orderBy(desc(schema.calls.createdAt)).limit(10),
    db.select({ id: schema.chatConversations.id }).from(schema.chatConversations).where(and(eq(schema.chatConversations.contactId, c.id), eq(schema.chatConversations.businessId, b.id), sql`${schema.chatConversations.channel} <> 'web'`)).limit(1),
  ]);
  const a = lead.attribution;
  const intake = INTAKE_LABELS.filter(([k]) => lead.intake?.[k]);
  const phoneDigits = c.phone?.replace(/[^\d+]/g, "");

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/b/${b.slug}/leads`} className="text-sm text-muted hover:text-ink">← Leads</Link>
          <h1 className="text-2xl font-semibold">{c.firstName} {c.lastName}</h1>
          <p className="text-sm text-muted">
            {lead.title} · {fmtDateTime(lead.createdAt)} · {addedBy ? `added by ${addedBy}` : a ? "from the website" : "added manually"}
          </p>
        </div>
        <form action={setLeadStage.bind(null, b.slug, lead.id)} className="flex items-center gap-2">
          <Badge value={lead.stage} />
          <select name="stage" defaultValue={lead.stage} className="input w-auto">
            {schema.leadStage.enumValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
          <button className="btn">Update</button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card space-y-2 text-sm">
          <div className="card-title">Contact</div>
          {c.phone && <div className="flex gap-2"><a className="btn" href={`tel:${phoneDigits}`}>Call {c.phone}</a><a className="btn-ghost" href={`sms:${phoneDigits}`}>Text</a></div>}
          {c.email && <div><a className="text-accent hover:underline" href={`mailto:${c.email}`}>{c.email}</a></div>}
          {(c.address || c.city || c.zip) && <div className="text-muted">{[c.address, c.city, c.zip].filter(Boolean).join(", ")}</div>}
          {c.address && (
            <a className="text-xs text-accent hover:underline" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.address, c.city, c.zip].filter(Boolean).join(", "))}`}>Open in Google Maps ↗</a>
          )}
        </section>

        <section className="card text-sm lg:col-span-2">
          <div className="card-title">Project</div>
          <div className="font-medium">{lead.title}</div>
          {lead.notes ? <p className="mt-2 whitespace-pre-wrap">{lead.notes}</p> : <p className="mt-2 text-muted">No details given.</p>}
          {can(user, "view_financials") || lead.estimatedValue ? (
            <p className="mt-3 text-muted">Estimated value: <span className="text-ink">{money(lead.estimatedValue)}</span>{lead.intake?.budgetRange ? " (from the customer's budget range)" : ""}</p>
          ) : null}
          {job && <p className="mt-2">Job: <Link className="text-accent hover:underline" href={`/b/${b.slug}/jobs`}>{job.name}</Link> · {label(job.status)}</p>}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="card-title">Intake answers</div>
          {intake.length === 0 ? (
            <p className="text-sm text-muted">No intake answers. This lead came from a short form or was added manually.</p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {intake.map(([k, l]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{l}</dt>
                  <dd className="font-medium">{k === "preferredDate" ? fmtDate(lead.intake![k]!) : lead.intake![k]}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="card">
          <div className="card-title">Where they came from</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Source</dt><dd className="font-medium">{label(lead.source)}</dd>
            {a?.utmCampaign && (<><dt className="text-muted">Campaign</dt><dd>{a.utmCampaign}</dd></>)}
            {(a?.utmSource || a?.utmMedium) && (<><dt className="text-muted">Ad tags</dt><dd>{[a.utmSource, a.utmMedium].filter(Boolean).join(" / ")}</dd></>)}
            {a?.channel && (<><dt className="text-muted">Form</dt><dd>{a.channel === "site" ? "Your website" : a.channel === "embed" ? "Embedded form" : a.channel === "hosted" ? "Quote link" : "API / other form"}{a.formName ? ` (${a.formName})` : ""}</dd></>)}
            {a?.page && (<><dt className="text-muted">Page</dt><dd className="break-all text-xs">{a.page}</dd></>)}
            {a?.referrer && (<><dt className="text-muted">Referrer</dt><dd className="break-all text-xs">{a.referrer}</dd></>)}
          </dl>
        </section>
      </div>

      {(inbox.length > 0 || callLog.length > 0) && (
        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <div className="card-title mb-0">Texts, emails and calls</div>
            {threads[0] && <Link className="btn-ghost text-xs" href={`/b/${b.slug}/inbox?c=${threads[0].id}`}>Open in Inbox</Link>}
          </div>
          <ul className="divide-y divide-line text-sm">
            {[
              ...inbox.map((m) => ({ at: m.createdAt, key: m.id, text: `${m.channel === "sms" ? "Text" : "Email"} ${m.direction === "in" ? "from customer" : m.author === "assistant" ? "from AI assistant" : m.author === "staff" ? "from team" : "(automatic)"}`, body: m.body })),
              ...callLog.map((k) => ({ at: k.createdAt, key: k.id, text: `Call: ${k.status === "answered" ? "answered" : k.status === "voicemail" ? "voicemail left" : "missed"}`, body: k.recordingUrl ? "Voicemail recorded (play it under Inbox → Calls)" : "" })),
            ]
              .sort((x, y) => y.at.getTime() - x.at.getTime())
              .slice(0, 15)
              .map((r) => (
                <li key={r.key} className="py-2">
                  <div className="flex gap-2 text-xs text-muted"><span className="font-medium text-ink">{r.text}</span><span className="ml-auto">{fmtDateTime(r.at)}</span></div>
                  {r.body && <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-muted">{r.body}</p>}
                </li>
              ))}
          </ul>
        </section>
      )}

      {chat && (
        <section className="card">
          <div className="card-title">Website chat with the AI assistant</div>
          <Transcript lines={transcript(chat.messages)} />
        </section>
      )}

      {others.length > 1 && (
        <section className="card">
          <div className="card-title">Other requests from {c.firstName}</div>
          <ul className="divide-y divide-line text-sm">
            {others.filter((o) => o.id !== lead.id).map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-2">
                <Link className="text-accent hover:underline" href={`/b/${b.slug}/leads/${o.id}`}>{o.title}</Link>
                <Badge value={o.stage} /><span className="ml-auto text-xs text-muted">{fmtDate(o.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
