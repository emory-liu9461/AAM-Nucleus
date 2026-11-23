import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { updateJob } from "@/app/actions";
import { getBusiness } from "@/lib/business";
import { label, money, pct } from "@/lib/format";
import { Badge } from "@/components/Badge";

const { jobs, contacts, invoices, payments, jobStatus } = schema;

export default async function JobsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ slug }, { view = "active" }] = await Promise.all([params, searchParams]);
  const b = await getBusiness(slug);
  const filter = view === "active" ? sql`${jobs.status} in ('scheduled','in_progress')` : view === "all" ? sql`true` : sql`${jobs.status} = ${view}`;
  const rows = await db
    .select({
      job: jobs,
      first: contacts.firstName,
      last: contacts.lastName,
      invoiced: sql<number>`(select coalesce(sum(amount),0) from ${invoices} where ${invoices.jobId} = ${jobs.id} and status <> 'void')`,
      paid: sql<number>`(select coalesce(sum(p.amount),0) from ${payments} p join ${invoices} i on i.id = p.invoice_id where i.job_id = ${jobs.id})`,
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
        {rows.map(({ job, first, last, invoiced, paid }) => {
          const cost = job.actualCost || job.estimatedCost;
          const margin = job.contractValue ? (job.contractValue - cost) / job.contractValue : null;
          return (
            <details key={job.id} className="card">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1">
                <span className="min-w-0 flex-1 font-medium">{job.name}<span className="ml-2 text-xs font-normal text-muted">{first} {last}</span></span>
                <Badge value={job.status} />
                <span className="text-sm">{money(job.contractValue)}</span>
                <span className="text-xs text-muted">Billed {money(Number(invoiced))} · Paid {money(Number(paid))} · Margin {pct(margin)}{job.actualCost ? "" : " (est.)"}</span>
              </summary>
              <form action={updateJob.bind(null, b.slug, job.id)} className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
                <label className="field">Status
                  <select className="input" name="status" defaultValue={job.status}>
                    {jobStatus.enumValues.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                </label>
                <label className="field">Contract ($)<input className="input" name="contractValue" defaultValue={job.contractValue / 100} /></label>
                <label className="field">Est. cost ($)<input className="input" name="estimatedCost" defaultValue={job.estimatedCost / 100} /></label>
                <label className="field">Actual cost ($)<input className="input" name="actualCost" defaultValue={job.actualCost / 100} /></label>
                <label className="field">Start<input className="input" type="date" name="startDate" defaultValue={job.startDate ?? ""} /></label>
                <label className="field">End<input className="input" type="date" name="endDate" defaultValue={job.endDate ?? ""} /></label>
                <div className="flex items-end"><button className="btn w-full">Save</button></div>
              </form>
              {job.address && <p className="mt-2 text-xs text-muted">Site: {job.address}</p>}
            </details>
          );
        })}
      </div>
    </div>
  );
}
