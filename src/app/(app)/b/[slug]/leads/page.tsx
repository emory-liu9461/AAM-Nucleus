import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createLead, setLeadStage } from "@/app/actions";
import { requireBusinessPage } from "@/lib/session";
import { messageFeed } from "@/lib/messages";
import { latestQuotes } from "@/lib/quotes";
import { can } from "@/lib/session";
import { fmtDate, label, money } from "@/lib/format";
import { Badge } from "@/components/Badge";

const { leads, contacts, users, leadStage, leadSource } = schema;
const OPEN = ["new", "contacted", "site_visit", "estimate_sent"] as const;

export default async function LeadsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ slug }, { view = "open" }] = await Promise.all([params, searchParams]);
  const { business: b, user } = await requireBusinessPage(slug);
  const filter =
    view === "won" ? sql`${leads.stage} = 'won'` : view === "lost" ? sql`${leads.stage} = 'lost'` : view === "all" ? sql`true` : sql`${leads.stage} not in ('won','lost')`;
  const rows = await db
    .select({ lead: leads, first: contacts.firstName, last: contacts.lastName, phone: contacts.phone, addedBy: users.name })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(users, eq(users.id, leads.createdById))
    .where(and(eq(leads.businessId, b.id), filter))
    .orderBy(desc(leads.createdAt))
    .limit(300);

  // Open leads are split into "not replied yet" and "replied" (same rules as the Messages page).
  const waitingContacts = new Set((await messageFeed(user.id, [b])).filter((i) => i.unread && i.contactId).map((i) => i.contactId));
  const isOpen = (stage: string) => stage !== "won" && stage !== "lost";
  const groups: [string | null, typeof rows][] =
    view === "open"
      ? [
          ["Open · not replied yet", rows.filter((r) => waitingContacts.has(r.lead.contactId))],
          ["Open · replied", rows.filter((r) => !waitingContacts.has(r.lead.contactId))],
        ]
      : [[null, rows]];

  // Pipeline totals for open leads: a lead's latest quote (price before tax, cost), else its estimated value.
  const money_ = can(user, "view_financials");
  const openLeads = money_ ? await db.select({ id: leads.id, est: leads.estimatedValue }).from(leads).where(and(eq(leads.businessId, b.id), sql`${leads.stage} not in ('won','lost')`)) : [];
  const lq = money_ ? new Map((await latestQuotes(b.id)).map((q) => [q.leadId, q])) : new Map();
  const pipe = { revenue: 0, tax: 0, cost: 0, quotedRevenue: 0, quoted: 0, estimated: 0, toApprove: 0, sent: 0, sentValue: 0 };
  for (const l of openLeads) {
    const q = lq.get(l.id);
    if (q && q.status !== "accepted") {
      pipe.revenue += q.price; pipe.tax += q.total - q.price; pipe.cost += q.cost; pipe.quotedRevenue += q.price; pipe.quoted++;
      if (q.status === "draft") pipe.toApprove++;
      if (q.status === "sent") { pipe.sent++; pipe.sentValue += q.total; }
    } else if (l.est) { pipe.revenue += l.est; pipe.estimated++; }
  }

  const stageTotals = await db
    .select({ stage: leads.stage, c: sql<number>`count(*)`, v: sql<number>`coalesce(sum(${leads.estimatedValue}),0)` })
    .from(leads)
    .where(and(eq(leads.businessId, b.id), sql`${leads.stage} not in ('won','lost')`))
    .groupBy(leads.stage);

  return (
    <div className="space-y-5">
      {money_ && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="card"><div className="text-xs text-muted">Potential revenue (open leads)</div><div className="mt-1 text-xl font-semibold">{money(pipe.revenue)}</div><div className="text-xs text-muted">{pipe.tax ? `${money(pipe.revenue + pipe.tax)} incl. tax · ` : ""}{pipe.quoted} quoted, {pipe.estimated} estimated</div></div>
          <div className="card"><div className="text-xs text-muted">Estimated cost</div><div className="mt-1 text-xl font-semibold">{money(pipe.cost)}</div><div className="text-xs text-muted">from quotes (labour, materials, other)</div></div>
          <div className="card"><div className="text-xs text-muted">Potential profit</div><div className={`mt-1 text-xl font-semibold ${pipe.quotedRevenue - pipe.cost < 0 ? "text-bad" : "text-good"}`}>{money(pipe.quotedRevenue - pipe.cost)}</div><div className="text-xs text-muted">{pipe.quotedRevenue ? `${Math.round(((pipe.quotedRevenue - pipe.cost) / pipe.quotedRevenue) * 100)}% margin on quoted leads` : "on quoted leads"}</div></div>
          <div className="card"><div className="text-xs text-muted">Quotes waiting</div><div className="mt-1 text-xl font-semibold">{pipe.toApprove} to approve · {pipe.sent} sent</div><div className="text-xs text-muted">{pipe.sentValue ? `${money(pipe.sentValue)} out with customers` : "nothing out with customers"}</div></div>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {OPEN.map((s) => {
          const t = stageTotals.find((x) => x.stage === s);
          return (
            <div key={s} className="card">
              <Badge value={s} />
              <div className="mt-2 text-xl font-semibold">{money(Number(t?.v ?? 0))}</div>
              <div className="text-xs text-muted">{Number(t?.c ?? 0)} leads</div>
            </div>
          );
        })}
      </section>

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">+ New lead</summary>
        <form action={createLead.bind(null, b.slug)} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="field">First name<input className="input" name="firstName" required /></label>
          <label className="field">Last name<input className="input" name="lastName" /></label>
          <label className="field">Phone<input className="input" name="phone" type="tel" /></label>
          <label className="field">Email<input className="input" name="email" type="email" /></label>
          <label className="field">Address<input className="input" name="address" /></label>
          <label className="field">City<input className="input" name="city" /></label>
          <label className="field">Project<input className="input" name="title" placeholder="e.g. Roof replacement" required /></label>
          <label className="field">Est. value ($)<input className="input" name="estimatedValue" inputMode="decimal" placeholder="15000" /></label>
          <label className="field">Source
            <select className="input" name="source" defaultValue="website">
              {leadSource.enumValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </label>
          <label className="field sm:col-span-2 lg:col-span-3">Notes<input className="input" name="notes" /></label>
          <div className="flex items-end"><button className="btn w-full">Save lead</button></div>
        </form>
      </details>

      <div className="flex gap-1 text-sm">
        {["open", "won", "lost", "all"].map((v) => (
          <a key={v} href={`?view=${v}`} className={`rounded-lg px-3 py-1 ${view === v ? "bg-panel font-semibold border border-line" : "text-muted"}`}>
            {label(v)}
          </a>
        ))}
      </div>

      <section className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead>
            <tr><th>Customer</th><th>Project</th><th>Source</th><th className="text-right">Value</th><th>Created</th><th>Added by</th><th>Stage</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted">No leads here.</td></tr>}
            {groups.map(([title, list]) => [
              title && (
                <tr key={title}>
                  <td colSpan={7} className={`bg-bg text-xs font-semibold uppercase tracking-wide ${title.includes("not") && list.length ? "text-accent" : "text-muted"}`}>
                    {title} · {list.length}{title.includes("not") && list.length ? " (texts, emails, forms or calls waiting for your reply)" : ""}
                  </td>
                </tr>
              ),
              ...list.map(({ lead, first, last, phone, addedBy }) => (
              <tr key={lead.id}>
                <td><Link href={`/b/${b.slug}/leads/${lead.id}`} className="font-medium hover:text-accent hover:underline">{isOpen(lead.stage) && waitingContacts.has(lead.contactId) && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-accent align-middle" title="Not replied yet" />}{first} {last}</Link><div className="text-xs text-muted">{phone}</div></td>
                <td>
                  {lead.title}
                  {lead.notes && <div className="max-w-xs truncate text-xs text-muted" title={lead.notes}>{lead.notes}</div>}
                </td>
                <td className="text-muted">
                  {label(lead.source)}
                  {lead.attribution && (
                    <div className="text-xs" title={lead.attribution.page ?? ""}>
                      {[lead.attribution.utmMedium, lead.attribution.utmCampaign].filter(Boolean).join(" · ") || "Website form"}
                    </div>
                  )}
                </td>
                <td className="text-right">{money(lead.estimatedValue)}</td>
                <td className="text-muted">{fmtDate(lead.createdAt)}</td>
                <td className="text-muted">{addedBy ?? (lead.attribution ? "Website form" : "—")}</td>
                <td>
                  <form action={setLeadStage.bind(null, b.slug, lead.id)} className="flex items-center gap-1">
                    <select name="stage" defaultValue={lead.stage} className="input w-auto py-1 text-xs">
                      {leadStage.enumValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                    </select>
                    <button className="btn-ghost py-1 text-xs">Set</button>
                  </form>
                </td>
              </tr>
            )),
            ])}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-muted">Marking a lead <strong>Won</strong> automatically creates a job with the lead&apos;s value as the contract amount.</p>
    </div>
  );
}
