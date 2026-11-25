import type { Business, ScheduleEvent } from "@/db/schema";
import { bookingSettings, isValidTimezone, zonedToUtc } from "./availability";

/*
 * Times in the business's own time zone (the one set for the AI assistant's booking hours),
 * and iCalendar (.ics) files: emailed invites and each crew member's subscribable feed.
 */

export function businessTz(b: Pick<Business, "assistant">) {
  const tz = bookingSettings(b).timezone;
  return isValidTimezone(tz) ? tz : "America/Toronto";
}

function parts(at: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return { ymd: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}`, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}

/** Calendar date ("2026-12-01") of an instant in a time zone. */
export const localDay = (at: Date, tz: string) => parts(at, tz).ymd;
/** Wall-clock time ("08:00") of an instant in a time zone. */
export const localTime = (at: Date, tz: string) => parts(at, tz).hm;

export function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "2026-12-01" + "08:30" in a time zone -> the real instant. */
export function atLocal(ymd: string, hm: string, tz: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hm.split(":").map(Number);
  return zonedToUtc(y, m, d, hh, mm, tz);
}

/** Monday of the week containing `at` (offset in weeks), as a date string. */
export function weekStart(at: Date, tz: string, offsetWeeks = 0) {
  const { ymd, wd } = parts(at, tz);
  return addDays(ymd, -((wd + 6) % 7) + offsetWeeks * 7);
}

export const fmtTime = (d: Date, tz: string) => d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
export const fmtDay = (d: Date, tz: string) => d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
export const fmtYmd = (ymd: string, opts: Intl.DateTimeFormatOptions) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

/** Each working day of an event: one for a normal appointment, one per day for multi-day work. */
export function occurrences(e: Pick<ScheduleEvent, "startsAt" | "endsAt" | "days">, tz: string) {
  if (e.days <= 1) return [{ day: localDay(e.startsAt, tz), start: e.startsAt, end: e.endsAt }];
  const first = localDay(e.startsAt, tz);
  const from = localTime(e.startsAt, tz);
  const to = localTime(e.endsAt, tz);
  return Array.from({ length: e.days }, (_, k) => {
    const day = addDays(first, k);
    return { day, start: atLocal(day, from, tz), end: atLocal(day, to, tz) };
  });
}

/** "Tue, Dec 1, 8:00 AM – 4:00 PM" or "Tue, Dec 1 – Thu, Dec 3, 8:00 AM – 4:00 PM daily" */
export function whenLabel(e: Pick<ScheduleEvent, "startsAt" | "endsAt" | "days">, tz: string) {
  const occ = occurrences(e, tz);
  const first = occ[0];
  const hours = `${fmtTime(first.start, tz)} – ${fmtTime(first.end, tz)}`;
  if (occ.length === 1) {
    const sameDay = localDay(first.start, tz) === localDay(first.end, tz);
    return sameDay ? `${fmtDay(first.start, tz)}, ${hours}` : `${fmtDay(first.start, tz)} ${fmtTime(first.start, tz)} – ${fmtDay(first.end, tz)} ${fmtTime(first.end, tz)}`;
  }
  return `${fmtDay(first.start, tz)} – ${fmtDay(occ[occ.length - 1].start, tz)}, ${hours} daily (${occ.length} days)`;
}

/* ---------- iCalendar ---------- */

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Lines longer than 75 bytes are folded (RFC 5545), without splitting a character. */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export type IcsEvent = {
  uid: string;
  sequence: number;
  start: Date; // first day's start
  end: Date; // first day's end
  days: number;
  summary: string;
  location?: string | null;
  description?: string | null;
  cancelled?: boolean;
  organizer?: { name: string; email: string } | null;
  attendee?: { name: string; email: string } | null;
};

function vevent(e: IcsEvent) {
  return [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(e.start)}`,
    `DTEND:${stamp(e.end)}`,
    ...(e.days > 1 ? [`RRULE:FREQ=DAILY;COUNT=${e.days}`] : []),
    `SUMMARY:${esc(e.summary)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
    ...(e.organizer ? [`ORGANIZER;CN=${esc(e.organizer.name).replace(/:/g, "")}:mailto:${e.organizer.email}`] : []),
    ...(e.attendee ? [`ATTENDEE;CN=${esc(e.attendee.name).replace(/:/g, "")};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${e.attendee.email}`] : []),
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
  ];
}

/** A calendar file. method REQUEST/CANCEL for emailed invites; PUBLISH for subscribed feeds. */
export function icsCalendar(events: IcsEvent[], opts: { method: "REQUEST" | "CANCEL" | "PUBLISH"; name?: string }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nucleus//Crew schedule//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${opts.method}`,
    ...(opts.name ? [`X-WR-CALNAME:${esc(opts.name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"] : []),
    ...events.flatMap(vevent),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
