import Link from "next/link";
import { headers } from "next/headers";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteWork, emailCalendarLink, removeStaffMember, resetCalendarLink, saveStaffMember } from "@/app/staff-actions";
import { ActionForm } from "@/components/ActionForm";
import { CopyField } from "@/components/CopyField";
import { WorkForm } from "@/components/WorkForm";
import { addDays, atLocal, businessTz, fmtTime, fmtYmd, localDay, occurrences, weekStart, whenLabel } from "@/lib/calendar";
import { can, requireBusiness } from "@/lib/session";
import { CREW_ROLES, crewFor, feedPath, type CrewRow } from "@/lib/staff";
import { appBase } from "@/lib/twilio";
import type { ScheduleEvent, StaffMember } from "@/db/schema";

const { staffMembers, scheduleEvents, jobs } = schema;

export default async function StaffPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ week?: string; edit?: string }> }) {
  const [{ slug }, { week = "0", edit }] = await Promise.all([params, searchParams]);
  const { business: b, user } = await requireBusiness(slug);
  const manage = can(user, "manage_staff");
  const tz = businessTz(b);
  const offset = Number(week) || 0;
  const monday = weekStart(new Date(), tz, offset);
  const dayKeys = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const from = atLocal(monday, "00:00", tz);
  const to = atLocal(addDays(monday, 7), "00:00", tz);
  const today = localDay(new Date(), tz);

  const [staff, events, jobList, editing] = await Promise.all([
    db.select().from(staffMembers).where(eq(staffMembers.businessId, b.id)).orderBy(sql`${staffMembers.active} desc`, asc(staffMembers.name)),
    db.select().from(scheduleEvents).where(and(eq(scheduleEvents.businessId, b.id), lt(scheduleEvents.startsAt, to), gte(scheduleEvents.endsAt, from))).orderBy(asc(scheduleEvents.startsAt)),
    db.select({ id: jobs.id, name: jobs.name }).from(jobs).where(and(eq(jobs.businessId, b.id), sql`${jobs.status} in ('scheduled','in_progress')`)).orderBy(asc(jobs.name)),
    edit && /^[0-9a-f-]{36}$/.test(edit) ? db.select().from(scheduleEvents).where(and(eq(scheduleEvents.id, edit), eq(scheduleEvents.businessId, b.id))) : Promise.resolve([] as ScheduleEvent[]),
  ]);
  const editEvent = editing[0];
  const crews = await crewFor([...events.map((e) => e.id), ...(editEvent ? [editEvent.id] : [])]);
  const base = appBase(await headers());
  const weekQ = offset ? `week=${offset}&` : "";

  // Each working day of each event in this week, per person (and the work nobody is on yet).
  const cells = new Map<string, { e: ScheduleEvent; role: string | null; start: Date; end: Date }[]>();
  const put = (key: string, v: { e: ScheduleEvent; role: string | null; start: Date; end: Date }) => cells.set(key, [...(cells.get(key) ?? []), v]);
  for (const e of events) {
    const crew = crews.get(e.id) ?? [];
    for (const o of occurrences(e, tz)) {
      if (!dayKeys.includes(o.day)) continue;
      if (!crew.length) put(`none|${o.day}`, { e, role: null, start: o.start, end: o.end });
      for (const c of crew) put(`${c.staffId}|${o.day}`, { e, role: c.role, start: o.start, end: o.end });
    }
  }
  const rows: { id: string; name: string; color: string; title: string | null }[] = [
    ...staff.filter((s) => s.active || dayKeys.some((d) => cells.has(`${s.id}|${d}`))),
    { id: "none", name: "Not assigned", color: "#9ca3af", title: null },
  ];
  const weekCount = (id: string) => new Set(dayKeys.flatMap((d) => (cells.get(`${id}|${d}`) ?? []).map((c) => c.e.id))).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <a className="btn-ghost" href={`?week=${offset - 1}`} aria-label="Previous week">←</a>
          <a className="btn-ghost" href="?week=0">This week</a>
          <a className="btn-ghost" href={`?week=${offset + 1}`} aria-label="Next week">→</a>
          <span className="text-sm font-medium">{fmtYmd(monday, { month: "short", day: "numeric" })} – {fmtYmd(dayKeys[6], { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
        <span className="text-xs text-muted">Times in {tz.replace(/_/g, " ")}</span>
      </div>

      {editEvent ? (
        <section className="card space-y-3" id="edit">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Edit: {editEvent.title}</h2>
            <div className="flex items-center gap-2">
              <form action={deleteWork.bind(null, b.slug, editEvent.id)}>
                <button className="btn-ghost text-bad">Delete and send cancellations</button>
              </form>
              <Link className="btn-ghost" href={`?${weekQ}`}>Close</Link>
            </div>
          </div>
          <p className="text-sm text-muted">{whenLabel(editEvent, tz)}</p>
          <CrewStatus crew={crews.get(editEvent.id) ?? []} />
          <WorkForm slug={b.slug} tz={tz} jobs={jobList} staff={staff} event={editEvent} crew={crews.get(editEvent.id) ?? []} />
        </section>
      ) : (
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold">+ Assign work</summary>
          <div className="mt-4">
            <WorkForm slug={b.slug} tz={tz} jobs={jobList} staff={staff} defaultDate={dayKeys.includes(today) ? today : monday} />
          </div>
        </details>
      )}

      {/* Weekly crew scheduler */}
      <section>
        <h2 className="mb-2 font-semibold">Crew schedule</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[860px] table-fixed text-xs">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="w-40 p-2 font-semibold">Crew</th>
                {dayKeys.map((d) => (
                  <th key={d} className={`p-2 font-semibold ${d === today ? "text-accent" : ""}`}>{fmtYmd(d, { weekday: "short", month: "short", day: "numeric" })}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line align-top last:border-0">
                  <td className="p-2">
                    <div className="flex items-center gap-1.5 font-medium"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />{r.name}</div>
                    {r.title && <div className="text-muted">{r.title}</div>}
                    {r.id !== "none" && <div className="text-muted">{weekCount(r.id)} this week</div>}
                  </td>
                  {dayKeys.map((d) => (
                    <td key={d} className={`p-1.5 ${d === today ? "bg-accent/5" : ""}`}>
                      <div className="space-y-1">
                        {(cells.get(`${r.id}|${d}`) ?? []).map(({ e, role, start, end }) => (
                          <Link key={e.id} href={`?${weekQ}edit=${e.id}#edit`} className="block rounded-md border border-line bg-white p-1.5 hover:border-accent" style={{ borderLeft: `3px solid ${r.id === "none" ? b.color : r.color}` }}>
                            <div className="truncate font-medium">{e.title}</div>
                            <div className="text-muted">{fmtTime(start, tz)}–{fmtTime(end, tz)}</div>
                            {role && <div className="mt-0.5 inline-block rounded bg-surface px-1 text-[11px] font-medium">{role}</div>}
                          </Link>
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-muted">Click any work to change the time or crew. &ldquo;Not assigned&rdquo; shows appointments with nobody on them yet, like site visits the AI booked.</p>
      </section>

      {/* Crew directory */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Crew ({staff.filter((s) => s.active).length})</h2>
        </div>
        {staff.length === 0 && <p className="card text-sm text-muted">No crew yet.{manage ? " Add your first crew member below." : " Ask an owner or manager to add the crew."}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {staff.map((s) => <StaffCard key={s.id} s={s} slug={b.slug} manage={manage} feed={`${base}${feedPath(s.calendarToken)}`} businessName={b.name} />)}
        </div>
        {manage && (
          <div className="card">
            <h3 className="text-sm font-semibold">Add crew member</h3>
            <StaffForm slug={b.slug} defaultColor={CREW_COLORS[staff.length % CREW_COLORS.length]} />
          </div>
        )}
      </section>
    </div>
  );
}

function CrewStatus({ crew }: { crew: CrewRow[] }) {
  if (!crew.length) return <p className="text-sm text-muted">Nobody is assigned yet.</p>;
  return (
    <ul className="flex flex-wrap gap-2 text-xs">
      {crew.map((c) => (
        <li key={c.staffId} className="flex items-center gap-1.5 rounded-full border border-line px-2 py-1" title={c.inviteError ?? undefined}>
          <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
          <span className="font-medium">{c.name}</span>
          {c.role && <span className="text-muted">· {c.role}</span>}
          <span className={c.invitedAt && !c.inviteError ? "text-good" : "text-muted"}>
            {c.inviteError ? `· invite not sent (${c.inviteError})` : c.invitedAt ? "· invite sent" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

const CREW_COLORS = ["#2563eb", "#d97706", "#059669", "#db2777", "#7c3aed", "#0891b2", "#dc2626", "#65a30d"];

function StaffForm({ slug, s, defaultColor = "#2563eb" }: { slug: string; s?: StaffMember; defaultColor?: string }) {
  return (
    <ActionForm action={saveStaffMember.bind(null, slug, s?.id ?? null)} submit={s ? "Save" : "Add crew member"} resetOnSuccess={!s} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="field">Name *<input className="input" name="name" required defaultValue={s?.name ?? ""} /></label>
      <label className="field">Usual role
        <input className="input" name="title" list={`titles-${s?.id ?? "new"}`} defaultValue={s?.title ?? ""} placeholder="Painter, Driver, Crew lead…" />
        <datalist id={`titles-${s?.id ?? "new"}`}>{CREW_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
      </label>
      <label className="field">Mobile phone<input className="input" name="phone" type="tel" defaultValue={s?.phone ?? ""} /></label>
      <label className="field">Email (for calendar invites)<input className="input" name="email" type="email" defaultValue={s?.email ?? ""} /></label>
      <label className="field">Colour on the schedule<input className="input h-10 p-1" name="color" type="color" defaultValue={s?.color ?? defaultColor} /></label>
      <label className="field sm:col-span-2">Notes (licences, certifications, availability…)<input className="input" name="notes" defaultValue={s?.notes ?? ""} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sendInvites" defaultChecked={s?.sendInvites ?? true} /> Email calendar invites when they&apos;re scheduled</label>
      {s && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={s.active} /> Active (shows on the schedule)</label>}
    </ActionForm>
  );
}

function StaffCard({ s, slug, manage, feed, businessName }: { s: StaffMember; slug: string; manage: boolean; feed: string; businessName: string }) {
  const webcal = feed.replace(/^https?:/, "webcal:");
  return (
    <div className={`card space-y-3 ${s.active ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-semibold"><span className="h-3 w-3 rounded-full" style={{ background: s.color }} />{s.name}{!s.active && <span className="pill bg-gray-500/15 text-xs">Inactive</span>}</div>
          {s.title && <div className="text-sm text-muted">{s.title}</div>}
        </div>
      </div>
      <ul className="space-y-1 text-sm">
        <li>{s.phone ? <a className="hover:underline" href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>📞 {s.phone}</a> : <span className="text-muted">No phone</span>}</li>
        <li>{s.email ? <a className="hover:underline" href={`mailto:${s.email}`}>✉️ {s.email}</a> : <span className="text-muted">No email: they won&apos;t get calendar invites</span>}</li>
        {s.email && !s.sendInvites && <li className="text-muted">Calendar invites are off</li>}
        {s.notes && <li className="text-muted">{s.notes}</li>}
      </ul>
      {manage && (
        <>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Calendar link</summary>
            <div className="mt-2 space-y-2 text-sm">
              <p className="text-muted">Their personal schedule as a calendar they subscribe to once. Every job they&apos;re on appears automatically and stays up to date (calendar apps refresh every few hours).</p>
              <CopyField value={feed} />
              <div className="flex flex-wrap gap-2">
                <a className="btn-ghost" target="_blank" rel="noreferrer" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}>Add to Google Calendar</a>
                <a className="btn-ghost" target="_blank" rel="noreferrer" href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed)}&name=${encodeURIComponent(businessName)}`}>Add to Outlook</a>
                <a className="btn-ghost" href={webcal}>Apple Calendar</a>
              </div>
              {s.email && (
                <ActionForm action={emailCalendarLink.bind(null, slug, s.id)} submit={`Email the link to ${s.name.split(" ")[0]}`} pendingText="Sending…">
                  <span />
                </ActionForm>
              )}
              <form action={resetCalendarLink.bind(null, slug, s.id)}>
                <button className="text-xs text-muted hover:text-bad">Make a new link (the old one stops working)</button>
              </form>
            </div>
          </details>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Edit details</summary>
            <StaffForm slug={slug} s={s} />
            <form action={removeStaffMember.bind(null, slug, s.id)} className="mt-3">
              <button className="text-xs text-muted hover:text-bad">Remove {s.name} (their upcoming work gets a cancellation)</button>
            </form>
          </details>
        </>
      )}
    </div>
  );
}
