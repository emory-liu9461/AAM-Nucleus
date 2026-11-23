import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business } from "@/db/schema";

const { businesses, leads, jobs, invoices, payments, scheduleEvents, contacts } = schema;

import { RANGES, type RangeKey } from "./ranges";
export { RANGES, type RangeKey };

export function resolveRange(key: string | undefined): { key: RangeKey; from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now.getTime() + 1000); // inclusive of "now"
  const k = (RANGES.find((r) => r.key === key)?.key ?? "ytd") as RangeKey;
  let from: Date;
  switch (k) {
    case "30d":
      from = new Date(now.getTime() - 30 * 864e5);
      break;
    case "mtd":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "qtd":
      from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      break;
    case "12m":
      from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      break;
    case "all":
      from = new Date(2000, 0, 1);
      break;
    default:
      from = new Date(now.getFullYear(), 0, 1);
  }
  return { key: k, from, to };
}

export type BusinessMetrics = {
  collected: number; // payments received in range
  invoiced: number; // invoices issued in range (non-void)
  wonValue: number; // value of leads won in range
  wonCount: number;
  lostCount: number;
  newLeads: number;
  pipelineValue: number; // open leads, any age
  openLeads: number;
  outstanding: number; // unpaid balance on sent/partial invoices
  overdue: number;
  activeJobs: number;
  completedRevenue: number; // contract value of jobs completed in range
  completedCost: number;
};

const n = (v: unknown) => Number(v ?? 0);

export async function businessMetrics(businessId: string, from: Date, to: Date): Promise<BusinessMetrics> {
  const fromD = from.toISOString().slice(0, 10);
  const toD = to.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  // Raw sql`` fragments need strings, not Date objects, with the postgres-js driver.
  const fromTs = sql`${from.toISOString()}::timestamptz`;
  const toTs = sql`${to.toISOString()}::timestamptz`;

  const [pay, inv, leadAgg, pipe, ar, jobAgg] = await Promise.all([
    db
      .select({ v: sql`coalesce(sum(${payments.amount}),0)` })
      .from(payments)
      .where(and(eq(payments.businessId, businessId), gte(payments.receivedAt, from), lt(payments.receivedAt, to))),
    db
      .select({ v: sql`coalesce(sum(${invoices.amount}),0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.businessId, businessId),
          sql`${invoices.status} <> 'void'`,
          sql`${invoices.issuedAt} between ${fromD} and ${toD}`,
        ),
      ),
    db
      .select({
        newLeads: sql`count(*) filter (where ${leads.createdAt} >= ${fromTs} and ${leads.createdAt} < ${toTs})`,
        wonCount: sql`count(*) filter (where ${leads.stage} = 'won' and ${leads.closedAt} >= ${fromTs} and ${leads.closedAt} < ${toTs})`,
        wonValue: sql`coalesce(sum(${leads.estimatedValue}) filter (where ${leads.stage} = 'won' and ${leads.closedAt} >= ${fromTs} and ${leads.closedAt} < ${toTs}),0)`,
        lostCount: sql`count(*) filter (where ${leads.stage} = 'lost' and ${leads.closedAt} >= ${fromTs} and ${leads.closedAt} < ${toTs})`,
      })
      .from(leads)
      .where(eq(leads.businessId, businessId)),
    db
      .select({ c: sql`count(*)`, v: sql`coalesce(sum(${leads.estimatedValue}),0)` })
      .from(leads)
      .where(and(eq(leads.businessId, businessId), sql`${leads.stage} not in ('won','lost')`)),
    db.execute(sql`
      select
        coalesce(sum(i.amount - coalesce(p.paid,0)),0) as outstanding,
        coalesce(sum(i.amount - coalesce(p.paid,0)) filter (where i.due_at < ${today}),0) as overdue
      from invoices i
      left join (select invoice_id, sum(amount) paid from payments group by invoice_id) p on p.invoice_id = i.id
      where i.business_id = ${businessId} and i.status in ('sent','partial')`),
    db
      .select({
        active: sql`count(*) filter (where ${jobs.status} in ('scheduled','in_progress'))`,
        rev: sql`coalesce(sum(${jobs.contractValue}) filter (where ${jobs.status} = 'completed' and ${jobs.endDate} between ${fromD} and ${toD}),0)`,
        cost: sql`coalesce(sum(${jobs.actualCost}) filter (where ${jobs.status} = 'completed' and ${jobs.endDate} between ${fromD} and ${toD}),0)`,
      })
      .from(jobs)
      .where(eq(jobs.businessId, businessId)),
  ]);

  const arRow = (ar as unknown as Record<string, unknown>[])[0] ?? {};
  return {
    collected: n(pay[0]?.v),
    invoiced: n(inv[0]?.v),
    newLeads: n(leadAgg[0]?.newLeads),
    wonCount: n(leadAgg[0]?.wonCount),
    wonValue: n(leadAgg[0]?.wonValue),
    lostCount: n(leadAgg[0]?.lostCount),
    openLeads: n(pipe[0]?.c),
    pipelineValue: n(pipe[0]?.v),
    outstanding: n(arRow.outstanding),
    overdue: n(arRow.overdue),
    activeJobs: n(jobAgg[0]?.active),
    completedRevenue: n(jobAgg[0]?.rev),
    completedCost: n(jobAgg[0]?.cost),
  };
}

export function sumMetrics(list: BusinessMetrics[]): BusinessMetrics {
  const keys = Object.keys(list[0] ?? {}) as (keyof BusinessMetrics)[];
  const out = {} as BusinessMetrics;
  for (const k of keys) out[k] = list.reduce((s, m) => s + m[k], 0);
  if (!list.length)
    return {
      collected: 0, invoiced: 0, wonValue: 0, wonCount: 0, lostCount: 0, newLeads: 0, pipelineValue: 0,
      openLeads: 0, outstanding: 0, overdue: 0, activeJobs: 0, completedRevenue: 0, completedCost: 0,
    };
  return out;
}

export const closeRate = (m: BusinessMetrics) =>
  m.wonCount + m.lostCount === 0 ? null : m.wonCount / (m.wonCount + m.lostCount);

export const grossMargin = (m: BusinessMetrics) =>
  m.completedRevenue === 0 ? null : (m.completedRevenue - m.completedCost) / m.completedRevenue;

export const avgJob = (m: BusinessMetrics) => (m.wonCount === 0 ? null : m.wonValue / m.wonCount);

/** Cash collected per month per business, last 12 months. */
export async function monthlyCollected(businessIds: string[]) {
  if (!businessIds.length) return { months: [] as string[], series: {} as Record<string, number[]> };
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const rows = await db
    .select({
      businessId: payments.businessId,
      month: sql<string>`to_char(date_trunc('month', ${payments.receivedAt}), 'YYYY-MM')`,
      total: sql`sum(${payments.amount})`,
    })
    .from(payments)
    .where(and(inArray(payments.businessId, businessIds), gte(payments.receivedAt, start)))
    .groupBy(payments.businessId, sql`2`);
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const series: Record<string, number[]> = {};
  for (const id of businessIds) series[id] = months.map(() => 0);
  for (const r of rows) {
    const idx = months.indexOf(r.month);
    if (idx >= 0) series[r.businessId][idx] = n(r.total);
  }
  return { months, series };
}

export async function leadsBySource(businessIds: string[], from: Date, to: Date) {
  if (!businessIds.length) return [];
  const rows = await db
    .select({
      source: leads.source,
      count: sql`count(*)`,
      won: sql`count(*) filter (where ${leads.stage} = 'won')`,
      wonValue: sql`coalesce(sum(${leads.estimatedValue}) filter (where ${leads.stage} = 'won'),0)`,
    })
    .from(leads)
    .where(and(inArray(leads.businessId, businessIds), gte(leads.createdAt, from), lt(leads.createdAt, to)))
    .groupBy(leads.source);
  return rows
    .map((r) => ({ source: r.source, count: n(r.count), won: n(r.won), wonValue: n(r.wonValue) }))
    .sort((a, b) => b.count - a.count);
}

export async function upcomingEvents(businessIds: string[], days = 7) {
  if (!businessIds.length) return [];
  const now = new Date();
  const end = new Date(now.getTime() + days * 864e5);
  return db
    .select({
      id: scheduleEvents.id,
      title: scheduleEvents.title,
      type: scheduleEvents.type,
      startsAt: scheduleEvents.startsAt,
      endsAt: scheduleEvents.endsAt,
      assignee: scheduleEvents.assignee,
      businessId: scheduleEvents.businessId,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
    })
    .from(scheduleEvents)
    .leftJoin(contacts, eq(contacts.id, scheduleEvents.contactId))
    .where(
      and(
        inArray(scheduleEvents.businessId, businessIds),
        gte(scheduleEvents.endsAt, now),
        lt(scheduleEvents.startsAt, end),
      ),
    )
    .orderBy(asc(scheduleEvents.startsAt))
    .limit(20);
}

export async function activeBusinesses(): Promise<Business[]> {
  return db.select().from(businesses).where(eq(businesses.archived, false)).orderBy(asc(businesses.createdAt));
}
