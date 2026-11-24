import Link from "next/link";
import type { Business } from "@/db/schema";
import { money, pct, label, fmtDateTime } from "@/lib/format";
import {
  avgJob, businessMetrics, closeRate, grossMargin, leadsBySource, monthlyCollected, resolveRange,
  marketingMetrics, sumMarketing, sumMetrics, upcomingEvents,
} from "@/lib/metrics";
import { MarketingStats } from "./MarketingStats";
import { socialSummary } from "@/lib/social-stats";
import { Kpi } from "./Kpi";
import { RangePicker } from "./RangePicker";
import { RevenueChart } from "./RevenueChart";

/** Used by both the all-businesses overview and a single business's dashboard. */
export async function Dashboard({ title, subtitle, list, range }: { title: string; subtitle?: string; list: Business[]; range?: string }) {
  const r = resolveRange(range);
  const ids = list.map((b) => b.id);
  const [per, monthly, sources, events, mkt, social] = await Promise.all([
    Promise.all(list.map((b) => businessMetrics(b.id, r.from, r.to))),
    monthlyCollected(ids),
    leadsBySource(ids, r.from, r.to),
    upcomingEvents(ids, 7),
    Promise.all(list.map((b) => marketingMetrics(b.id, r.from, r.to))),
    socialSummary(ids, r.from, r.to),
  ]);
  const t = sumMetrics(per);
  const byId = Object.fromEntries(list.map((b) => [b.id, b]));
  const multi = list.length > 1;
  const maxSource = Math.max(1, ...sources.map((s) => s.count));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        <RangePicker value={r.key} />
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cash collected" value={money(t.collected)} sub={`${money(t.invoiced)} invoiced`} />
        <Kpi label="Sales won" value={money(t.wonValue)} sub={`${t.wonCount} jobs · avg ${avgJob(t) == null ? "—" : money(avgJob(t)!)}`} />
        <Kpi label="Open pipeline" value={money(t.pipelineValue)} sub={`${t.openLeads} open leads · ${t.newLeads} new in period`} />
        <Kpi label="Close rate" value={pct(closeRate(t))} sub={`${t.wonCount} won / ${t.lostCount} lost`} />
        <Kpi label="Outstanding A/R" value={money(t.outstanding)} sub={`${money(t.overdue)} overdue`} tone={t.overdue > 0 ? "bad" : undefined} />
        <Kpi label="Active jobs" value={String(t.activeJobs)} sub="scheduled + in progress" />
        <Kpi label="Completed job revenue" value={money(t.completedRevenue)} sub="jobs finished in period" />
        <Kpi label="Gross margin" value={pct(grossMargin(t))} sub={`${money(t.completedRevenue - t.completedCost)} gross profit`} tone={(grossMargin(t) ?? 1) < 0.2 ? "bad" : "good"} />
      </section>

      <MarketingStats m={sumMarketing(mkt)} per={mkt} list={list} social={social} />

      <section className="card">
        <div className="card-title">Cash collected · last 12 months</div>
        <RevenueChart
          months={monthly.months}
          series={list.map((b) => ({ id: b.id, name: b.name, color: b.color, values: monthly.series[b.id] ?? [] }))}
        />
      </section>

      {multi && (
        <section className="card overflow-x-auto p-0">
          <div className="card-title px-4 pt-4">By business</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Business</th>
                <th className="text-right">Collected</th>
                <th className="text-right">Won</th>
                <th className="text-right">Pipeline</th>
                <th className="text-right">Close rate</th>
                <th className="text-right">A/R</th>
                <th className="text-right">Margin</th>
                <th className="text-right">Active jobs</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b, i) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/b/${b.slug}`} className="flex items-center gap-2 font-medium hover:underline">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                      {b.name}
                    </Link>
                  </td>
                  <td className="text-right">{money(per[i].collected)}</td>
                  <td className="text-right">{money(per[i].wonValue)}</td>
                  <td className="text-right">{money(per[i].pipelineValue)}</td>
                  <td className="text-right">{pct(closeRate(per[i]))}</td>
                  <td className={`text-right ${per[i].overdue > 0 ? "text-bad" : ""}`}>{money(per[i].outstanding)}</td>
                  <td className="text-right">{pct(grossMargin(per[i]))}</td>
                  <td className="text-right">{per[i].activeJobs}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td>Total</td>
                <td className="text-right">{money(t.collected)}</td>
                <td className="text-right">{money(t.wonValue)}</td>
                <td className="text-right">{money(t.pipelineValue)}</td>
                <td className="text-right">{pct(closeRate(t))}</td>
                <td className="text-right">{money(t.outstanding)}</td>
                <td className="text-right">{pct(grossMargin(t))}</td>
                <td className="text-right">{t.activeJobs}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-title">Leads by source</div>
          {sources.length === 0 && <p className="text-sm text-muted">No leads in this period.</p>}
          <div className="space-y-2">
            {sources.map((s) => (
              <div key={s.source} className="text-sm">
                <div className="flex justify-between">
                  <span>{label(s.source)}</span>
                  <span className="text-muted">
                    {s.count} leads · {s.won} won · {money(s.wonValue, true)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-bg">
                  <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(s.count / maxSource) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Next 7 days</div>
          {events.length === 0 && <p className="text-sm text-muted">Nothing scheduled.</p>}
          <ul className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-2 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: byId[e.businessId]?.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{e.title}</div>
                  <div className="text-xs text-muted">
                    {fmtDateTime(e.startsAt)} · {label(e.type)}
                    {e.assignee ? ` · ${e.assignee}` : ""}
                    {multi ? ` · ${byId[e.businessId]?.name}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
