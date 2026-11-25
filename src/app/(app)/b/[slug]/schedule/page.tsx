import Link from "next/link";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteEvent } from "@/app/actions";
import { getBusiness } from "@/lib/business";
import { addDays, atLocal, businessTz, fmtTime, fmtYmd, localDay, occurrences, weekStart } from "@/lib/calendar";
import { crewFor } from "@/lib/staff";
import { Badge } from "@/components/Badge";
import { WorkForm } from "@/components/WorkForm";

const { scheduleEvents, jobs, staffMembers } = schema;

export default async function SchedulePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ week?: string }> }) {
  const [{ slug }, { week = "0" }] = await Promise.all([params, searchParams]);
  const b = await getBusiness(slug);
  const tz = businessTz(b);
  const offset = Number(week) || 0;
  const monday = weekStart(new Date(), tz, offset);
  const dayKeys = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const start = atLocal(monday, "00:00", tz);
  const end = atLocal(addDays(monday, 7), "00:00", tz);
  const today = localDay(new Date(), tz);

  const [events, jobList, staff] = await Promise.all([
    db
      .select()
      .from(scheduleEvents)
      .where(and(eq(scheduleEvents.businessId, b.id), lt(scheduleEvents.startsAt, end), gte(scheduleEvents.endsAt, start)))
      .orderBy(asc(scheduleEvents.startsAt)),
    db.select({ id: jobs.id, name: jobs.name }).from(jobs).where(and(eq(jobs.businessId, b.id), sql`${jobs.status} in ('scheduled','in_progress')`)).orderBy(asc(jobs.name)),
    db.select().from(staffMembers).where(eq(staffMembers.businessId, b.id)).orderBy(asc(staffMembers.name)),
  ]);
  const crews = await crewFor(events.map((e) => e.id));
  const weekQ = offset ? `week=${offset}&` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <a className="btn-ghost" href={`?week=${offset - 1}`} aria-label="Previous week">←</a>
          <a className="btn-ghost" href="?week=0">This week</a>
          <a className="btn-ghost" href={`?week=${offset + 1}`} aria-label="Next week">→</a>
          <span className="text-sm font-medium">
            {fmtYmd(monday, { month: "short", day: "numeric" })} – {fmtYmd(dayKeys[6], { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
        <Link className="text-sm text-accent hover:underline" href={`/b/${b.slug}/staff?${weekQ}`}>Crew schedule →</Link>
      </div>

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">+ New appointment or work</summary>
        <div className="mt-4">
          <WorkForm slug={b.slug} tz={tz} jobs={jobList} staff={staff} defaultDate={dayKeys.includes(today) ? today : monday} />
        </div>
      </details>

      <div className="grid gap-3 md:grid-cols-7">
        {dayKeys.map((d) => {
          const list = events.flatMap((e) => occurrences(e, tz).filter((o) => o.day === d).map((o) => ({ e, o })));
          return (
            <div key={d} className={`card min-h-32 p-2 ${d === today ? "border-accent" : ""}`}>
              <div className="mb-2 text-xs font-semibold text-muted">{fmtYmd(d, { weekday: "short", month: "short", day: "numeric" })}</div>
              <div className="space-y-1.5">
                {list.map(({ e, o }) => {
                  const crew = crews.get(e.id) ?? [];
                  return (
                    <div key={e.id} className="group rounded-lg border border-line p-1.5 text-xs" style={{ borderLeft: `3px solid ${b.color}` }}>
                      <Link href={`/b/${b.slug}/staff?${weekQ}edit=${e.id}#edit`} className="font-medium hover:underline">{e.title}</Link>
                      <div className="text-muted">
                        {localDay(o.start, tz) === d ? fmtTime(o.start, tz) : "cont."}–{fmtTime(o.end, tz)}
                        {e.days > 1 ? ` · day ${occurrences(e, tz).findIndex((x) => x.day === d) + 1}/${e.days}` : ""}
                        {e.assignee && !crew.length ? ` · ${e.assignee}` : ""}
                      </div>
                      {crew.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {crew.map((c) => (
                            <span key={c.staffId} className="inline-flex items-center gap-1 rounded bg-surface px-1" title={c.role ?? undefined}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                              {c.name.split(" ")[0]}{c.role ? ` · ${c.role}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-1 flex items-center justify-between">
                        <Badge value={e.type} />
                        <form action={deleteEvent.bind(null, b.slug, e.id)}>
                          <button className="hidden text-muted hover:text-bad group-hover:inline" title="Remove (the crew get a cancellation)">×</button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
