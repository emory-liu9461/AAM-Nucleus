import { randomBytes } from "node:crypto";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business, Contact, Job, ScheduleEvent, WorkflowMessage, WorkflowSettings, WorkflowStep } from "@/db/schema";
import { addDays, atLocal, businessTz, fmtTime, localDay, occurrences, whenLabel } from "./calendar";
import { crewFor } from "./staff";
import { emailSettings, postmarkConfigured, sendBusinessEmail } from "./email";
import { phoneSettings, sendBusinessSms } from "./sms";
import { toE164, twilioConfigured } from "./twilio";
import { reviewSettings } from "./reviews";
import { guaranteeDays, guaranteeWithin } from "./site-defaults";

/*
 * Customer workflow: what the customer hears from the business through a job.
 *   welcome    – the job is booked (lead marked Won): project page link + how to prepare
 *   scheduled  – work is put on the schedule or moved: dates, arrival window, who's coming
 *   reminder   – the day before (daily job)
 *   on_the_way – button in Nucleus when the crew heads out
 *   progress   – an update with photos, posted from Nucleus
 *   completed  – job marked Completed: thank-you, photos, review link
 * Every message links to the customer's project page (/p/<token>).
 */

const { jobs, contacts, jobUpdates, scheduleEvents, reviewRequests, businesses } = schema;

export const STEPS: { key: WorkflowStep; title: string; when: string; placeholders: string }[] = [
  { key: "welcome", title: "Job booked", when: "When a lead is marked Won (the job is created)", placeholders: "{name} {business} {job} {link}" },
  { key: "scheduled", title: "Work scheduled", when: "When work for the job is put on the schedule, or the time changes", placeholders: "{name} {business} {job} {dates} {arrival} {crew} {link}" },
  { key: "visit_cancelled", title: "Visit cancelled", when: "When scheduled work for the job is deleted (before it happens)", placeholders: "{name} {business} {job} {dates} {phone} {link}" },
  { key: "reminder", title: "Day-before reminder", when: "The day before the crew arrives (sent each morning)", placeholders: "{name} {business} {job} {dates} {arrival} {crew} {link}" },
  { key: "on_the_way", title: "On our way", when: "When you press “On our way” on a job", placeholders: "{name} {business} {crew} {eta} {link}" },
  { key: "progress", title: "Progress update", when: "When you post an update (with photos) on a job", placeholders: "{name} {business} {job} {update} {link}" },
  { key: "completed", title: "Job completed", when: "When the job is marked Completed", placeholders: "{name} {business} {job} {link} {review_link} {guarantee_line}" },
];

const DEFAULT_MESSAGES: Record<WorkflowStep, string> = {
  welcome: "Hi {name}, thanks for choosing {business}! Your project ({job}) is booked. Here's your project page, with how to get ready and when we'll be there: {link}",
  scheduled: "Hi {name}, your {job} is scheduled for {dates}. Our crew arrives between {arrival}: {crew}. Details and prep checklist: {link}",
  visit_cancelled: "Hi {name}, our visit for your {job} on {dates} has been cancelled. We'll be in touch to find a new time. Questions? Call us at {phone}. {link}",
  reminder: "Hi {name}, a reminder that {business} arrives tomorrow between {arrival}. Please make sure we can get in and the work areas are clear: {link}",
  on_the_way: "Hi {name}, {crew} from {business} {eta}. See you soon!",
  progress: "Update on your {job}: {update} Photos: {link}",
  completed: "Hi {name}, your {job} is complete! Thank you for choosing {business}.{guarantee_line} Photos and details: {link}{review_line}",
};

const PREP_GUIDES: [RegExp, string[]][] = [
  [/paint|stain|coating/i, [
    "Move furniture to the middle of each room (we can help with heavy pieces).",
    "Take down pictures, mirrors, curtains and wall hangings in the rooms we're painting.",
    "Clear a path to the walls, windows and trim we're working on.",
    "Make sure we can get in: share the door, lockbox or gate code ahead of time.",
    "Keep pets and children out of the work areas.",
    "Leave a parking spot or driveway space for our van.",
    "For exterior work: move patio furniture and planters away from the walls, and turn off sprinklers the day before.",
    "Expect a mild paint smell: open windows where you can.",
  ]],
  [/clean|janitor|maid/i, [
    "Pick up clutter, toys and clothes so we can reach the surfaces.",
    "Put away valuables, cash and anything fragile.",
    "Tell us about surfaces that need special care (natural stone, antiques, hardwood).",
    "Make sure we can get in: share the door, lockbox or building access ahead of time.",
    "Keep pets secured or out of the rooms we're cleaning.",
    "Leave a parking spot if you can.",
  ]],
  [/roof/i, [
    "Move vehicles out of the driveway and away from the house.",
    "Move patio furniture, grills and planters away from the walls.",
    "Take fragile items off walls and shelves on the top floor (hammering can shake them).",
    "Cover belongings in the attic: some dust can fall through.",
    "Keep pets indoors and away from the work area.",
    "Make sure we can use an outdoor power outlet.",
  ]],
  [/landscap|lawn|garden/i, [
    "Unlock gates and let us know any gate codes.",
    "Move vehicles, toys, hoses and furniture out of the work area.",
    "Keep pets indoors while we work.",
    "Mark sprinkler heads, invisible dog fences and anything buried we should avoid.",
  ]],
  [/.*/, [
    "Clear the work area of furniture and belongings (we can help with heavy pieces).",
    "Make sure we can get in: share the door, lockbox or gate code ahead of time.",
    "Keep pets and children away from the work area.",
    "Leave a parking spot or driveway space for our trucks.",
    "Let us know where we can find power and water.",
  ]],
];

export function workflowSettings(b: Pick<Business, "workflowSettings" | "trade">) {
  const w: WorkflowSettings = b.workflowSettings ?? {};
  const step = (k: WorkflowStep): Required<WorkflowMessage> => {
    const s = w.steps?.[k] ?? {};
    // On by default, except "progress" (sent only when you post one, so it's always "on").
    return { enabled: s.enabled ?? true, sms: s.sms ?? true, email: s.email ?? true, message: s.message?.trim() || DEFAULT_MESSAGES[k] };
  };
  return {
    steps: Object.fromEntries(STEPS.map(({ key }) => [key, step(key)])) as Record<WorkflowStep, Required<WorkflowMessage>>,
    prepGuide: w.prepGuide?.length ? w.prepGuide : defaultPrepGuide(b.trade),
    arrivalWindowMinutes: w.arrivalWindowMinutes ?? 30,
    reminderDaysBefore: w.reminderDaysBefore ?? 1,
  };
}

export const defaultPrepGuide = (trade: string) => PREP_GUIDES.find(([re]) => re.test(trade))![1];
export const defaultMessage = (k: WorkflowStep) => DEFAULT_MESSAGES[k];

const appUrl = () => process.env.APP_URL?.replace(/\/$/, "") ?? "";
export const portalPath = (token: string) => `/p/${token}`;
export const portalUrl = (token: string) => `${appUrl()}${portalPath(token)}`;

/** The schedule entries for a job, oldest first. */
export async function jobEvents(jobId: string) {
  return db.select().from(scheduleEvents).where(eq(scheduleEvents.jobId, jobId)).orderBy(asc(scheduleEvents.startsAt));
}

/** "Sam (Driver) and Ana (Painter)" – first names only, for customers. */
function crewText(crew: { name: string; role: string | null }[]) {
  const names = crew.map((c) => `${c.name.split(" ")[0]}${c.role ? ` (${c.role})` : ""}`);
  return names.length <= 1 ? names[0] ?? "our crew" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function arrivalText(b: Business, e: Pick<ScheduleEvent, "startsAt" | "endsAt" | "days">) {
  const tz = businessTz(b);
  const start = occurrences(e, tz)[0].start;
  const end = new Date(start.getTime() + workflowSettings(b).arrivalWindowMinutes * 60000);
  return `${fmtTime(start, tz)} and ${fmtTime(end, tz)}`;
}

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m)).replace(/\s+([.,!?])/g, "$1").trim();
}

type Ctx = { b: Business; job: Job; contact: Contact };

async function context(b: Business, jobId: string): Promise<Ctx | null> {
  const [row] = await db.select({ job: jobs, contact: contacts }).from(jobs).innerJoin(contacts, eq(contacts.id, jobs.contactId)).where(and(eq(jobs.id, jobId), eq(jobs.businessId, b.id)));
  return row ? { b, ...row } : null;
}

/** Text and/or email the customer, log it on the job. Returns the channels used or an error. */
async function deliver(ctx: Ctx, kind: WorkflowStep, text: string, opts: { eventId?: string | null; note?: string | null; userId?: string | null; force?: boolean } = {}) {
  const { b, job, contact } = ctx;
  const step = workflowSettings(b).steps[kind];
  const used: string[] = [];
  const problems: string[] = [];
  const phone = toE164(contact.phone);
  if (step.sms && phone) {
    if (contact.smsOptOut) problems.push("customer opted out of texts");
    else if (!phoneSettings(b).number || !twilioConfigured()) problems.push("texting isn't set up");
    else {
      const r = await sendBusinessSms(b, phone, text, { contactId: contact.id, author: "system", sentById: opts.userId ?? null });
      if ("error" in r && r.error) problems.push(r.error);
      else used.push("sms");
    }
  }
  if (step.email && contact.email) {
    if (!emailSettings(b).fromAddress || !postmarkConfigured()) problems.push("email isn't set up");
    else {
      const title = STEPS.find((s) => s.key === kind)!.title;
      const r = await sendBusinessEmail(b, contact.email, `${title}: ${job.name}`, text, { contactId: contact.id, author: "system", sentById: opts.userId ?? null });
      if ("error" in r && r.error) problems.push(r.error);
      else used.push("email");
    }
  }
  if (!phone && !contact.email) problems.push("the customer has no phone or email");
  const error = used.length ? null : problems.join("; ") || "nothing to send";
  const [row] = await db
    .insert(jobUpdates)
    .values({ businessId: b.id, jobId: job.id, eventId: opts.eventId ?? null, kind, note: opts.note ?? null, message: text, channels: used.join(","), error, createdById: opts.userId ?? null })
    .returning({ id: jobUpdates.id });
  return { id: row.id, channels: used, error };
}

const already = async (jobId: string, kind: WorkflowStep, eventId?: string) => {
  const [r] = await db.select({ id: jobUpdates.id }).from(jobUpdates).where(and(eq(jobUpdates.jobId, jobId), eq(jobUpdates.kind, kind), eventId ? eq(jobUpdates.eventId, eventId) : sql`true`)).limit(1);
  return Boolean(r);
};

/* ---------- the steps ---------- */

export async function sendWelcome(b: Business, jobId: string, opts: { userId?: string | null; force?: boolean } = {}) {
  const ctx = await context(b, jobId);
  const s = workflowSettings(b).steps.welcome;
  if (!ctx || (!s.enabled && !opts.force) || (!opts.force && (await already(jobId, "welcome")))) return null;
  return deliver(ctx, "welcome", fill(s.message, base(ctx)), opts);
}

/** Work for this job was scheduled or moved. */
export async function sendScheduled(b: Business, eventId: string, opts: { userId?: string | null; changed?: boolean } = {}) {
  const [e] = await db.select().from(scheduleEvents).where(and(eq(scheduleEvents.id, eventId), eq(scheduleEvents.businessId, b.id)));
  if (!e?.jobId || e.endsAt < new Date()) return null;
  const s = workflowSettings(b).steps.scheduled;
  const ctx = await context(b, e.jobId);
  if (!ctx || !s.enabled || ["completed", "cancelled"].includes(ctx.job.status)) return null;
  const text = fill(s.message, await eventVars(ctx, e));
  return deliver(ctx, "scheduled", opts.changed ? `Schedule change: ${text}` : text, { eventId, userId: opts.userId });
}

/** Scheduled work for the job is about to be deleted: tell the customer (only for visits still to come). */
export async function sendVisitCancelled(b: Business, eventId: string, opts: { userId?: string | null } = {}) {
  const [e] = await db.select().from(scheduleEvents).where(and(eq(scheduleEvents.id, eventId), eq(scheduleEvents.businessId, b.id)));
  if (!e?.jobId || e.startsAt < new Date()) return null;
  const s = workflowSettings(b).steps.visit_cancelled;
  const ctx = await context(b, e.jobId);
  if (!ctx || !s.enabled || ["completed", "cancelled"].includes(ctx.job.status)) return null;
  return deliver(ctx, "visit_cancelled", fill(s.message, await eventVars(ctx, e)), { userId: opts.userId });
}

export async function sendOnTheWay(b: Business, jobId: string, etaMinutes: number | null, userId: string) {
  const ctx = await context(b, jobId);
  if (!ctx) return { error: "Job not found" };
  const s = workflowSettings(b).steps.on_the_way;
  const tz = businessTz(b);
  // The crew on today's work for this job, if any.
  const today = localDay(new Date(), tz);
  const todays = (await jobEvents(jobId)).find((e) => occurrences(e, tz).some((o) => o.day === today));
  const crew = todays ? (await crewFor([todays.id])).get(todays.id) ?? [] : [];
  const eta = etaMinutes ? `is on the way and should arrive in about ${etaMinutes} minutes` : "is on the way";
  const verb = crew.length > 1 ? eta.replace(/^is /, "are ") : eta;
  return deliver(ctx, "on_the_way", fill(s.message, { ...base(ctx), crew: crew.length ? crewText(crew) : "our crew", eta: verb }), { eventId: todays?.id ?? null, userId });
}

export async function sendProgress(b: Business, jobId: string, update: string, userId: string, notify: boolean) {
  const ctx = await context(b, jobId);
  if (!ctx) throw new Error("Job not found");
  const s = workflowSettings(b).steps.progress;
  if (!notify || !s.enabled) {
    const [row] = await db.insert(jobUpdates).values({ businessId: b.id, jobId, kind: "progress", note: update, message: null, channels: "", createdById: userId }).returning({ id: jobUpdates.id });
    return { id: row.id, channels: [] as string[], error: null };
  }
  return deliver(ctx, "progress", fill(s.message, { ...base(ctx), update: update.replace(/[.!?]?$/, (m) => m || ".") }), { note: update, userId });
}

/** Job marked Completed: thank-you + review link (this replaces the separate review request). */
export async function sendCompleted(b: Business, jobId: string, opts: { userId?: string | null } = {}) {
  const s = workflowSettings(b).steps.completed;
  const ctx = await context(b, jobId);
  if (!ctx || !s.enabled || (await already(jobId, "completed"))) return null;
  const r = reviewSettings(b);
  let reviewLink = "";
  let token: string | null = null;
  if (r.link) {
    const [existing] = await db.select().from(reviewRequests).where(eq(reviewRequests.jobId, jobId));
    token = existing?.token ?? randomBytes(9).toString("base64url");
    reviewLink = appUrl() ? `${appUrl()}/r/${token}` : r.link;
  }
  const days = guaranteeDays(b);
  const vars = {
    ...base(ctx),
    review_link: reviewLink,
    review_line: reviewLink ? ` If you're happy with the work, a quick review helps a local business a lot: ${reviewLink}` : "",
    guarantee_line: days ? ` If anything isn't right, tell us within ${guaranteeWithin(days)} and we'll make it right.` : "",
  };
  const msg = s.message.includes("{review_link}") || s.message.includes("{review_line}") || !reviewLink ? fill(s.message, vars) : `${fill(s.message, vars)} Leave us a review: ${reviewLink}`;
  const sent = await deliver(ctx, "completed", msg, opts);
  // Track the review link like a review request, so clicks and the reminder still work.
  if (token && sent.channels.length) {
    await db.insert(reviewRequests).values({ businessId: b.id, jobId, contactId: ctx.contact.id, token, channels: sent.channels.join(",") }).onConflictDoNothing();
  }
  return sent;
}

/** Daily: remind customers whose crew arrives in N days (default tomorrow). Once per schedule entry. */
export async function sendReminders() {
  const list = await db.select().from(businesses).where(eq(businesses.archived, false));
  let sent = 0;
  for (const b of list) {
    const w = workflowSettings(b);
    if (!w.steps.reminder.enabled) continue;
    const tz = businessTz(b);
    const target = addDays(localDay(new Date(), tz), w.reminderDaysBefore);
    const from = atLocal(target, "00:00", tz);
    const to = atLocal(addDays(target, 1), "00:00", tz);
    const events = await db.select().from(scheduleEvents).where(and(eq(scheduleEvents.businessId, b.id), gte(scheduleEvents.startsAt, from), lt(scheduleEvents.startsAt, to), sql`${scheduleEvents.jobId} is not null`));
    for (const e of events) {
      if (await already(e.jobId!, "reminder", e.id)) continue;
      const ctx = await context(b, e.jobId!);
      if (!ctx || ["completed", "cancelled"].includes(ctx.job.status)) continue;
      await deliver(ctx, "reminder", fill(w.steps.reminder.message, await eventVars(ctx, e)), { eventId: e.id });
      sent++;
    }
  }
  return { sent };
}

/* ---------- message variables ---------- */

function base(ctx: Ctx) {
  return { name: ctx.contact.firstName || "there", business: ctx.b.name, job: ctx.job.name, link: portalUrl(ctx.job.portalToken), phone: ctx.b.phone ?? "" };
}

async function eventVars(ctx: Ctx, e: ScheduleEvent) {
  const crew = (await crewFor([e.id])).get(e.id) ?? [];
  const tz = businessTz(ctx.b);
  const when = whenLabel(e, tz).replace(/, \d{1,2}:\d{2}.*$/, "");
  return { ...base(ctx), dates: when, arrival: arrivalText(ctx.b, e), crew: crew.length ? crewText(crew) : "our crew" };
}

/** For the Jobs view: which steps already went out for each job. */
export async function stepsSent(jobIds: string[]) {
  const map = new Map<string, { kind: string; channels: string | null; error: string | null; createdAt: Date }[]>();
  if (!jobIds.length) return map;
  const rows = await db.select({ jobId: jobUpdates.jobId, kind: jobUpdates.kind, channels: jobUpdates.channels, error: jobUpdates.error, createdAt: jobUpdates.createdAt }).from(jobUpdates).where(inArray(jobUpdates.jobId, jobIds)).orderBy(asc(jobUpdates.createdAt));
  for (const r of rows) map.set(r.jobId, [...(map.get(r.jobId) ?? []), r]);
  return map;
}
