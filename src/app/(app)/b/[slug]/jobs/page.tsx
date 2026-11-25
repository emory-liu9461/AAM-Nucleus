import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendReviewRequestNow, updateJob } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { can, requireBusinessPage } from "@/lib/session";
import { fmtDate, label, money as fmtMoney, pct } from "@/lib/format";
import { Badge } from "@/components/Badge";
import { WorkForm } from "@/components/WorkForm";
import { businessTz, whenLabel } from "@/lib/calendar";
import { crewFor } from "@/lib/staff";

const { jobs, contacts, invoices, payments, jobStatus, scheduleEvents, staffMembers } = schema;

export default async function JobsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ slug }, { view = "active" }] = await Promise.all([params, searchParams]);
  const { business: b, user } = await requireBusinessPage(slug);
  const money = can(user, "view_financials");
  const filter = view === "active" ? sql`${jobs.status} in ('scheduled','in_progress')` : view === "all" ? sql`true` : sql`${jobs.status} = ${view}`;
  const rows = await db
    .select({
      job: jobs,
      first: contacts.firstName,
      last: contacts.lastName,
      invoiced: sql<number>`(select coalesce(sum(amount),0) from ${invoices} where ${invoices.jobId} = ${jobs.id} and status <> 'void')`,
      paid: sql<number>`(select coalesce(sum(p.amount),0) from ${payments} p join ${invoices} i on i.id = p.invoice_id where i.job_id = ${jobs.id})`,
      review: sql<{ sent: string; clicked: string | null } | null>`(select json_build_object('sent', r.sent_at, 'clicked', r.clicked_at) from review_requests r where r.job_id = ${jobs.id})`,
    })
    .from(jobs)
    .innerJoin(contacts, eq(contacts.id, jobs.contactId))
    .where(and(eq(jobs.businessId, b.id), filter))
    .orderBy(desc(jobs.startDate))
    .limit(300);
  const tz = businessTz(b);
  const ids = rows.map((r) => r.job.id);
  const [events, staff] = await Promise.all([
    ids.length ? db.select().from(scheduleEvents).where(inArray(scheduleEvents.jobId, ids)).orderBy(asc(scheduleEvents.startsAt)) : Promise.resolve([]),
    db.select().from(staffMembers).where(eq(staffMembers.businessId, b.id)).orderBy(asc(staffMembers.name)),
  ]);
  const crews = await crewFor(events.map((e) => e.id));
  const openJobs = rows.filter((r) => ["scheduled", "in_progress"].includes(r.job.status)).map((r) => ({ id: r.job.id, name: r.job.name }));
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex gap-1 text-sm">
        {["active", "completed", "cancelled", "all"].map((v) => (
          <a key={v} href={`?view=${v}`} className={`rounded-lg px-3 py-1 ${view === v ? "bg-panel font-semibold border border-line" : "text-muted"}`}>{label(v)}</a>
        ))}
      </div>
      <div className="space-y-3">
        {rows.length === 0 && <div className="card text-center text-sm text-muted">No jobs here. Jobs are created when a lead is marked Won.</div>}
        {rows.map(({ job, first, last, invoiced, paid, review }) => {
          const cost = job.actualCost || job.estimatedCost;
          const margin = job.contractValue ? (job.contractValue - cost) / job.contractValue : null;
          return (
            <details key={job.id} className="card">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1">
                <span className="min-w-0 flex-1 font-medium">{job.name}<span className="ml-2 text-xs font-normal text-muted">{first} {last}</span></span>
                <Badge value={job.status} />
                {money && <span className="text-sm">{fmtMoney(job.contractValue)}</span>}
                {money && <span className="text-xs text-muted">Billed {fmtMoney(Number(invoiced))} · Paid {fmtMoney(Number(paid))} · Margin {pct(margin)}{job.actualCost ? "" : " (est.)"}</span>}
                {!money && (job.startDate || job.endDate) && <span className="text-xs text-muted">{job.startDate ?? "?"} → {job.endDate ?? "?"}</span>}
                <JobCrewSummary events={events.filter((e) => e.jobId === job.id)} crews={crews} now={now} tz={tz} />
              </summary>
              <form action={updateJob.bind(null, b.slug, job.id)} className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
                <label className="field">Status
                  <select className="input" name="status" defaultValue={job.status}>
                    {jobStatus.enumValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                </label>
                {money && (
                  <>
                    <label className="field">Contract ($)<input className="input" name="contractValue" defaultValue={job.contractValue / 100} /></label>
                    <label className="field">Est. cost ($)<input className="input" name="estimatedCost" defaultValue={job.estimatedCost / 100} /></label>
                    <label className="field">Actual cost ($)<input className="input" name="actualCost" defaultValue={job.actualCost / 100} /></label>
                  </>
                )}
                <label className="field">Start<input className="input" type="date" name="startDate" defaultValue={job.startDate ?? ""} title="Set automatically from the schedule once work is assigned" /></label>
                <label className="field">End<input className="input" type="date" name="endDate" defaultValue={job.endDate ?? ""} title="Set automatically from the schedule once work is assigned" /></label>
                <div className="flex items-end"><button className="btn w-full">Save</button></div>
              </form>
              {job.address && <p className="mt-2 text-xs text-muted">Site: {job.address}</p>}
              <div className="mt-4 space-y-2 border-t border-line pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Schedule and crew</span>
                  <span className="text-xs text-muted">The job&apos;s start and end dates follow its schedule.</span>
                </div>
                {events.filter((e) => e.jobId === job.id).length === 0 && <p className="text-sm text-muted">Nothing scheduled yet.</p>}
                <ul className="space-y-2">
                  {events.filter((e) => e.jobId === job.id).map((e) => {
                    const crew = crews.get(e.id) ?? [];
                    return (
                      <li key={e.id} className={`rounded-lg border border-line p-2 text-sm ${e.endsAt < now ? "opacity-60" : ""}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{whenLabel(e, tz)}{e.title !== job.name ? <span className="font-normal text-muted"> · {e.title}</span> : null}</span>
                          <a className="text-xs text-accent hover:underline" href={`/b/${b.slug}/staff?edit=${e.id}#edit`}>Change time or crew</a>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                          {crew.length === 0 && <span className="text-muted">No crew assigned</span>}
                          {crew.map((c) => (
                            <span key={c.staffId} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5" title={c.inviteError ?? (c.invitedAt ? "Calendar invite sent" : undefined)}>
                              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />{c.name}{c.role ? ` · ${c.role}` : ""}{c.inviteError ? " ⚠" : c.invitedAt ? " ✓" : ""}
                            </span>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {["scheduled", "in_progress"].includes(job.status) && (
                  <details className="rounded-lg border border-line p-3">
                    <summary className="cursor-pointer text-sm font-semibold">+ Assign work</summary>
                    <div className="mt-3">
                      <WorkForm slug={b.slug} tz={tz} jobs={openJobs} staff={staff} defaultJobId={job.id} />
                    </div>
                  </details>
                )}
              </div>
              {job.status === "completed" && (
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
                  <span className="font-medium">Review</span>
                  {review ? (
                    <span className="text-muted">Requested {fmtDate(review.sent)}{review.clicked ? <> · <span className="text-good">customer opened the review link</span></> : " · not opened yet"}</span>
                  ) : (
                    <span className="text-muted">Not requested yet</span>
                  )}
                  <ActionForm action={sendReviewRequestNow.bind(null, b.slug, job.id)} submit={review ? "Send again" : "Ask for a review"} pendingText="Sending…" className="flex flex-wrap items-center gap-2"><span /></ActionForm>
                </div>
              )}
            </details>
          );
        })}
      </div>
    </div>
  );
}

/** In the collapsed row: the next visit and how many people are on it. */
function JobCrewSummary({ events, crews, now, tz }: { events: (typeof schema.scheduleEvents.$inferSelect)[]; crews: Map<string, { name: string }[]>; now: Date; tz: string }) {
  const next = events.find((e) => e.endsAt > now);
  if (!next) return null;
  const crew = crews.get(next.id) ?? [];
  return <span className="text-xs text-muted">Next: {next.startsAt.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" })} · {crew.length ? `${crew.length} crew` : "no crew yet"}</span>;
}
