import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { approveQuote, deleteQuote, markQuoteSent, reopenQuote, saveQuote, sendQuote } from "@/app/quote-actions";
import { ActionForm } from "@/components/ActionForm";
import { Badge } from "@/components/Badge";
import { CopyField } from "@/components/CopyField";
import { QuoteBuilder } from "@/components/QuoteBuilder";
import { QuoteDocument } from "@/components/QuoteDocument";
import { logoUrl } from "@/lib/site-defaults";
import { fmtDate, fmtDateTime, moneyExact } from "@/lib/format";
import { requireBusinessPage } from "@/lib/session";
import { quoteSettings } from "@/lib/quotes";
import { appBase } from "@/lib/twilio";

const { quotes, contacts, users } = schema;

export default async function QuotePage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ slug, id }, { tab }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { business: b } = await requireBusinessPage(slug, "view_financials");
  const [row] = await db.select({ q: quotes, c: contacts, approver: users.name }).from(quotes).innerJoin(contacts, eq(contacts.id, quotes.contactId)).leftJoin(users, eq(users.id, quotes.approvedById)).where(and(eq(quotes.id, id), eq(quotes.businessId, b.id)));
  if (!row) notFound();
  const { q, c } = row;
  const s = quoteSettings(b);
  const link = `${appBase(await headers())}/q/${q.token}`;
  const editable = q.status === "draft" || q.status === "approved";
  const name = `${c.firstName} ${c.lastName}`.trim();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {q.leadId && <Link href={`/b/${b.slug}/leads/${q.leadId}`} className="text-sm text-muted hover:text-ink">← Lead</Link>}
          <h1 className="flex items-center gap-2 text-xl font-semibold">Quote {q.number} <Badge value={q.status} /></h1>
          <p className="text-sm text-muted">
            For <Link className="hover:underline" href={`/b/${b.slug}/contacts/${c.id}`}>{name || c.email || c.phone}</Link> · {moneyExact(q.total)}{q.taxAmount ? " incl. tax" : ""}
            {q.approvedAt ? ` · approved by ${row.approver ?? "a manager"} ${fmtDate(q.approvedAt)}` : ""}
            {q.sentAt ? ` · sent ${fmtDateTime(q.sentAt)}` : ""}{q.viewedAt ? ` · opened by the customer ${fmtDateTime(q.viewedAt)}` : ""}
            {q.acceptedAt ? ` · accepted ${fmtDateTime(q.acceptedAt)}` : ""}{q.declinedAt ? ` · declined ${fmtDateTime(q.declinedAt)}` : ""}
          </p>
        </div>
        <a className="btn-ghost" href={`/q/${q.token}?preview=1`} target="_blank" rel="noreferrer">Customer&apos;s quote page ↗</a>
      </div>

      <nav className="flex gap-1 text-sm">
        {[["", "Edit"], ["internal", "Internal version (our costs)"], ["external", "External version (for the customer)"]].map(([k, l]) => (
          <Link key={k} href={k ? `?tab=${k}` : "?"} className={`rounded-lg px-3 py-1.5 ${(tab ?? "") === k ? "border border-line bg-panel font-semibold" : "text-muted hover:text-ink"}`}>{l}</Link>
        ))}
      </nav>

      {/* Review → approve → send */}
      <section className="card space-y-3">
        <ol className="flex flex-wrap gap-2 text-xs">
          {[["draft", "1. Build"], ["approved", "2. Approved"], ["sent", "3. Sent"], ["accepted", "4. Accepted"]].map(([k, l], i) => {
            const order = ["draft", "approved", "sent", "accepted"];
            const reached = q.status === "declined" ? i <= 2 : order.indexOf(q.status) >= i;
            return <li key={k} className={`rounded-full border px-2.5 py-1 ${reached ? "border-accent bg-accent/10 font-semibold text-accent" : "border-line text-muted"}`}>{l}</li>;
          })}
          {q.status === "declined" && <li className="rounded-full border border-bad/40 bg-bad/10 px-2.5 py-1 font-semibold text-bad">Declined</li>}
        </ol>
        {q.status === "draft" && (
          <div className="flex flex-wrap items-center gap-3">
            <form action={approveQuote.bind(null, b.slug, q.id)}><button className="btn">Approve quote</button></form>
            <span className="text-sm text-muted">Check the numbers below, then approve. Only approved quotes can be sent.</span>
          </div>
        )}
        {(q.status === "approved" || q.status === "sent") && (
          <div className="space-y-3">
            <ActionForm action={sendQuote.bind(null, b.slug, q.id)} submit={q.status === "sent" ? "Send again" : "Send to customer"} pendingText="Sending…" className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="sms" defaultChecked={Boolean(c.phone)} /> Text {c.phone ?? ""}</label>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="email" defaultChecked={Boolean(c.email)} /> Email {c.email ?? ""}</label>
            </ActionForm>
            <div className="max-w-xl"><CopyField value={link} /></div>
            <div className="flex flex-wrap gap-3 text-xs">
              {q.status === "approved" && <form action={markQuoteSent.bind(null, b.slug, q.id)}><button className="text-accent hover:underline">I sent the link myself: mark as sent</button></form>}
              {q.status === "approved" && <form action={reopenQuote.bind(null, b.slug, q.id)}><button className="text-muted hover:text-ink">Make changes (back to draft)</button></form>}
            </div>
          </div>
        )}
        {q.status === "accepted" && <p className="text-sm text-good">Accepted. The lead is Won and the job was created{q.jobId ? <> (<Link className="underline" href={`/b/${b.slug}/jobs`}>Jobs</Link>)</> : ""}.</p>}
      </section>

      {tab === "internal" || tab === "external" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <a className="btn" href={`/print/quote/${q.id}?v=${tab}`} target="_blank" rel="noreferrer">Print / save as PDF</a>
            <span className="text-sm text-muted">{tab === "internal" ? "Your costs, expenses and margin. Keep this one in-house." : "The scope of work and price the customer gets (same as their quote page)."}</span>
          </div>
          <QuoteDocument q={q} b={b} c={c} variant={tab} logo={logoUrl(b)} terms={s.terms} />
        </div>
      ) : (
      <QuoteBuilder
        action={saveQuote.bind(null, b.slug, q.id)}
        editable={editable}
        initial={{
          title: q.title, scope: q.scope ?? "", items: q.items, marginType: q.marginType, marginValue: q.marginValue,
          discountType: q.discountType, discountValue: q.discountValue, includeTax: q.includeTax, validUntil: q.validUntil ?? "",
        }}
        hourlyCost={s.hourlyCost}
        priceList={s.materials ?? []}
        taxRate={Number(b.taxRate ?? 0)}
        taxLabel={b.taxLabel || "Tax"}
      />
      )}

      {editable && !tab && (
        <form action={deleteQuote.bind(null, b.slug, q.id)}>
          <button className="text-xs text-muted hover:text-bad">Delete this quote</button>
        </form>
      )}
    </div>
  );
}
