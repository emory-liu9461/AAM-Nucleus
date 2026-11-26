import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { businessTz, fmtTime, localDay, occurrences, whenLabel } from "@/lib/calendar";
import { crewFor } from "@/lib/staff";
import { arrivalText, workflowSettings } from "@/lib/workflow";
import { guaranteeDays, guaranteeWithin, logoFor, logoUrl } from "@/lib/site-defaults";
import { moneyExact } from "@/lib/format";
import { reviewSettings } from "@/lib/reviews";

/*
 * The customer's private project page (/p/<token>), linked from every workflow message:
 * how to get ready, when the crew is coming, progress updates with photos, and the review link.
 */

export const metadata: Metadata = { title: "Your project", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const { jobs, contacts, businesses, jobUpdates, jobPhotos, scheduleEvents, reviewRequests } = schema;
const STAGES = ["Booked", "Scheduled", "In progress", "Completed"];

export default async function ProjectPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const [row] = await db
    .select({ job: jobs, contact: contacts, b: businesses })
    .from(jobs)
    .innerJoin(contacts, eq(contacts.id, jobs.contactId))
    .innerJoin(businesses, eq(businesses.id, jobs.businessId))
    .where(eq(jobs.portalToken, token));
  if (!row || row.job.status === "cancelled") notFound();
  const { job, contact, b } = row;
  const tz = businessTz(b);
  const w = workflowSettings(b);

  const guarantee = guaranteeDays(b);
  const [events, updates, photos, [review], bills] = await Promise.all([
    db.select().from(scheduleEvents).where(eq(scheduleEvents.jobId, job.id)).orderBy(asc(scheduleEvents.startsAt)),
    db.select().from(jobUpdates).where(eq(jobUpdates.jobId, job.id)).orderBy(desc(jobUpdates.createdAt)),
    db.select({ id: jobPhotos.id, updateId: jobPhotos.updateId, width: jobPhotos.width, height: jobPhotos.height }).from(jobPhotos).where(eq(jobPhotos.jobId, job.id)).orderBy(asc(jobPhotos.createdAt)),
    db.select({ token: reviewRequests.token }).from(reviewRequests).where(eq(reviewRequests.jobId, job.id)),
    db
      .select({ number: schema.invoices.number, amount: schema.invoices.amount, status: schema.invoices.status, dueAt: schema.invoices.dueAt, payToken: schema.invoices.payToken, paid: sql<number>`(select coalesce(sum(p.amount),0) from payments p where p.invoice_id = "invoices"."id")` })
      .from(schema.invoices)
      .where(and(eq(schema.invoices.jobId, job.id), sql`${schema.invoices.status} <> 'void'`))
      .orderBy(asc(schema.invoices.issuedAt)),
  ]);
  const crews = await crewFor(events.map((e) => e.id));
  const now = new Date();
  const upcoming = events.filter((e) => e.endsAt > now);
  const started = events.some((e) => e.startsAt <= now);
  const stage = job.status === "completed" ? 3 : job.status === "in_progress" || started ? 2 : events.length ? 1 : 0;
  // Progress updates (with or without a message sent) and their photos; other steps are just notices.
  const progress = updates.filter((u) => u.kind === "progress" && (u.note || photos.some((p) => p.updateId === u.id)));
  const reviewHref = review ? `/r/${review.token}` : reviewSettings(b).link || null;
  const logo = logoFor(b);
  const today = localDay(now, tz);

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl(b)!} alt={b.name} className="h-10 w-auto max-w-[60%] object-contain object-left" />
          ) : (
            <span className="text-lg font-bold">{b.name}</span>
          )}
          {b.phone && <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`} className="btn shrink-0 text-sm" style={{ background: b.color }}>Call us</a>}
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div>
          <p className="text-sm text-muted">Hi {contact.firstName || "there"}, here&apos;s your project</p>
          <h1 className="text-2xl font-bold">{job.name}</h1>
          {job.address && <p className="text-sm text-muted">{job.address}</p>}
        </div>

        <ol className="grid grid-cols-4 gap-1.5" aria-label="Project status">
          {STAGES.map((s, i) => (
            <li key={s} aria-current={i === stage ? "step" : undefined}>
              <span className="block h-1.5 rounded-full" style={{ background: i <= stage ? b.color : "var(--color-line, #e5e7eb)" }} />
              <span className={`mt-1 block text-xs ${i === stage ? "font-semibold" : "text-muted"}`}>{s}</span>
            </li>
          ))}
        </ol>

        {job.status === "completed" ? (
          <section className="card space-y-2">
            <h2 className="font-semibold">Your project is complete 🎉</h2>
            <p className="text-sm">Thank you for choosing {b.name}.{guarantee ? ` Our guarantee: if anything isn't right, tell us within ${guaranteeWithin(guarantee)} of finishing and we'll come back and make it right.` : " If anything isn't right, just call or reply to our message and we'll make it right."}</p>
            {reviewHref && <a href={reviewHref} className="btn inline-block" style={{ background: b.color }}>Leave us a review</a>}
          </section>
        ) : (
          <section className="card space-y-3">
            <h2 className="font-semibold">When we&apos;ll be there</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">We&apos;ll let you know as soon as your project is on the schedule.</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((e) => {
                  const crew = crews.get(e.id) ?? [];
                  const occ = occurrences(e, tz);
                  const isToday = occ.some((o) => o.day === today);
                  return (
                    <li key={e.id} className="rounded-lg border border-line p-3" style={{ borderLeft: `4px solid ${b.color}` }}>
                      <div className="font-medium">{whenLabel(e, tz).replace(/, \d{1,2}:\d{2}.*$/, "")}{isToday && <span className="ml-2 rounded bg-surface px-1.5 text-xs">Today</span>}</div>
                      <div className="text-sm">Crew arrives between {arrivalText(b, e)}{e.days > 1 ? " each day" : ""}, and works until about {fmtTime(occ[0].end, tz)}.</div>
                      {crew.length > 0 && (
                        <div className="mt-1 text-sm text-muted">Your crew: {crew.map((c) => `${c.name.split(" ")[0]}${c.role ? ` (${c.role})` : ""}`).join(", ")}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {job.status !== "completed" && w.prepGuide.length > 0 && (
          <section className="card space-y-2">
            <h2 className="font-semibold">Before we arrive</h2>
            <p className="text-sm text-muted">A few things that help the work go quickly and safely:</p>
            <ul className="space-y-2">
              {w.prepGuide.map((r, i) => (
                <li key={i} className="flex gap-2 text-sm"><span className="mt-0.5 h-4 w-4 shrink-0 rounded border-2" style={{ borderColor: b.color }} aria-hidden /> {r}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="card space-y-4">
          <h2 className="font-semibold">Progress updates</h2>
          {progress.length === 0 && <p className="text-sm text-muted">Updates and photos from the crew will appear here.</p>}
          {progress.map((u) => {
            const pics = photos.filter((p) => p.updateId === u.id);
            return (
              <article key={u.id} className="space-y-2 border-b border-line pb-4 last:border-0 last:pb-0">
                <div className="text-xs text-muted">{u.createdAt.toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                {u.note && <p className="whitespace-pre-line text-sm">{u.note}</p>}
                {pics.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {pics.map((p) => (
                      <a key={p.id} href={`/p/${token}/photo/${p.id}`} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/p/${token}/photo/${p.id}`} alt="Progress photo" loading="lazy" width={p.width ?? undefined} height={p.height ?? undefined} className="aspect-square w-full rounded-lg object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        {bills.length > 0 && (
          <section className="card space-y-2">
            <h2 className="font-semibold">Invoices</h2>
            <ul className="divide-y divide-line text-sm">
              {bills.map((i) => {
                const due = i.amount - Number(i.paid);
                return (
                  <li key={i.payToken} className="flex items-center justify-between gap-3 py-2">
                    <span>{i.number} · {moneyExact(i.amount)}</span>
                    {due > 0 ? (
                      <a href={`/pay/${i.payToken}`} className="btn py-1.5 text-sm" style={{ background: b.color }}>Pay {moneyExact(due)}</a>
                    ) : (
                      <span className="font-medium text-good">Paid ✓</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="card space-y-1 text-sm">
          <h2 className="font-semibold">Questions?</h2>
          <p className="text-muted">Contact {b.name}{b.phone ? "" : " by email"}.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {b.phone && <a className="btn-ghost" href={`tel:${b.phone.replace(/[^\d+]/g, "")}`}>Call {b.phone}</a>}
            {b.phone && <a className="btn-ghost" href={`sms:${b.phone.replace(/[^\d+]/g, "")}`}>Text us</a>}
            {b.email && <a className="btn-ghost" href={`mailto:${b.email}`}>Email</a>}
          </div>
        </section>
        <p className="text-center text-xs text-muted">This page is private to you. Please don&apos;t share the link.</p>
      </main>
    </div>
  );
}
