import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { createEvent, deleteEvent } from "@/app/actions";
import { getBusiness } from "@/lib/business";
import { label } from "@/lib/format";
import { Badge } from "@/components/Badge";

const { scheduleEvents, jobs, eventType } = schema;

export default async function SchedulePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ week?: string }> }) {
  const [{ slug }, { week = "0" }] = await Promise.all([params, searchParams]);
  const b = await getBusiness(slug);
  const offset = Number(week) || 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7); // Monday
  const end = new Date(start.getTime() + 7 * 864e5);

  const [events, jobList] = await Promise.all([
    db
      .select()
      .from(scheduleEvents)
      .where(and(eq(scheduleEvents.businessId, b.id), lt(scheduleEvents.startsAt, end), gte(scheduleEvents.endsAt, start)))
      .orderBy(asc(scheduleEvents.startsAt)),
    db.select({ id: jobs.id, name: jobs.name }).from(jobs).where(and(eq(jobs.businessId, b.id), sql`${jobs.status} in ('scheduled','in_progress')`)),
  ]);

  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 864e5));
  const todayKey = new Date().toDateString();
  const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <a className="btn-ghost" href={`?week=${offset - 1}`}>←</a>
          <a className="btn-ghost" href="?week=0">This week</a>
          <a className="btn-ghost" href={`?week=${offset + 1}`}>→</a>
          <span className="text-sm font-medium">
            {start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(end.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
      </div>

      <details className="card">
        <summary className="cursor-pointer text-sm font-semibold">+ New appointment</summary>
        <form action={createEvent.bind(null, b.slug)} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="field lg:col-span-2">Title<input className="input" name="title" required placeholder="Site visit – Smith" /></label>
          <label className="field">Type
            <select className="input" name="type" defaultValue="site_visit">
              {eventType.enumValues.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </label>
          <label className="field">Job (optional)
            <select className="input" name="jobId" defaultValue="">
              <option value="">—</option>
              {jobList.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </label>
          <label className="field">Date<input className="input" type="date" name="date" required /></label>
          <label className="field">Start<input className="input" type="time" name="start" defaultValue="08:00" /></label>
          <label className="field">End<input className="input" type="time" name="end" defaultValue="09:00" /></label>
          <label className="field">Assigned to<input className="input" name="assignee" placeholder="Crew A" /></label>
          <div className="flex items-end lg:col-start-4"><button className="btn w-full">Add to schedule</button></div>
        </form>
      </details>

      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const dayEnd = new Date(d.getTime() + 864e5);
          const list = events.filter((e) => e.startsAt < dayEnd && e.endsAt > d);
          return (
            <div key={d.toISOString()} className={`card min-h-32 p-2 ${d.toDateString() === todayKey ? "border-accent" : ""}`}>
              <div className="mb-2 text-xs font-semibold text-muted">{d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
              <div className="space-y-1.5">
                {list.map((e) => (
                  <div key={e.id} className="group rounded-lg border border-line p-1.5 text-xs" style={{ borderLeft: `3px solid ${b.color}` }}>
                    <div className="font-medium">{e.title}</div>
                    <div className="text-muted">{e.startsAt.toDateString() === d.toDateString() ? time(e.startsAt) : "cont."}{e.assignee ? ` · ${e.assignee}` : ""}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <Badge value={e.type} />
                      <form action={deleteEvent.bind(null, b.slug, e.id)}>
                        <button className="hidden text-muted hover:text-bad group-hover:inline" title="Remove">×</button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
