import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { startCardPayment } from "@/app/payment-actions";
import { cardPaymentsOn, getCheckout, recordCheckout } from "@/lib/stripe";
import { logoFor, logoUrl } from "@/lib/site-defaults";
import { fmtDate, moneyExact } from "@/lib/format";

/* The customer's invoice and payment page (/pay/<token>): pay by card (Stripe) or e-Transfer. */

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const { invoices, businesses, contacts, payments, jobs } = schema;

export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ session_id?: string; error?: string }> }) {
  const [{ token }, { session_id, error }] = await Promise.all([params, searchParams]);
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const load = async () =>
    (
      await db
        .select({ inv: invoices, b: businesses, c: contacts, job: jobs.name, portal: jobs.portalToken, paid: sql<number>`(select coalesce(sum(p.amount),0) from payments p where p.invoice_id = "invoices"."id")` })
        .from(invoices)
        .innerJoin(businesses, eq(businesses.id, invoices.businessId))
        .innerJoin(contacts, eq(contacts.id, invoices.contactId))
        .leftJoin(jobs, eq(jobs.id, invoices.jobId))
        .where(eq(invoices.payToken, token))
    )[0];
  let row = await load();
  if (!row) notFound();
  // Back from Stripe: record the payment right away (the webhook also does, in case they don't come back).
  let justPaid = false;
  if (session_id) {
    try {
      const s = await getCheckout(row.b, session_id);
      if (s && s.metadata?.invoice_id === row.inv.id && s.payment_status === "paid") {
        await recordCheckout(row.b, s);
        justPaid = true;
        row = (await load())!;
      }
    } catch (e) {
      console.error("checkout lookup failed", e);
    }
  }
  const { inv, b, c } = row;
  const balance = Math.max(0, inv.amount - Number(row.paid));
  const card = cardPaymentsOn(b) && balance > 0 && inv.status !== "void";
  const ps = b.paymentSettings ?? {};
  const logo = logoFor(b);
  const overdue = balance > 0 && inv.dueAt < new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl(b)!} alt={b.name} className="h-10 w-auto max-w-[60%] object-contain object-left" />
          ) : (
            <span className="text-lg font-bold">{b.name}</span>
          )}
          {b.phone && <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`} className="text-sm font-medium text-muted hover:text-ink">{b.phone}</a>}
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
        {justPaid && <div className="card border-good/40 bg-good/10 text-sm font-medium">Thank you! Your payment went through. A receipt is on its way from Stripe.</div>}
        {error && <div className="card border-bad/40 bg-bad/10 text-sm">Card payment couldn&apos;t start right now. Please try again, or pay by e-Transfer below.</div>}

        <section className="card space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Invoice {inv.number}{c.firstName ? ` for ${c.firstName} ${c.lastName}`.trimEnd() : ""}</p>
              <h1 className="text-2xl font-bold">{balance > 0 ? `${moneyExact(balance)} due` : inv.status === "void" ? "This invoice was cancelled" : "Paid in full"}</h1>
              {balance > 0 && <p className={`text-sm ${overdue ? "text-bad" : "text-muted"}`}>Due {fmtDate(inv.dueAt)}{overdue ? " (overdue)" : ""}</p>}
            </div>
            {balance === 0 && inv.status !== "void" && <span className="rounded-full bg-good/15 px-3 py-1 text-sm font-semibold text-good">Paid ✓</span>}
          </div>
          <dl className="divide-y divide-line text-sm">
            {row.job && <Line k="Project" v={row.job} />}
            {inv.description && <Line k="For" v={inv.description} />}
            {inv.subtotal != null && <Line k="Subtotal" v={moneyExact(inv.subtotal)} />}
            {inv.taxAmount > 0 && <Line k={inv.taxLabel ?? "Tax"} v={moneyExact(inv.taxAmount)} />}
            <Line k="Total" v={moneyExact(inv.amount)} strong />
            {Number(row.paid) > 0 && <Line k="Paid" v={`− ${moneyExact(Number(row.paid))}`} />}
            {Number(row.paid) > 0 && <Line k="Balance" v={moneyExact(balance)} strong />}
          </dl>
        </section>

        {card && (
          <form action={startCardPayment.bind(null, token)} className="card space-y-2">
            <button className="btn w-full py-3 text-base" style={{ background: b.color }}>Pay {moneyExact(balance)} by card</button>
            <p className="text-center text-xs text-muted">Secure checkout by Stripe. Visa, Mastercard, Amex, Apple Pay and Google Pay.</p>
          </form>
        )}

        {balance > 0 && inv.status !== "void" && ps.etransferEmail && (
          <section className="card space-y-1 text-sm">
            <h2 className="font-semibold">Pay by Interac e-Transfer</h2>
            <p>Send <strong>{moneyExact(balance)}</strong> to <strong className="break-all">{ps.etransferEmail}</strong> and put <strong>{inv.number}</strong> in the message.</p>
            {ps.etransferNote && <p className="whitespace-pre-line text-muted">{ps.etransferNote}</p>}
          </section>
        )}
        {balance > 0 && !card && !ps.etransferEmail && <p className="card text-sm">Please contact {b.name}{b.phone ? ` at ${b.phone}` : ""} to arrange payment.</p>}

        {row.portal && <p className="text-center text-sm"><a className="text-accent hover:underline" href={`/p/${row.portal}`}>See your project page →</a></p>}
        <p className="text-center text-xs text-muted">This page is private to you. Questions about this invoice? Contact {b.name}{b.email ? ` at ${b.email}` : ""}.</p>
      </main>
    </div>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-2 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted"}>{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
