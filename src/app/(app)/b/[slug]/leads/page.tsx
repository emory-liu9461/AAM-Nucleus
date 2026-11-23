import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createLead, setLeadStage } from "@/app/actions";
import { getBusiness } from "@/lib/business";
import { fmtDate, label, money } from "@/lib/format";
import { Badge } from "@/components/Badge";

const { leads, contacts, users, leadStage, leadSource } = schema;
const OPEN = ["new", "contacted", "site_visit", "estimate_sent"] as const;

export default async function LeadsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ slug }, { view = "open" }] = await Promise.all([params, searchParams]);
  const b = await getBusiness(slug);
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

  const stageTotals = await db
    .select({ stage: leads.stage, c: sql<number>`count(*)`, v: sql<number>`coalesce(sum(${leads.estimatedValue}),0)` })
    .from(leads)
    .where(and(eq(leads.businessId, b.id), sql`${leads.stage} not in ('won','lost')`))
    .groupBy(leads.stage);

  return (
    <div className="space-y-5">
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
            {rows.map(({ lead, first, last, phone, addedBy }) => (
              <tr key={lead.id}>
                <td><div className="font-medium">{first} {last}</div><div className="text-xs text-muted">{phone}</div></td>
                <td>{lead.title}</td>
                <td className="text-muted">{label(lead.source)}</td>
                <td className="text-right">{money(lead.estimatedValue)}</td>
                <td className="text-muted">{fmtDate(lead.createdAt)}</td>
                <td className="text-muted">{addedBy ?? "—"}</td>
                <td>
                  <form action={setLeadStage.bind(null, b.slug, lead.id)} className="flex items-center gap-1">
                    <select name="stage" defaultValue={lead.stage} className="input w-auto py-1 text-xs">
                      {leadStage.enumValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                    </select>
                    <button className="btn-ghost py-1 text-xs">Set</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-muted">Marking a lead <strong>Won</strong> automatically creates a job with the lead&apos;s value as the contract amount.</p>
    </div>
  );
}
