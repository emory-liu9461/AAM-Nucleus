import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business } from "@/db/schema";
import { addDays, businessTz, localDay } from "./calendar";

/*
 * Keeps jobs in step with the schedule:
 *  - a job's start and end dates follow the work scheduled for it (first day to last day);
 *  - a Scheduled job becomes In progress once its first scheduled work has started.
 */

const { jobs, scheduleEvents } = schema;

/** Set the job's dates from its schedule (when it has any). */
export async function syncJobDates(b: Business, jobId: string | null | undefined) {
  if (!jobId) return;
  const tz = businessTz(b);
  const events = await db.select({ startsAt: scheduleEvents.startsAt, days: scheduleEvents.days }).from(scheduleEvents).where(and(eq(scheduleEvents.jobId, jobId), eq(scheduleEvents.businessId, b.id)));
  if (!events.length) return;
  const starts = events.map((e) => localDay(e.startsAt, tz)).sort();
  const ends = events.map((e) => addDays(localDay(e.startsAt, tz), Math.max(1, e.days) - 1)).sort();
  await db
    .update(jobs)
    .set({ startDate: starts[0], endDate: ends[ends.length - 1] })
    .where(and(eq(jobs.id, jobId), eq(jobs.businessId, b.id), sql`${jobs.status} not in ('completed','cancelled')`));
}

/** Scheduled jobs whose work has started -> In progress. Returns how many changed. */
export async function advanceStartedJobs(businessId?: string) {
  const rows = await db
    .update(jobs)
    .set({ status: "in_progress" })
    .where(
      and(
        eq(jobs.status, "scheduled"),
        businessId ? eq(jobs.businessId, businessId) : sql`true`,
        sql`exists (select 1 from ${scheduleEvents} e where e.job_id = ${jobs.id} and e.starts_at <= now())`,
      ),
    )
    .returning({ id: jobs.id });
  return rows.length;
}
