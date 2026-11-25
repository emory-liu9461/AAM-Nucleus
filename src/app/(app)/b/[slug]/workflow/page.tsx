import Link from "next/link";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { deleteUpdate, onTheWay, resendWelcome, saveWorkflowSettings } from "@/app/workflow-actions";
import { ActionForm } from "@/components/ActionForm";
import { Badge } from "@/components/Badge";
import { CopyField } from "@/components/CopyField";
import { ProgressForm } from "@/components/ProgressForm";
import { businessTz, whenLabel } from "@/lib/calendar";
import { can, requireBusiness } from "@/lib/session";
import { crewFor } from "@/lib/staff";
import { STEPS, defaultPrepGuide, portalPath, portalUrl, stepsSent, workflowSettings } from "@/lib/workflow";
import { reviewSettings } from "@/lib/reviews";
import type { Business } from "@/db/schema";

const { jobs, contacts, scheduleEvents, jobUpdates, jobPhotos } = schema;

export default async function WorkflowPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ slug }, { view }] = await Promise.all([params, searchParams]);
  const { business: b, user } = await requireBusiness(slug);
  const owner = can(user, "manage_business");
  const settingsView = view === "settings" && owner;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 text-sm">
          <Link href="?" className={`rounded-lg px-3 py-1 ${!settingsView ? "border border-line bg-panel font-semibold" : "text-muted"}`}>Jobs</Link>
          {owner && <Link href="?view=settings" className={`rounded-lg px-3 py-1 ${settingsView ? "border border-line bg-panel font-semibold" : "text-muted"}`}>Messages &amp; rules</Link>}
        </div>
        <p className="text-xs text-muted">What your customers hear from you, from booking to review.</p>
      </div>
      {settingsView ? <Settings b={b} /> : <JobsView b={b} />}
    </div>
  );
}

/* ---------- Jobs: where each customer is in the journey ---------- */

async function JobsView({ b }: { b: Business }) {
  const tz = businessTz(b);
  const rows = await db
    .select({ job: jobs, contact: contacts })
    .from(jobs)
    .innerJoin(contacts, eq(contacts.id, jobs.contactId))
    .where(and(eq(jobs.businessId, b.id), or(sql`${jobs.status} in ('scheduled','in_progress')`, and(eq(jobs.status, "completed"), sql`coalesce(${jobs.endDate}, ${jobs.createdAt}::date) > now() - interval '30 days'`))))
    .orderBy(sql`case when ${jobs.status} = 'completed' then 1 else 0 end`, desc(jobs.createdAt))
    .limit(100);
  const ids = rows.map((r) => r.job.id);
  const [events, updates, photos, sent] = await Promise.all([
    ids.length ? db.select().from(scheduleEvents).where(inArray(scheduleEvents.jobId, ids)).orderBy(scheduleEvents.startsAt) : [],
    ids.length ? db.select().from(jobUpdates).where(inArray(jobUpdates.jobId, ids)).orderBy(desc(jobUpdates.createdAt)) : [],
    ids.length ? db.select({ id: jobPhotos.id, jobId: jobPhotos.jobId, updateId: jobPhotos.updateId }).from(jobPhotos).where(inArray(jobPhotos.jobId, ids)) : [],
    stepsSent(ids),
  ]);
  const crews = await crewFor(events.map((e) => e.id));
  const now = new Date();
  const w = workflowSettings(b);

  if (!rows.length) return <div className="card text-center text-sm text-muted">No active jobs. Jobs appear here when a lead is marked Won.</div>;
  return (
    <div className="space-y-3">
      {rows.map(({ job, contact }, i) => {
        const next = events.find((e) => e.jobId === job.id && e.endsAt > now);
        const crew = next ? crews.get(next.id) ?? [] : [];
        const done = sent.get(job.id) ?? [];
        const ups = updates.filter((u) => u.jobId === job.id);
        return (
          <details key={job.id} className="card" open={i === 0}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{job.name}</span>
                <span className="ml-2 text-xs text-muted">{contact.firstName} {contact.lastName}{contact.phone ? ` · ${contact.phone}` : ""}</span>
              </span>
              <Badge value={job.status} />
              <span className="text-xs text-muted">{next ? `Next: ${whenLabel(next, tz)}` : job.status === "completed" ? "" : "Not on the schedule yet"}</span>
            </summary>

            <div className="mt-4 space-y-4">
              {/* Journey: which messages went out */}
              <ol className="flex flex-wrap gap-2 text-xs">
                {STEPS.map((s) => {
                  const hits = done.filter((d) => d.kind === s.key);
                  const okHit = hits.filter((h) => h.channels);
                  const failed = hits.length > 0 && okHit.length === 0;
                  const off = !w.steps[s.key].enabled;
                  return (
                    <li key={s.key} title={failed ? hits[hits.length - 1].error ?? "" : okHit.length ? `Sent ${okHit[okHit.length - 1].createdAt.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} by ${okHit[okHit.length - 1].channels}` : off ? "Turned off in Messages & rules" : "Not sent yet"}
                      className={`rounded-full border px-2 py-1 ${okHit.length ? "border-good/40 bg-good/10" : failed ? "border-bad/40 bg-bad/10" : "border-line text-muted"}`}>
                      {okHit.length ? "✓" : failed ? "!" : off ? "–" : "○"} {s.title}{okHit.length > 1 ? ` ×${okHit.length}` : ""}
                    </li>
                  );
                })}
              </ol>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 text-sm font-medium">Customer&apos;s project page</div>
                    <CopyField value={portalUrl(job.portalToken) || portalPath(job.portalToken)} />
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                      <a className="text-accent hover:underline" href={portalPath(job.portalToken)} target="_blank" rel="noreferrer">Open it</a>
                      <ActionForm action={resendWelcome.bind(null, b.slug, job.id)} submit="Send the link to the customer" pendingText="Sending…" className="flex flex-wrap items-center gap-2"><span /></ActionForm>
                    </div>
                  </div>
                  {next && (
                    <div className="rounded-lg border border-line p-3 text-sm">
                      <div className="font-medium">{whenLabel(next, tz)}</div>
                      <div className="text-muted">{crew.length ? crew.map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`).join(", ") : "No crew assigned"} · <Link className="text-accent hover:underline" href={`/b/${b.slug}/staff?edit=${next.id}#edit`}>Change</Link></div>
                    </div>
                  )}
                  {job.status !== "completed" && (
                    <ActionForm action={onTheWay.bind(null, b.slug, job.id)} submit="On our way" pendingText="Sending…" className="flex flex-wrap items-end gap-2">
                      <label className="field">Arriving in
                        <select className="input" name="eta" defaultValue="30">
                          {[10, 15, 20, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                          <option value="">(don&apos;t say)</option>
                        </select>
                      </label>
                    </ActionForm>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Post a progress update</div>
                  <ProgressForm slug={b.slug} jobId={job.id} />
                </div>
              </div>

              {ups.length > 0 && (
                <div>
                  <div className="mb-1 text-sm font-medium">Activity</div>
                  <ul className="divide-y divide-line text-sm">
                    {ups.slice(0, 12).map((u) => {
                      const pics = photos.filter((p) => p.updateId === u.id);
                      return (
                        <li key={u.id} className="group flex gap-3 py-2">
                          <span className="w-28 shrink-0 text-xs text-muted">{u.createdAt.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="text-xs font-semibold">{STEPS.find((s) => s.key === u.kind)?.title ?? "Note"}
                              <span className={`ml-2 font-normal ${u.channels ? "text-good" : "text-muted"}`}>{u.channels ? `sent by ${u.channels.replace("sms", "text").replace(",", " and ")}` : u.error ? `not sent: ${u.error}` : "on the project page only"}</span>
                            </div>
                            <p className="whitespace-pre-line text-muted">{u.kind === "progress" ? u.note : u.message}</p>
                            {pics.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {pics.map((p) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img key={p.id} src={`/p/${job.portalToken}/photo/${p.id}`} alt="" className="h-16 w-16 rounded object-cover" />
                                ))}
                              </div>
                            )}
                          </div>
                          {u.kind === "progress" && (
                            <form action={deleteUpdate.bind(null, b.slug, u.id)}>
                              <button className="hidden text-muted hover:text-bad group-hover:inline" title="Remove from the project page">×</button>
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

/* ---------- Messages & rules (owner) ---------- */

function Settings({ b }: { b: Business }) {
  const w = workflowSettings(b);
  const review = reviewSettings(b);
  return (
    <ActionForm action={saveWorkflowSettings.bind(null, b.slug)} submit="Save messages & rules" className="space-y-4">
      <div className="card space-y-3">
        <h2 className="font-semibold">Before we arrive: the customer&apos;s prep guide</h2>
        <p className="text-sm text-muted">Shown on every customer&apos;s project page as a checklist. One rule per line. Clear the box to go back to the {b.trade.toLowerCase()} defaults.</p>
        <textarea className="input w-full font-normal" name="prepGuide" rows={Math.max(6, w.prepGuide.length + 1)} defaultValue={w.prepGuide.join("\n")} placeholder={defaultPrepGuide(b.trade).join("\n")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field">Arrival window (minutes)
            <input className="input" type="number" name="arrivalWindowMinutes" min={0} max={240} step={15} defaultValue={w.arrivalWindowMinutes} />
            <span className="font-normal">Work starting 8:00 tells the customer &ldquo;arrives between 8:00 and 8:{String(w.arrivalWindowMinutes % 60).padStart(2, "0")}&rdquo;.</span>
          </label>
          <label className="field">Send the reminder
            <select className="input" name="reminderDaysBefore" defaultValue={w.reminderDaysBefore}>
              <option value={1}>The day before</option>
              <option value={2}>2 days before</option>
              <option value={3}>3 days before</option>
            </select>
          </label>
        </div>
      </div>

      {STEPS.map((s) => {
        const st = w.steps[s.key];
        return (
          <div key={s.key} className="card space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-xs text-muted">{s.when}</p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name={`${s.key}_enabled`} defaultChecked={st.enabled} /> {s.key === "progress" ? "Send updates to the customer" : "On"}</label>
            </div>
            <textarea className="input w-full font-normal" name={`${s.key}_message`} rows={3} defaultValue={st.message} />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" name={`${s.key}_sms`} defaultChecked={st.sms} /> Text</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" name={`${s.key}_email`} defaultChecked={st.email} /> Email</label>
              <span className="text-xs text-muted">Fill-ins: {s.placeholders}{s.key === "completed" ? " {review_line}" : ""}</span>
            </div>
            {s.key === "completed" && (
              <p className="text-xs text-muted">
                {review.link ? "Includes your tracked review link (with one reminder if they don't open it). This replaces the separate review request." : <>Add your review link in <Link className="text-accent hover:underline" href={`/b/${b.slug}/settings`}>Settings → Review requests</Link> to include it.</>}
              </p>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted">{"{link}"} is the customer&apos;s private project page. Texts need the business phone number (Inbox → Settings) and emails need the business email. Every message also appears in the Inbox.</p>
    </ActionForm>
  );
}
