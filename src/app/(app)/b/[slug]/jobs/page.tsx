import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendReviewRequestNow, updateJob } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { can, requireBusinessPage } from "@/lib/session";
import { fmtDate, label, money as fmtMoney, pct } from "@/lib/format";
import { Badge } from "@/components/Badge";

const { jobs, contacts, invoices, payments, jobStatus } = schema;

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
                <label className="field">Start<input className="input" type="date" name="startDate" defaultValue={job.startDate ?? ""} /></label>
                <label className="field">End<input className="input" type="date" name="endDate" defaultValue={job.endDate ?? ""} /></label>
                <div className="flex items-end"><button className="btn w-full">Save</button></div>
              </form>
              {job.address && <p className="mt-2 text-xs text-muted">Site: {job.address}</p>}
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
