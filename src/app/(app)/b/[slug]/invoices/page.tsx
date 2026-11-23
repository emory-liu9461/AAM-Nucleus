import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createInvoice, recordPayment, voidInvoice } from "@/app/actions";
import { getBusiness } from "@/lib/business";
import { fmtDate, label, money } from "@/lib/format";
import { Badge } from "@/components/Badge";
import { Kpi } from "@/components/Kpi";

const { invoices, payments, contacts, jobs, paymentMethod } = schema;

export default async function InvoicesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ slug }, { view = "open" }] = await Promise.all([params, searchParams]);
  const b = await getBusiness(slug);
  const today = new Date().toISOString().slice(0, 10);
  const filter =
    view === "open" ? sql`${invoices.status} in ('sent','partial')`
    : view === "overdue" ? sql`${invoices.status} in ('sent','partial') and ${invoices.dueAt} < ${today}`
    : view === "paid" ? sql`${invoices.status} = 'paid'` : sql`true`;
  const paidSql = sql<number>`(select coalesce(sum(amount),0) from ${payments} where ${payments.invoiceId} = ${invoices.id})`;
  const [rows, openJobs, aging] = await Promise.all([
    db
      .select({ inv: invoices, first: contacts.firstName, last: contacts.lastName, job: jobs.name, paid: paidSql })
      .from(invoices)
      .innerJoin(contacts, eq(contacts.id, invoices.contactId))
      .leftJoin(jobs, eq(jobs.id, invoices.jobId))
      .where(and(eq(invoices.businessId, b.id), filter))
      .orderBy(desc(invoices.issuedAt))
      .limit(300),
    db.select({ id: jobs.id, name: jobs.name }).from(jobs).where(and(eq(jobs.businessId, b.id), sql`${jobs.status} <> 'cancelled'`)).orderBy(desc(jobs.createdAt)).limit(200),
    db.execute(sql`
      select
        coalesce(sum(bal) filter (where days <= 0),0) as current,
        coalesce(sum(bal) filter (where days between 1 and 30),0) as d30,
        coalesce(sum(bal) filter (where days between 31 and 60),0) as d60,
        coalesce(sum(bal) filter (where days > 60),0) as d90
      from (
        select i.amount - coalesce((select sum(amount) from payments p where p.invoice_id = i.id),0) as bal,
               (${today}::date - i.due_at) as days
        from invoices i where i.business_id = ${b.id} and i.status in ('sent','partial')
      ) x`),
  ]);
  const a = (aging as unknown as Record<string, unknown>[])[0] ?? {};

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Current" value={money(Number(a.current ?? 0))} />
        <Kpi label="1–30 days overdue" value={money(Number(a.d30 ?? 0))} tone={Number(a.d30) > 0 ? "bad" : undefined} />
        <Kpi label="31–60 days overdue" value={money(Number(a.d60 ?? 0))} tone={Number(a.d60) > 0 ? "bad" : undefined} />
        <Kpi label="60+ days overdue" value={money(Number(a.d90 ?? 0))} tone={Number(a.d90) > 0 ? "bad" : undefined} />
      </section>

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">+ New invoice</summary>
        <form action={createInvoice.bind(null, b.slug)} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="field lg:col-span-2">Job
            <select className="input" name="jobId" required>
              {openJobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </label>
          <label className="field">Description<input className="input" name="description" placeholder="Progress payment #2" /></label>
          <label className="field">Amount ($)<input className="input" name="amount" inputMode="decimal" required /></label>
          <label className="field">Terms
            <select className="input" name="terms" defaultValue="15">
              <option value="0">Due on receipt</option><option value="15">Net 15</option><option value="30">Net 30</option>
            </select>
          </label>
          <div className="flex items-end lg:col-start-5"><button className="btn w-full">Create invoice</button></div>
        </form>
      </details>

      <div className="flex gap-1 text-sm">
        {["open", "overdue", "paid", "all"].map((v) => (
          <a key={v} href={`?view=${v}`} className={`rounded-lg px-3 py-1 ${view === v ? "bg-panel font-semibold border border-line" : "text-muted"}`}>{label(v)}</a>
        ))}
      </div>

      <section className="card overflow-x-auto p-0">
        <table className="tbl">
          <thead><tr><th>Invoice</th><th>Customer / job</th><th>Issued</th><th>Due</th><th className="text-right">Amount</th><th className="text-right">Balance</th><th>Status</th><th>Record payment</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted">No invoices here.</td></tr>}
            {rows.map(({ inv, first, last, job, paid }) => {
              const balance = inv.amount - Number(paid);
              const overdue = (inv.status === "sent" || inv.status === "partial") && inv.dueAt < today;
              const open = inv.status === "sent" || inv.status === "partial";
              return (
                <tr key={inv.id}>
                  <td><div className="font-medium">{inv.number}</div><div className="text-xs text-muted">{inv.description}</div></td>
                  <td><div>{first} {last}</div><div className="text-xs text-muted">{job}</div></td>
                  <td className="text-muted">{fmtDate(inv.issuedAt)}</td>
                  <td className={overdue ? "text-bad" : "text-muted"}>{fmtDate(inv.dueAt)}</td>
                  <td className="text-right">{money(inv.amount)}</td>
                  <td className="text-right">{inv.status === "void" ? "—" : money(balance)}</td>
                  <td><Badge value={overdue ? "overdue" : inv.status} /></td>
                  <td>
                    {open && (
                      <div className="flex items-center gap-1">
                        <form action={recordPayment.bind(null, b.slug, inv.id)} className="flex items-center gap-1">
                          <input className="input w-24 py-1 text-xs" name="amount" defaultValue={(balance / 100).toFixed(2)} />
                          <select className="input w-auto py-1 text-xs" name="method" defaultValue={inv.amount > 1_000_000 ? "ach" : "card"}>
                            {paymentMethod.enumValues.map((m) => <option key={m} value={m}>{label(m)}</option>)}
                          </select>
                          <button className="btn py-1 text-xs">Paid</button>
                        </form>
                        <form action={voidInvoice.bind(null, b.slug, inv.id)}>
                          <button className="btn-ghost py-1 text-xs" title="Void invoice">Void</button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
