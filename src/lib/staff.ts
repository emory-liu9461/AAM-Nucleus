import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business, ScheduleEvent, StaffMember } from "@/db/schema";
import { businessTz, icsCalendar, occurrences, whenLabel, type IcsEvent } from "./calendar";
import { emailSettings, postmarkConfigured, postmarkSend } from "./email";

/*
 * Crew on scheduled work. Assigning someone (with their role on that job) emails them a
 * calendar invite that drops the work into Gmail, Outlook or Apple Calendar; changing the
 * time sends an update, and removing them or the work sends a cancellation. Each person
 * also has a private calendar feed URL that shows everything they're assigned to.
 */

const { staffMembers, eventStaff, scheduleEvents, jobs, contacts } = schema;

/** Suggested roles; any text is allowed. */
export const CREW_ROLES = ["Crew lead", "Driver", "Painter", "Cleaner", "Roofer", "Carpenter", "Labourer", "Helper", "Estimator", "Supervisor"];
export const CREW_ROWS = 6;

export type CrewPick = { staffId: string; role: string | null };
export type CrewRow = { eventId: string; staffId: string; name: string; color: string; email: string | null; role: string | null; invitedAt: Date | null; inviteError: string | null };

const appUrl = () => process.env.APP_URL?.replace(/\/$/, "") ?? "";
export const feedPath = (token: string) => `/api/public/calendar/${token}.ics`;

/** Crew rows from a form: crew_0_staff / crew_0_role … (blank rows ignored, one row per person). */
export function crewFromForm(form: FormData): CrewPick[] {
  const seen = new Set<string>();
  const out: CrewPick[] = [];
  for (let i = 0; i < 20; i++) {
    const id = form.get(`crew_${i}_staff`);
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    const role = form.get(`crew_${i}_role`);
    out.push({ staffId: id, role: typeof role === "string" && role.trim() ? role.trim().slice(0, 60) : null });
  }
  return out;
}

export async function crewFor(eventIds: string[]): Promise<Map<string, CrewRow[]>> {
  const map = new Map<string, CrewRow[]>();
  if (!eventIds.length) return map;
  const rows = await db
    .select({ eventId: eventStaff.eventId, staffId: eventStaff.staffId, role: eventStaff.role, invitedAt: eventStaff.invitedAt, inviteError: eventStaff.inviteError, name: staffMembers.name, color: staffMembers.color, email: staffMembers.email })
    .from(eventStaff)
    .innerJoin(staffMembers, eq(staffMembers.id, eventStaff.staffId))
    .where(inArray(eventStaff.eventId, eventIds))
    .orderBy(staffMembers.name);
  for (const r of rows) map.set(r.eventId, [...(map.get(r.eventId) ?? []), r]);
  return map;
}

/** Where the work is and what the crew needs to know (customer, phone, notes, who else is on it). */
async function eventInfo(e: ScheduleEvent) {
  const [job] = e.jobId ? await db.select({ name: jobs.name, address: jobs.address }).from(jobs).where(eq(jobs.id, e.jobId)) : [];
  const [c] = e.contactId
    ? await db.select({ firstName: contacts.firstName, lastName: contacts.lastName, phone: contacts.phone, address: contacts.address, city: contacts.city }).from(contacts).where(eq(contacts.id, e.contactId))
    : [];
  const location = job?.address || [c?.address, c?.city].filter(Boolean).join(", ") || null;
  const customer = c ? `${c.firstName} ${c.lastName}`.trim() : "";
  return { location, lines: [job && job.name !== e.title ? `Job: ${job.name}` : "", customer ? `Customer: ${customer}${c?.phone ? `, ${c.phone}` : ""}` : "", e.notes ? `Notes: ${e.notes}` : ""].filter(Boolean) };
}

function icsFor(b: Business, e: ScheduleEvent, staff: Pick<StaffMember, "name" | "email">, role: string | null, info: Awaited<ReturnType<typeof eventInfo>>, crew: CrewRow[], cancelled = false): IcsEvent {
  const tz = businessTz(b);
  const first = occurrences(e, tz)[0];
  const host = (appUrl() || "https://nucleus.local").replace(/^https?:\/\//, "");
  const others = crew.filter((c) => c.email !== staff.email).map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`);
  const s = emailSettings(b);
  return {
    uid: `${e.id}@${host}`,
    sequence: e.sequence,
    start: first.start,
    end: first.end,
    days: e.days,
    summary: `${e.title}${role ? ` – ${role}` : ""}`,
    location: info.location,
    description: [role ? `Your role: ${role}` : "", ...info.lines, others.length ? `Also on this job: ${others.join(", ")}` : "", `${b.name}${b.phone ? ` · ${b.phone}` : ""}`].filter(Boolean).join("\n"),
    cancelled,
    organizer: s.fromAddress ? { name: b.name, email: s.fromAddress } : null,
    attendee: staff.email ? { name: staff.name, email: staff.email } : null,
  };
}

/** Email one person their invite (or cancellation). Returns an error message, or null when sent. */
async function sendInvite(b: Business, e: ScheduleEvent, staff: StaffMember, role: string | null, crew: CrewRow[], kind: "new" | "update" | "cancel", info: Awaited<ReturnType<typeof eventInfo>>) {
  if (!staff.email) return "No email address";
  if (!staff.sendInvites || !staff.active) return "Invites are off for this person";
  if (!postmarkConfigured()) return "Email isn't connected (POSTMARK_SERVER_TOKEN)";
  const s = emailSettings(b);
  if (!s.fromAddress) return "Set the business email address first (Inbox → Settings)";
  const tz = businessTz(b);
  const method = kind === "cancel" ? "CANCEL" : "REQUEST";
  const ics = icsCalendar([icsFor(b, e, staff, role, info, crew, kind === "cancel")], { method });
  const when = whenLabel(e, tz);
  const verb = kind === "new" ? "Scheduled" : kind === "update" ? "Updated" : "Cancelled";
  const feed = appUrl() ? `${appUrl()}${feedPath(staff.calendarToken)}` : "";
  const text = [
    `Hi ${staff.name.split(" ")[0]},`,
    "",
    kind === "cancel" ? `This work has been cancelled or you've been taken off it:` : kind === "update" ? "This work has changed:" : "You've been scheduled for:",
    "",
    e.title,
    `When: ${when}`,
    ...(role ? [`Your role: ${role}`] : []),
    ...(info.location ? [`Where: ${info.location}`] : []),
    ...info.lines,
    "",
    kind === "cancel" ? "It has been removed from your calendar." : "Open the attached invite to add it to your calendar (Gmail and Outlook usually add it automatically).",
    ...(feed ? ["", `Your full schedule, always up to date: ${feed}`] : []),
    "",
    b.name,
  ].join("\n");
  try {
    await postmarkSend({
      from: `"${s.fromName.replace(/"/g, "")}" <${s.fromAddress}>`,
      to: staff.email,
      replyTo: s.fromAddress,
      subject: `${verb}: ${e.title}${role ? ` (${role})` : ""} – ${when}`,
      text,
      headers: [{ Name: "Auto-Submitted", Value: "auto-generated" }],
      attachments: [{ Name: kind === "cancel" ? "cancel.ics" : "invite.ics", Content: Buffer.from(ics).toString("base64"), ContentType: `text/calendar; method=${method}; charset=UTF-8` }],
    });
    return null;
  } catch (err) {
    console.error("crew invite failed", err);
    return err instanceof Error ? err.message.slice(0, 200) : "Send failed";
  }
}

/**
 * Set who's on a piece of work. New people get an invite, removed people get a cancellation,
 * and when the time or details changed (timeChanged) everyone else gets an update.
 */
export async function saveCrew(b: Business, eventId: string, picks: CrewPick[], opts: { timeChanged?: boolean } = {}) {
  const [e] = await db.select().from(scheduleEvents).where(and(eq(scheduleEvents.id, eventId), eq(scheduleEvents.businessId, b.id)));
  if (!e) throw new Error("Not found");
  const valid = picks.length
    ? await db.select().from(staffMembers).where(and(eq(staffMembers.businessId, b.id), inArray(staffMembers.id, picks.map((p) => p.staffId))))
    : [];
  const byId = new Map(valid.map((s) => [s.id, s]));
  // No role given: use the person's usual title (e.g. "Painter").
  const next = picks.filter((p) => byId.has(p.staffId)).map((p) => ({ ...p, role: p.role ?? byId.get(p.staffId)!.title ?? null }));
  const before = (await crewFor([eventId])).get(eventId) ?? [];
  const removed = before.filter((r) => !next.some((p) => p.staffId === r.staffId));
  const roleChanged = new Set(next.filter((p) => before.some((r) => r.staffId === p.staffId && (r.role ?? null) !== p.role)).map((p) => p.staffId));
  const added = next.filter((p) => !before.some((r) => r.staffId === p.staffId));

  const info = await eventInfo(e);
  // Cancellations first, while the removed people are still on record.
  if (removed.length) {
    const removedStaff = await db.select().from(staffMembers).where(inArray(staffMembers.id, removed.map((r) => r.staffId)));
    for (const s of removedStaff) await sendInvite(b, e, s, removed.find((r) => r.staffId === s.id)?.role ?? null, [], "cancel", info);
    await db.delete(eventStaff).where(and(eq(eventStaff.eventId, eventId), inArray(eventStaff.staffId, removed.map((r) => r.staffId))));
  }
  for (const p of next) {
    if (added.some((a) => a.staffId === p.staffId)) await db.insert(eventStaff).values({ eventId, staffId: p.staffId, role: p.role });
    else if (roleChanged.has(p.staffId)) await db.update(eventStaff).set({ role: p.role }).where(and(eq(eventStaff.eventId, eventId), eq(eventStaff.staffId, p.staffId)));
  }

  const crew = (await crewFor([eventId])).get(eventId) ?? [];
  let sent = 0;
  const problems: string[] = [];
  for (const p of next) {
    const isNew = added.some((a) => a.staffId === p.staffId);
    if (!isNew && !opts.timeChanged && !roleChanged.has(p.staffId)) continue;
    const s = byId.get(p.staffId)!;
    const err = await sendInvite(b, e, s, p.role, crew, isNew ? "new" : "update", info);
    await db.update(eventStaff).set(err ? { inviteError: err } : { invitedAt: new Date(), inviteError: null }).where(and(eq(eventStaff.eventId, eventId), eq(eventStaff.staffId, p.staffId)));
    if (err) problems.push(`${s.name}: ${err}`);
    else sent++;
  }
  return { sent, problems };
}

/** Before work is deleted: tell everyone on it that it's cancelled. */
export async function cancelCrewInvites(b: Business, eventId: string) {
  const [e] = await db.select().from(scheduleEvents).where(and(eq(scheduleEvents.id, eventId), eq(scheduleEvents.businessId, b.id)));
  if (!e) return;
  const rows = await db.select({ s: staffMembers, role: eventStaff.role }).from(eventStaff).innerJoin(staffMembers, eq(staffMembers.id, eventStaff.staffId)).where(eq(eventStaff.eventId, eventId));
  if (!rows.length) return;
  const info = await eventInfo(e);
  const cancelled = { ...e, sequence: e.sequence + 1 };
  for (const r of rows) await sendInvite(b, cancelled, r.s, r.role, [], "cancel", info);
}

/** One person's calendar feed: their work from 60 days ago to a year ahead. */
export async function staffFeed(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const [s] = await db.select().from(staffMembers).where(eq(staffMembers.calendarToken, token));
  if (!s || !s.active) return null;
  const [b] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, s.businessId));
  if (!b) return null;
  const rows = await db
    .select({ e: scheduleEvents, role: eventStaff.role })
    .from(eventStaff)
    .innerJoin(scheduleEvents, eq(scheduleEvents.id, eventStaff.eventId))
    .where(eq(eventStaff.staffId, s.id));
  const from = Date.now() - 60 * 864e5;
  const to = Date.now() + 366 * 864e5;
  const list = rows.filter((r) => r.e.endsAt.getTime() > from && r.e.startsAt.getTime() < to);
  const crews = await crewFor(list.map((r) => r.e.id));
  const events: IcsEvent[] = [];
  for (const r of list) {
    const info = await eventInfo(r.e);
    events.push({ ...icsFor(b, r.e, s, r.role, info, crews.get(r.e.id) ?? []), organizer: null, attendee: null });
  }
  return icsCalendar(events, { method: "PUBLISH", name: `${b.name} – ${s.name}` });
}
