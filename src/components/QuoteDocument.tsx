import type { Business, Contact, Quote } from "@/db/schema";
import { quoteTotals } from "@/lib/quote-math";
import { fmtDate, moneyExact } from "@/lib/format";

/*
 * A quote as a document, in two versions:
 *   internal: our costs and expenses (labour, materials, other), profit, margin. Never shown to customers.
 *   external: the scope of work, materials included, price, discount, tax and total (the customer's quote).
 */

const d = (dollars: number) => moneyExact(Math.round(dollars * 100));

export function QuoteDocument({ q, b, c, variant, logo, terms }: { q: Quote; b: Business; c: Contact; variant: "internal" | "external"; logo: string | null; terms?: string | null }) {
  const name = `${c.firstName} ${c.lastName}`.trim();
  const address = [c.address, c.city, c.zip].filter(Boolean).join(", ");
  const t = quoteTotals(q.items, { marginType: q.marginType, marginValue: q.marginValue, discountType: q.discountType, discountValue: q.discountValue, includeTax: false, taxRate: 0 }); // costs, profit and discount; tax comes from the saved quote
  const materials = q.items.materials.filter((m) => m.name || m.qty);

  return (
    <article className="quote-doc space-y-5 rounded-xl border border-line bg-white p-6 text-sm text-ink print:border-0 print:p-0">
      {variant === "internal" && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-bad">Internal: our costs and margin. Do not send to the customer.</div>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt={b.name} className="h-12 w-auto max-w-[260px] object-contain object-left" /> : <div className="text-lg font-bold">{b.name}</div>}
          <div className="mt-2 text-xs text-muted">{[b.phone, b.email, b.domain].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted">{variant === "internal" ? "Job costing" : "Quote"}</div>
          <div className="text-lg font-bold">{q.number}</div>
          <div className="text-xs text-muted">{fmtDate(q.createdAt)}{q.validUntil ? ` · valid until ${fmtDate(q.validUntil)}` : ""}</div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">{variant === "internal" ? "Customer" : "Prepared for"}</div>
          <div className="font-semibold">{name || "Customer"}</div>
          {address && <div className="text-muted">{address}</div>}
          {variant === "internal" && <div className="text-muted">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Project</div>
          <div className="font-semibold">{q.title}</div>
        </div>
      </section>

      {q.scope && (
        <section>
          <h2 className="mb-1 font-semibold">Scope of work</h2>
          <p className="whitespace-pre-line">{q.scope}</p>
        </section>
      )}

      {variant === "internal" ? (
        <>
          <Table
            title={`Labour · ${t.hours} worker-hours`}
            head={["Work", "Workers", "Hours each", "Cost / worker-hour", "Cost"]}
            rows={q.items.labour.map((l) => [l.description || "Labour", String(l.workers || 1), String(l.hours), d(l.rate), d((l.workers || 1) * l.hours * l.rate)])}
            total={moneyExact(t.labour)}
          />
          <Table
            title="Materials"
            head={["Item", "Units", "Unit", "Cost / unit", "Cost"]}
            rows={materials.map((m) => [m.name, String(m.qty), m.unit, d(m.unitCost), d(m.qty * m.unitCost)])}
            total={moneyExact(t.materials)}
          />
          {q.items.other.length > 0 && (
            <Table title="Other expenses" head={["Expense", "Cost"]} rows={q.items.other.map((o) => [o.description || "Other", d(o.amount)])} total={moneyExact(t.other)} />
          )}
          <section className="ml-auto max-w-sm space-y-1">
            <Sum k="Total cost" v={moneyExact(t.cost)} strong />
            <Sum k={`Profit (${t.marginPct.toFixed(1)}% margin · ${t.markupPct.toFixed(1)}% markup)`} v={moneyExact(t.profit)} tone={t.profit < 0 ? "bad" : "good"} />
            <div className="border-t border-line pt-1" />
            {t.discount > 0 && <Sum k="Price before discount" v={moneyExact(t.listPrice)} />}
            {t.discount > 0 && <Sum k={`Discount${q.discountType === "percent" ? ` (${Number(q.discountValue)}%)` : ""}`} v={`− ${moneyExact(t.discount)}`} />}
            <Sum k="Price" v={moneyExact(q.price)} strong />
            {q.taxAmount > 0 && <Sum k={q.taxLabel ?? "Tax"} v={moneyExact(q.taxAmount)} />}
            <Sum k={q.taxAmount ? "Customer pays (incl. tax)" : "Customer pays"} v={moneyExact(q.total)} big />
          </section>
        </>
      ) : (
        <>
          {materials.length > 0 && (
            <section>
              <h2 className="mb-1 font-semibold">Materials included</h2>
              <ul className="list-disc pl-5 text-muted">
                {materials.map((m, i) => <li key={i}>{m.name}{m.qty ? ` (${m.qty}${m.unit ? ` ${m.unit}${m.qty === 1 ? "" : "s"}` : ""})` : ""}</li>)}
              </ul>
            </section>
          )}
          <section className="ml-auto max-w-sm space-y-1">
            {q.discount > 0 && <Sum k="Price" v={moneyExact(q.listPrice)} />}
            {q.discount > 0 && <Sum k={`Discount${q.discountType === "percent" ? ` (${Number(q.discountValue)}%)` : ""}`} v={`− ${moneyExact(q.discount)}`} tone="good" />}
            <Sum k={q.taxAmount ? "Subtotal" : "Total"} v={moneyExact(q.price)} strong={!q.taxAmount} />
            {q.taxAmount > 0 && <Sum k={q.taxLabel ?? "Tax"} v={moneyExact(q.taxAmount)} />}
            {q.taxAmount > 0 && <Sum k="Total incl. tax" v={moneyExact(q.total)} big />}
          </section>
          {terms && <p className="whitespace-pre-line border-t border-line pt-3 text-xs text-muted">{terms}</p>}
        </>
      )}
    </article>
  );
}

function Table({ title, head, rows, total }: { title: string; head: string[]; rows: string[][]; total: string }) {
  return (
    <section>
      <h2 className="mb-1 font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left">
          <thead><tr className="border-b border-line text-xs text-muted">{head.map((h, i) => <th key={h} className={`py-1 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={head.length} className="py-1 text-muted">None</td></tr>}
            {rows.map((r, i) => <tr key={i} className="border-b border-line/60">{r.map((cell, j) => <td key={j} className={`py-1 ${j ? "text-right" : ""}`}>{cell}</td>)}</tr>)}
            <tr><td colSpan={head.length - 1} className="py-1 text-right font-semibold">Subtotal</td><td className="py-1 text-right font-semibold">{total}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Sum({ k, v, strong, big, tone }: { k: string; v: string; strong?: boolean; big?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""} ${big ? "pt-1 text-base font-bold" : ""}`}>
      <span className={strong || big ? "" : "text-muted"}>{k}</span>
      <span className={tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : ""}>{v}</span>
    </div>
  );
}
