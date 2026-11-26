"use client";

import { useActionState, useMemo, useState } from "react";
import type { FormState } from "@/app/auth-actions";
import type { QuoteItems } from "@/db/schema";
import { quoteTotals } from "@/lib/quote-math";

/* Build a quote from labour and materials; totals update as you type. The server recomputes on save. */

type Props = {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  editable: boolean;
  initial: {
    title: string;
    scope: string;
    items: QuoteItems;
    marginType: "percent" | "amount";
    marginValue: string;
    discountType: "percent" | "amount";
    discountValue: string;
    includeTax: boolean;
    validUntil: string;
  };
  hourlyCost: number;
  priceList: { name: string; unit: string; unitCost: number }[];
  taxRate: number;
  taxLabel: string;
};

const fmt = (c: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(c / 100);
const lineFmt = (d: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(d);

export function QuoteBuilder({ action, editable, initial, hourlyCost, priceList, taxRate, taxLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const [title, setTitle] = useState(initial.title);
  const [scope, setScope] = useState(initial.scope);
  const [labour, setLabour] = useState(initial.items.labour);
  const [materials, setMaterials] = useState(initial.items.materials);
  const [other, setOther] = useState(initial.items.other);
  const [marginType, setMarginType] = useState(initial.marginType);
  const [marginValue, setMarginValue] = useState(initial.marginValue);
  const [discountType, setDiscountType] = useState(initial.discountType);
  const [discountValue, setDiscountValue] = useState(initial.discountValue);
  const [includeTax, setIncludeTax] = useState(initial.includeTax);
  const [validUntil, setValidUntil] = useState(initial.validUntil);

  const items = { labour, materials, other };
  const t = useMemo(
    () => quoteTotals({ labour, materials, other }, { marginType, marginValue, discountType, discountValue, includeTax, taxRate }),
    [labour, materials, other, marginType, marginValue, discountType, discountValue, includeTax, taxRate],
  );
  const set = <T,>(list: T[], setList: (v: T[]) => void, i: number, patch: Partial<T>) => setList(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const ro = !editable;

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <div className="min-w-0 space-y-5">
        <section className="card space-y-3">
          <label className="field">Quote title (the customer sees this)<input className="input" name="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={ro} /></label>
          <label className="field">What&apos;s included (scope of work, shown to the customer)
            <textarea className="input" name="scope" rows={4} value={scope} onChange={(e) => setScope(e.target.value)} disabled={ro} placeholder={"e.g. Paint walls and ceilings in 3 bedrooms and the hallway (2 coats).\nPatch and sand nail holes. Move and cover furniture. Full clean-up."} />
          </label>
        </section>

        <section className="card space-y-3">
          <div className="card-title mb-0">Labour</div>
          <div className="hidden grid-cols-[1fr_80px_90px_120px_100px_28px] gap-2 text-xs text-muted sm:grid"><span>Work</span><span>Workers</span><span>Hours each</span><span>Cost / worker-hour</span><span className="text-right">Line cost</span><span /></div>
          {labour.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_90px_120px_100px_28px] sm:items-center">
              <input className="input col-span-2 sm:col-span-1" aria-label="Work" placeholder="e.g. Prep and painting" value={l.description} onChange={(e) => set(labour, setLabour, i, { description: e.target.value })} disabled={ro} />
              <input className="input" aria-label="Workers" type="number" min={1} step={1} value={l.workers} onChange={(e) => set(labour, setLabour, i, { workers: Number(e.target.value) })} disabled={ro} />
              <input className="input" aria-label="Hours each" type="number" min={0} step={0.5} value={l.hours} onChange={(e) => set(labour, setLabour, i, { hours: Number(e.target.value) })} disabled={ro} />
              <input className="input" aria-label="Cost per worker-hour" type="number" min={0} step={0.5} value={l.rate} onChange={(e) => set(labour, setLabour, i, { rate: Number(e.target.value) })} disabled={ro} />
              <span className="text-right text-sm">{lineFmt((l.workers || 1) * (l.hours || 0) * (l.rate || 0))}</span>
              {editable ? <button type="button" className="text-muted hover:text-bad" aria-label="Remove line" onClick={() => setLabour(labour.filter((_, j) => j !== i))}>×</button> : <span />}
            </div>
          ))}
          {editable && <button type="button" className="btn-ghost text-sm" onClick={() => setLabour([...labour, { description: "", workers: 1, hours: 8, rate: hourlyCost }])}>+ Add labour</button>}
        </section>

        <section className="card space-y-3">
          <div className="card-title mb-0">Materials</div>
          <div className="hidden grid-cols-[1fr_80px_90px_110px_100px_28px] gap-2 text-xs text-muted sm:grid"><span>Item</span><span>Units</span><span>Unit</span><span>Cost / unit</span><span className="text-right">Line cost</span><span /></div>
          <datalist id="price-list">{priceList.map((p) => <option key={p.name} value={p.name}>{`${lineFmt(p.unitCost)} / ${p.unit}`}</option>)}</datalist>
          {materials.map((m, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_90px_110px_100px_28px] sm:items-center">
              <input className="input col-span-2 sm:col-span-1" aria-label="Item" list="price-list" placeholder="Start typing, e.g. Paint" value={m.name} disabled={ro}
                onChange={(e) => {
                  const hit = priceList.find((p) => p.name.toLowerCase() === e.target.value.toLowerCase());
                  set(materials, setMaterials, i, hit ? { name: hit.name, unit: hit.unit, unitCost: hit.unitCost } : { name: e.target.value });
                }} />
              <input className="input" aria-label="Units needed" type="number" min={0} step={0.5} value={m.qty} onChange={(e) => set(materials, setMaterials, i, { qty: Number(e.target.value) })} disabled={ro} />
              <input className="input" aria-label="Unit" placeholder="gallon" value={m.unit} onChange={(e) => set(materials, setMaterials, i, { unit: e.target.value })} disabled={ro} />
              <input className="input" aria-label="Cost per unit" type="number" min={0} step={0.01} value={m.unitCost} onChange={(e) => set(materials, setMaterials, i, { unitCost: Number(e.target.value) })} disabled={ro} />
              <span className="text-right text-sm">{lineFmt((m.qty || 0) * (m.unitCost || 0))}</span>
              {editable ? <button type="button" className="text-muted hover:text-bad" aria-label="Remove line" onClick={() => setMaterials(materials.filter((_, j) => j !== i))}>×</button> : <span />}
            </div>
          ))}
          {editable && <button type="button" className="btn-ghost text-sm" onClick={() => setMaterials([...materials, { name: "", unit: "", qty: 1, unitCost: 0 }])}>+ Add material</button>}
          <p className="text-xs text-muted">Pick from your price list (Settings → Quotes) to fill in the unit and cost, or type your own.</p>
        </section>

        <section className="card space-y-3">
          <div className="card-title mb-0">Other costs</div>
          {other.map((o, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_28px] items-center gap-2">
              <input className="input" aria-label="Description" placeholder="e.g. Equipment rental, permit, disposal" value={o.description} onChange={(e) => set(other, setOther, i, { description: e.target.value })} disabled={ro} />
              <input className="input" aria-label="Amount" type="number" min={0} step={0.01} value={o.amount} onChange={(e) => set(other, setOther, i, { amount: Number(e.target.value) })} disabled={ro} />
              {editable ? <button type="button" className="text-muted hover:text-bad" aria-label="Remove line" onClick={() => setOther(other.filter((_, j) => j !== i))}>×</button> : <span />}
            </div>
          ))}
          {editable && <button type="button" className="btn-ghost text-sm" onClick={() => setOther([...other, { description: "", amount: 0 }])}>+ Add other cost</button>}
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <section className="card space-y-3">
          <div className="card-title mb-0">Pricing</div>
          <div className="field">Profit
            <div className="flex gap-2">
              <select className="input w-28" name="marginType" value={marginType} onChange={(e) => setMarginType(e.target.value as "percent" | "amount")} disabled={ro}>
                <option value="percent">% margin</option><option value="amount">$ amount</option>
              </select>
              <input className="input" name="marginValue" type="number" min={0} step={marginType === "percent" ? 1 : 0.01} value={marginValue} onChange={(e) => setMarginValue(e.target.value)} disabled={ro} />
            </div>
            <span className="font-normal">{marginType === "percent" ? "Share of the price that's profit." : "Dollars added on top of the cost."}</span>
          </div>
          <div className="field">Discount
            <div className="flex gap-2">
              <select className="input w-28" name="discountType" value={discountType} onChange={(e) => setDiscountType(e.target.value as "percent" | "amount")} disabled={ro}>
                <option value="percent">% off</option><option value="amount">$ off</option>
              </select>
              <input className="input" name="discountValue" type="number" min={0} step={discountType === "percent" ? 1 : 0.01} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} disabled={ro} />
            </div>
          </div>
          <input type="hidden" name="includeTax" value={includeTax ? "on" : "off"} />
          <button type="button" disabled={ro || !taxRate} onClick={() => setIncludeTax(!includeTax)} aria-pressed={includeTax}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium ${includeTax && taxRate ? "border-accent bg-accent/10 text-accent" : "border-line text-muted"}`}>
            <span>{taxRate ? `${taxLabel} ${taxRate}%` : "No tax set (Settings → Sales tax)"}</span>
            <span>{includeTax && taxRate ? "Tax: on" : "Tax: off"}</span>
          </button>
          <label className="field">Valid until<input className="input" type="date" name="validUntil" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} disabled={ro} /></label>
        </section>

        <section className="card space-y-1 text-sm">
          <Row k={`Labour (${t.hours} worker-hours)`} v={fmt(t.labour)} />
          <Row k="Materials" v={fmt(t.materials)} />
          {t.other > 0 && <Row k="Other costs" v={fmt(t.other)} />}
          <Row k="Your cost" v={fmt(t.cost)} strong />
          <Row k={`Profit (${t.marginPct.toFixed(0)}% margin · ${t.markupPct.toFixed(0)}% markup)`} v={fmt(t.profit)} tone={t.profit < 0 ? "bad" : "good"} />
          <div className="my-2 border-t border-line" />
          {t.discount > 0 && <Row k="Price before discount" v={fmt(t.listPrice)} />}
          {t.discount > 0 && <Row k="Discount" v={`− ${fmt(t.discount)}`} />}
          <Row k="Price" v={fmt(t.price)} strong />
          {t.tax > 0 && <Row k={`${taxLabel} ${t.taxRate}%`} v={fmt(t.tax)} />}
          <div className="flex items-baseline justify-between pt-1 text-lg font-bold"><span>{t.tax > 0 ? "Total incl. tax" : "Total"}</span><span>{fmt(t.total)}</span></div>
          {t.profit < 0 && <p className="text-xs text-bad">The price is below your cost.</p>}
        </section>

        {editable && <button className="btn w-full" disabled={pending}>{pending ? "Saving…" : "Save quote"}</button>}
        {state?.error && <p className="text-sm text-bad">{state.error}</p>}
        {state?.ok && <p className="text-sm text-good">{state.ok}</p>}
      </aside>
    </form>
  );
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted"}>{k}</span>
      <span className={tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : ""}>{v}</span>
    </div>
  );
}
