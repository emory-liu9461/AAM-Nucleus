import { money } from "@/lib/format";

type Series = { id: string; name: string; color: string; values: number[] };

/** Stacked monthly bars, one segment per business. */
export function RevenueChart({ months, series }: { months: string[]; series: Series[] }) {
  const totals = months.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const max = Math.max(1, ...totals);
  return (
    <div>
      <div className="flex h-48 items-end gap-1.5">
        {months.map((m, i) => (
          <div key={m} className="group relative flex h-full flex-1 flex-col justify-end">
            <div className="flex flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(totals[i] / max) * 100}%` }}>
              {series.map((s) => (
                <div key={s.id} style={{ background: s.color, height: `${totals[i] ? (s.values[i] / totals[i]) * 100 : 0}%` }} />
              ))}
            </div>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-panel px-2 py-1 text-xs shadow group-hover:block">
              <div className="font-semibold">{monthLabel(m, true)}: {money(totals[i])}</div>
              {series.map((s) => (
                <div key={s.id} className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.name}: {money(s.values[i])}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 text-[10px] text-muted">
        {months.map((m) => (
          <div key={m} className="flex-1 text-center">{monthLabel(m)}</div>
        ))}
      </div>
      {series.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          {series.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function monthLabel(ym: string, long = false) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", long ? { month: "short", year: "numeric" } : { month: "short" });
}
