"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FormState } from "@/app/auth-actions";
import { requireBusiness } from "@/lib/session";
import { addDays, atLocal, businessTz } from "@/lib/calendar";
import { cancelCrewInvites, crewFor, crewFromForm, feedPath, saveCrew } from "@/lib/staff";
import { emailSettings, postmarkConfigured, postmarkSend } from "@/lib/email";
import { appBase } from "@/lib/twilio";
import { sendScheduled } from "@/lib/workflow";
import { advanceStartedJobs, syncJobDates } from "@/lib/jobs";

const { staffMembers, eventStaff, scheduleEvents, jobs } = schema;

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const refresh = (slug: string) => {
  revalidatePath(`/b/${slug}`, "layout");
  revalidatePath("/");
};

/* ---------- crew directory (owners and managers) ---------- */

export async function saveStaffMember(slug: string, staffId: string | null, _: FormState, form: FormData): Promise<FormState> {
  const { business: b } = await requireBusiness(slug, "manage_staff");
  const name = str(form, "name");
  if (!name) return { error: "Enter a name." };
  const email = str(form, "email")?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email address doesn't look right." };
  const color = /^#[0-9a-f]{6}$/i.test(str(form, "color") ?? "") ? (str(form, "color") as string) : "#2563eb";
  const values = {
    name: name.slice(0, 100),
    title: str(form, "title")?.slice(0, 60) ?? null,
    phone: str(form, "phone")?.slice(0, 40) ?? null,
    email,
    color,
    notes: str(form, "notes")?.slice(0, 1000) ?? null,
    sendInvites: form.get("sendInvites") === "on",
  };
  if (staffId) {
    const active = form.get("active") === "on";
    const [row] = await db.update(staffMembers).set({ ...values, active }).where(and(eq(staffMembers.id, staffId), eq(staffMembers.businessId, b.id))).returning({ id: staffMembers.id });
    if (!row) return { error: "Not found." };
  } else {
    await db.insert(staffMembers).values({ ...values, businessId: b.id });
  }
  refresh(slug);
  return { ok: staffId ? "Saved." : `${name} added.` };
}

/** Remove someone: they get cancellations for their upcoming work first. */
export async function removeStaffMember(slug: string, staffId: string) {
  const { business: b } = await requireBusiness(slug, "manage_staff");
  const upcoming = await db
    .select({ eventId: eventStaff.eventId })
    .from(eventStaff)
    .innerJoin(scheduleEvents, eq(scheduleEvents.id, eventStaff.eventId))
    .where(and(eq(eventStaff.staffId, staffId), eq(scheduleEvents.businessId, b.id), gt(scheduleEvents.endsAt, new Date())));
  const crews = await crewFor(upcoming.map((u) => u.eventId));
  for (const u of upcoming) {
    const rest = (crews.get(u.eventId) ?? []).filter((c) => c.staffId !== staffId).map((c) => ({ staffId: c.staffId, role: c.role }));
    await saveCrew(b, u.eventId, rest);
  }
  await db.delete(staffMembers).where(and(eq(staffMembers.id, staffId), eq(staffMembers.businessId, b.id)));
  refresh(slug);
}

/** A new private calendar link (the old one stops working), e.g. after someone leaves. */
export async function resetCalendarLink(slug: string, staffId: string) {
  const { business: b } = await requireBusiness(slug, "manage_staff");
  await db
    .update(staffMembers)
    .set({ calendarToken: sql`replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')` })
    .where(and(eq(staffMembers.id, staffId), eq(staffMembers.businessId, b.id)));
  refresh(slug);
}

export async function emailCalendarLink(slug: string, staffId: string, _: FormState, _form: FormData): Promise<FormState> {
  const { business: b } = await requireBusiness(slug, "manage_staff");
  const [s] = await db.select().from(staffMembers).where(and(eq(staffMembers.id, staffId), eq(staffMembers.businessId, b.id)));
  if (!s) return { error: "Not found." };
  if (!s.email) return { error: "Add their email address first." };
  if (!postmarkConfigured()) return { error: "Email isn't connected yet (POSTMARK_SERVER_TOKEN)." };
  const es = emailSettings(b);
  if (!es.fromAddress) return { error: "Set the business email address first (Inbox → Settings)." };
  const url = `${appBase(await headers())}${feedPath(s.calendarToken)}`;
  const webcal = url.replace(/^https?:/, "webcal:");
  const text = [
    `Hi ${s.name.split(" ")[0]},`,
    "",
    `Here's your ${b.name} work calendar. Add it once and every job you're scheduled for shows up in your calendar app, and stays up to date.`,
    "",
    `Google Calendar (on a computer): https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    `Outlook: https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent(b.name)}`,
    `iPhone / Mac: ${webcal}`,
    "",
    `Or add this address as a calendar subscription ("From URL") in any calendar app: ${url}`,
    "",
    "Keep this link to yourself: anyone with it can see your schedule.",
    "",
    b.name,
  ].join("\n");
  try {
    await postmarkSend({ from: `"${es.fromName.replace(/"/g, "")}" <${es.fromAddress}>`, to: s.email, replyTo: es.fromAddress, subject: `Your ${b.name} work calendar`, text });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't send." };
  }
  return { ok: `Sent to ${s.email}.` };
}

/* ---------- scheduling work with a crew (everyone with access to the business) ---------- */

export async function saveWork(slug: string, eventId: string | null, _: FormState, form: FormData): Promise<FormState> {
  const { business: b, user } = await requireBusiness(slug);
  const tz = businessTz(b);
  const date = str(form, "date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a date." };
  const from = str(form, "start") ?? "08:00";
  const to = str(form, "end") ?? "16:00";
  if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) return { error: "Times should look like 08:00." };
  const lastDay = str(form, "endDate") ?? date;
  const days = Math.round((Date.parse(`${lastDay}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 864e5) + 1;
  if (!Number.isFinite(days) || days < 1) return { error: "The last day can't be before the first day." };
  if (days > 90) return { error: "Schedule at most 90 days at a time." };
  const startsAt = atLocal(date, from, tz);
  const firstEnd = atLocal(date, to, tz);
  if (firstEnd <= startsAt) return { error: "The end time must be after the start time." };
  const endsAt = days > 1 ? atLocal(addDays(date, days - 1), to, tz) : firstEnd;

  const jobId = str(form, "jobId");
  let job: { name: string; contactId: string } | undefined;
  if (jobId) {
    [job] = await db.select({ name: jobs.name, contactId: jobs.contactId }).from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.businessId, b.id)));
    if (!job) return { error: "That job wasn't found." };
  }
  const title = (str(form, "title") ?? job?.name)?.slice(0, 200);
  if (!title) return { error: "Give the work a title, or pick a job." };
  const type = (str(form, "type") ?? "job_work") as (typeof schema.eventType.enumValues)[number];
  if (!schema.eventType.enumValues.includes(type)) return { error: "Unknown type." };
  const notes = str(form, "notes")?.slice(0, 2000) ?? null;

  let id = eventId;
  let timeChanged = false;
  let previousJobId: string | null = null;
  if (eventId) {
    const [old] = await db.select().from(scheduleEvents).where(and(eq(scheduleEvents.id, eventId), eq(scheduleEvents.businessId, b.id)));
    if (!old) return { error: "Not found." };
    previousJobId = old.jobId;
    timeChanged =
      old.startsAt.getTime() !== startsAt.getTime() || old.endsAt.getTime() !== endsAt.getTime() || old.days !== days ||
      old.title !== title || (old.notes ?? null) !== notes || (old.jobId ?? null) !== jobId;
    await db
      .update(scheduleEvents)
      .set({ title, type, jobId, contactId: job ? job.contactId : old.contactId, startsAt, endsAt, days, notes, ...(timeChanged ? { sequence: old.sequence + 1 } : {}) })
      .where(eq(scheduleEvents.id, eventId));
  } else {
    const [row] = await db
      .insert(scheduleEvents)
      .values({ businessId: b.id, jobId, contactId: job?.contactId ?? null, title, type, startsAt, endsAt, days, notes, createdById: user.id })
      .returning({ id: scheduleEvents.id });
    id = row.id;
  }
  const { sent, problems } = await saveCrew(b, id!, crewFromForm(form), { timeChanged });
  // The job's dates follow its schedule (and the job it was moved off, if any).
  await syncJobDates(b, jobId);
  if (previousJobId && previousJobId !== jobId) await syncJobDates(b, previousJobId);
  await advanceStartedJobs(b.id);
  // Customer workflow: tell the customer when we're coming (new work, or a changed time).
  let customer = "";
  if (jobId && (!eventId || timeChanged)) {
    const r = await sendScheduled(b, id!, { userId: user.id, changed: Boolean(eventId) }).catch((e) => (console.error("scheduled message:", e), null));
    if (r?.channels.length) customer = ` The customer was told by ${r.channels.join(" and ").replace("sms", "text")}.`;
  }
  refresh(slug);
  const invites = sent ? ` Calendar invite${sent === 1 ? "" : "s"} sent to ${sent} ${sent === 1 ? "person" : "people"}.` : "";
  const issues = problems.length ? ` Not sent: ${problems.join("; ")}.` : "";
  return { ok: `${eventId ? "Saved." : "Scheduled."}${invites}${issues}${customer}` };
}

/** Delete scheduled work; the crew get a cancellation that removes it from their calendars. */
export async function deleteWork(slug: string, eventId: string) {
  const { business: b } = await requireBusiness(slug);
  await cancelCrewInvites(b, eventId);
  const [gone] = await db.delete(scheduleEvents).where(and(eq(scheduleEvents.id, eventId), eq(scheduleEvents.businessId, b.id))).returning({ jobId: scheduleEvents.jobId });
  await syncJobDates(b, gone?.jobId);
  refresh(slug);
}
