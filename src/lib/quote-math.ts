import type { QuoteItems } from "@/db/schema";

/*
 * Quote pricing (no database code: the builder uses this live in the browser, and the server
 * recomputes it on save). Inputs are in dollars; results in cents.
 *   cost   = labour (workers × hours × cost per worker-hour) + materials (units × unit cost) + other
 *   profit = a margin % of the price (price = cost ÷ (1 − margin)), or a set dollar amount
 *   list price = cost + profit; discount (% or $) comes off that; price = list price − discount
 *   tax (if on) is on the price; total = price + tax
 */

const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const cents = (dollars: number) => Math.round(dollars * 100);

export type Pricing = {
  marginType: "percent" | "amount";
  marginValue: number | string;
  discountType?: "percent" | "amount";
  discountValue?: number | string;
  includeTax?: boolean;
  taxRate: number | string | null;
};

export function quoteTotals(items: QuoteItems, p: Pricing) {
  const labour = items.labour.reduce((s, l) => s + n(l.workers || 1) * n(l.hours) * n(l.rate), 0);
  const hours = items.labour.reduce((s, l) => s + n(l.workers || 1) * n(l.hours), 0);
  const materials = items.materials.reduce((s, m) => s + n(m.qty) * n(m.unitCost), 0);
  const other = items.other.reduce((s, o) => s + n(o.amount), 0);
  const cost = labour + materials + other;
  const list = p.marginType === "amount" ? cost + n(p.marginValue) : cost / (1 - Math.min(95, n(p.marginValue)) / 100);
  const listC = cents(list);
  const costC = cents(cost);
  const discountC = Math.min(listC, p.discountType === "amount" ? cents(n(p.discountValue)) : Math.round((listC * Math.min(100, n(p.discountValue))) / 100));
  const priceC = listC - discountC;
  const profitC = priceC - costC;
  const rate = p.includeTax === false ? 0 : n(p.taxRate);
  const taxC = Math.round((priceC * rate) / 100);
  return {
    labour: cents(labour),
    materials: cents(materials),
    other: cents(other),
    hours,
    cost: costC,
    listPrice: listC,
    discount: discountC,
    price: priceC, // after discount, before tax
    profit: profitC,
    taxRate: rate,
    tax: taxC,
    total: priceC + taxC,
    marginPct: priceC ? (profitC / priceC) * 100 : 0, // profit as a share of the price
    markupPct: costC ? (profitC / costC) * 100 : 0, // profit as a share of the cost
  };
}

/** Keep only sensible rows (and numbers) from what the builder sent. */
export function cleanItems(raw: unknown): QuoteItems {
  const r = (raw ?? {}) as Partial<QuoteItems>;
  const num = (v: unknown, max = 1e7) => Math.min(max, n(v));
  const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return {
    labour: (Array.isArray(r.labour) ? r.labour : []).slice(0, 30).map((l) => ({ description: str(l.description), workers: Math.max(1, Math.round(num(l.workers, 100)) || 1), hours: num(l.hours, 10000), rate: num(l.rate, 1000) })).filter((l) => l.description || l.hours),
    materials: (Array.isArray(r.materials) ? r.materials : []).slice(0, 60).map((m) => ({ name: str(m.name), unit: str(m.unit, 30), qty: num(m.qty, 1e6), unitCost: num(m.unitCost, 1e6) })).filter((m) => m.name || m.qty),
    other: (Array.isArray(r.other) ? r.other : []).slice(0, 20).map((o) => ({ description: str(o.description), amount: num(o.amount) })).filter((o) => o.description || o.amount),
  };
}
