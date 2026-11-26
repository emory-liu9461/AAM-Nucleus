import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { createInvoice, voidInvoice } from "@/app/actions";
import { requireBusinessPage } from "@/lib/session";
import { fmtDate, fmtDateTime, label, money, moneyExact } from "@/lib/format";
import { Badge } from "@/components/Badge";
import { Kpi } from "@/components/Kpi";
import { CopyButton } from "@/components/CopyButton";
import { ActionForm } from "@/components/ActionForm";
import { confirmPayment, recordPayment, removePayment, sendInvoiceLink } from "@/app/payment-actions";
import { HANDED_IN, PAYMENT_METHODS, paymentLabel } from "@/lib/payments";
import { businessTz } from "@/lib/calendar";
import { zonedToUtc } from "@/lib/availability";
import { appBase } from "@/lib/twilio";
import { cardPaymentsOn } from "@/lib/stripe";
import { headers } from "next/headers";
import Link from "next/link";

const { invoices, payments, contacts, jobs, users } = schema;
const confirmer = alias(users, "confirmer");

export default async function InvoicesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ slug }, { view = "open" }] = await Promise.all([params, searchParams]);
  const { business: b, user } = await requireBusinessPage(slug, "manage_invoices");
  const owner = user.role === "owner";
  const today = new Date().toISOString().slice(0, 10);
  const filter =
    view === "open" ? sql`${invoices.status} in ('sent','partial')`
    : view === "overdue" ? sql`${invoices.status} in ('sent','partial') and ${invoices.dueAt} < ${today}`
    : view === "paid" ? sql`${invoices.status} = 'paid'` : sql`true`;
  const paidSql = sql<number>`(select coalesce(sum(p.amount),0) from payments p where p.invoice_id = "invoices"."id")`;
  const [rows, openJobs, aging] = await Promise.all([
    db
      .select({ inv: invoices, first: contacts.firstName, last: contacts.lastName, job: jobs.name, paid: paidSql, by: users.name })
      .from(invoices)
      .innerJoin(contacts, eq(contacts.id, invoices.contactId))
      .leftJoin(users, eq(users.id, invoices.createdById))
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

  // Payments on the invoices shown, this month's money in by method, and cash/cheques waiting for an owner.
  const tz = businessTz(b);
  const [y, m] = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()).split("-").map(Number);
  const monthStart = zonedToUtc(y, m, 1, 0, 0, tz);
  const monthName = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-CA", { month: "long", timeZone: "UTC" });
  const payCols = { p: payments, by: users.name, confirmedBy: confirmer.name };
  const ids = rows.map((r) => r.inv.id);
  const [history, byMethod, toConfirm] = await Promise.all([
    ids.length
      ? db.select(payCols).from(payments).leftJoin(users, eq(users.id, payments.createdById)).leftJoin(confirmer, eq(confirmer.id, payments.confirmedById)).where(inArray(payments.invoiceId, ids)).orderBy(payments.receivedAt)
      : Promise.resolve([]),
    db.select({ method: payments.method, total: sql<number>`sum(${payments.amount})`, n: sql<number>`count(*)` }).from(payments)
      .where(and(eq(payments.businessId, b.id), sql`${payments.receivedAt} >= ${monthStart.toISOString()}`)).groupBy(payments.method),
    db.select({ ...payCols, number: invoices.number, first: contacts.firstName, last: contacts.lastName }).from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId)).innerJoin(contacts, eq(contacts.id, invoices.contactId))
      .leftJoin(users, eq(users.id, payments.createdById)).leftJoin(confirmer, eq(confirmer.id, payments.confirmedById))
      .where(and(eq(payments.businessId, b.id), sql`${payments.confirmedAt} is null`)).orderBy(payments.receivedAt),
  ]);
  const paysFor = (id: string) => history.filter((h) => h.p.invoiceId === id);
  const monthTotal = byMethod.reduce((n, r) => n + Number(r.total), 0);
  const methodTotals = PAYMENT_METHODS.map(([k, l]) => ({ k, l, ...(byMethod.find((r) => r.method === k) ?? { total: 0, n: 0 }) })).filter((r) => Number(r.n) > 0);
  const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const base = appBase(await headers());
  const cards = cardPaymentsOn(b);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Current" value={money(Number(a.current ?? 0))} />
        <Kpi label="1–30 days overdue" value={money(Number(a.d30 ?? 0))} tone={Number(a.d30) > 0 ? "bad" : undefined} />
        <Kpi label="31–60 days overdue" value={money(Number(a.d60 ?? 0))} tone={Number(a.d60) > 0 ? "bad" : undefined} />
        <Kpi label="60+ days overdue" value={money(Number(a.d90 ?? 0))} tone={Number(a.d90) > 0 ? "bad" : undefined} />
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Money in, {monthName}</h2>
          <span className="text-lg font-semibold">{moneyExact(monthTotal)}</span>
        </div>
        {methodTotals.length === 0 ? <p className="text-sm text-muted">No payments recorded yet this month.</p> : (
          <div className="flex flex-wrap gap-2 text-sm">
            {methodTotals.map((r) => (
              <span key={r.k} className="rounded-lg border border-line bg-bg px-3 py-1.5"><span className="text-muted">{r.l}</span> <strong>{moneyExact(Number(r.total))}</strong> <span className="text-xs text-muted">({Number(r.n)})</span></span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">Match these against your bank deposits and the cash you were handed.</p>
      </section>

      {toConfirm.length > 0 && (
        <section className="card space-y-3 border-amber-400/60">
          <h2 className="font-semibold">Cash and cheques to confirm ({toConfirm.length})</h2>
          <p className="text-sm text-muted">{owner ? "Recorded by your team. Confirm each one once the money is in your hands or the bank." : "Waiting for an owner to confirm these were handed in."}</p>
          <ul className="divide-y divide-line text-sm">
            {toConfirm.map((t) => (
              <li key={t.p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><strong>{moneyExact(t.p.amount)}</strong> {paymentLabel(t.p.method)} · {t.number} · {t.first} {t.last} · {fmtDate(t.p.receivedAt)} · recorded by {t.by ?? "someone"}{t.p.reference ? ` · ${t.p.reference}` : ""}</span>
                {owner && <form action={confirmPayment.bind(null, b.slug, t.p.id)}><button className="btn py-1 text-xs">Confirm received</button></form>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!cards && (
        <p className="card text-sm text-muted">
          Customers open each invoice from a link and see how to pay (e-Transfer, cheque, cash). Set those instructions, or connect Stripe to take cards too, in <Link className="text-accent hover:underline" href={`/b/${b.slug}/settings#payments`}>Settings → Payments</Link>.
        </p>
      )}

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">+ New invoice</summary>
        <form action={createInvoice.bind(null, b.slug)} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="field lg:col-span-2">Job
            <select className="input" name="jobId" required>
              {openJobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </label>
          <label className="field">Description<input className="input" name="description" placeholder="Progress payment #2" /></label>
          <label className="field">Amount before tax ($)
            <input className="input" name="amount" inputMode="decimal" required />
            <span className="font-normal">{b.taxRate ? `+ ${b.taxLabel || "tax"} ${Number(b.taxRate)}% added` : "No tax set (Settings → Sales tax)"}</span>
          </label>
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
          <thead><tr><th>Invoice</th><th>Customer / job</th><th>Issued</th><th>Due</th><th className="text-right">Amount</th><th className="text-right">Balance</th><th>Status and payments</th><th>Customer link</th><th>Record payment</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted">No invoices here.</td></tr>}
            {rows.map(({ inv, first, last, job, paid, by }) => {
              const balance = inv.amount - Number(paid);
              const overdue = (inv.status === "sent" || inv.status === "partial") && inv.dueAt < today;
              const open = inv.status === "sent" || inv.status === "partial";
              return (
                <tr key={inv.id}>
                  <td><div className="font-medium">{inv.number}</div><div className="text-xs text-muted">{inv.description}{by ? ` · by ${by}` : ""}</div></td>
                  <td><div>{first} {last}</div><div className="text-xs text-muted">{job}</div></td>
                  <td className="text-muted">{fmtDate(inv.issuedAt)}</td>
                  <td className={overdue ? "text-bad" : "text-muted"}>{fmtDate(inv.dueAt)}</td>
                  <td className="text-right">
                    {moneyExact(inv.amount)}
                    {inv.taxAmount > 0 && <div className="text-xs text-muted">incl. {inv.taxLabel} {moneyExact(inv.taxAmount)}</div>}
                  </td>
                  <td className="text-right">{inv.status === "void" ? "—" : moneyExact(balance)}</td>
                  <td className="min-w-56">
                    <Badge value={overdue ? "overdue" : inv.status} />
                    {paysFor(inv.id).length > 0 && (
                      <ul className="mt-1.5 space-y-1 text-xs">
                        {paysFor(inv.id).map(({ p, by, confirmedBy }) => (
                          <li key={p.id} className="flex flex-wrap items-center gap-x-1.5">
                            <span className="font-semibold">{moneyExact(p.amount)}</span>
                            <span>{paymentLabel(p.method)}</span>
                            <span className="text-muted">· {fmtDate(p.receivedAt)}{p.reference?.startsWith("stripe:") ? " · paid online" : by ? ` · by ${by}` : ""}</span>
                            {p.reference && !p.reference.startsWith("stripe:") && <span className="text-muted">· {p.reference}</span>}
                            {HANDED_IN.includes(p.method) && (p.confirmedAt
                              ? <span className="text-good" title={`Confirmed ${fmtDateTime(p.confirmedAt)}`}>✓ confirmed{confirmedBy && confirmedBy !== by ? ` by ${confirmedBy}` : ""}</span>
                              : <span className="rounded bg-amber-400/20 px-1 text-amber-700">to confirm</span>)}
                            {!p.reference?.startsWith("stripe:") && (owner || (!p.confirmedAt || p.createdById === user.id)) && (
                              <ActionForm action={removePayment.bind(null, b.slug, p.id)} submit="Remove" pendingText="…" confirm={`Remove the ${moneyExact(p.amount)} ${paymentLabel(p.method)} payment from ${inv.number}?`} className="inline [&_.btn]:border-0 [&_.btn]:bg-transparent [&_.btn]:p-0 [&_.btn]:text-xs [&_.btn]:text-muted [&_.btn]:shadow-none [&_.btn:hover]:text-bad"><span /></ActionForm>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>
                    {inv.status !== "void" && (
                      <div className="flex items-center gap-1">
                        <CopyButton value={`${base}/pay/${inv.payToken}`} />
                        {open && <ActionForm action={sendInvoiceLink.bind(null, b.slug, inv.id)} submit="Send" pendingText="Sending…" className="flex items-center gap-1 [&_.btn]:py-1 [&_.btn]:text-xs [&_p]:text-xs"><span /></ActionForm>}
                      </div>
                    )}
                  </td>
                  <td>
                    {open && (
                      <div className="flex items-start gap-1">
                        <details className="group">
                          <summary className="btn cursor-pointer list-none py-1 text-xs">Record payment</summary>
                          <ActionForm action={recordPayment.bind(null, b.slug, inv.id)} submit="Save payment" pendingText="Saving…" className="mt-2 grid w-64 gap-2 rounded-lg border border-line bg-panel p-3 text-xs [&_.btn]:py-1.5 [&_.btn]:text-xs">
                            <label className="field">Amount ($)<input className="input py-1 text-sm" name="amount" inputMode="decimal" defaultValue={(balance / 100).toFixed(2)} required /></label>
                            <label className="field">Paid by
                              <select className="input py-1 text-sm" name="method" defaultValue="etransfer">
                                {PAYMENT_METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                              </select>
                            </label>
                            <label className="field">Date received<input className="input py-1 text-sm" type="date" name="receivedOn" defaultValue={todayLocal} max={todayLocal} /></label>
                            <label className="field">Reference or note<input className="input py-1 text-sm" name="reference" placeholder="Cheque #, e-Transfer code…" maxLength={200} /></label>
                          </ActionForm>
                        </details>
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
