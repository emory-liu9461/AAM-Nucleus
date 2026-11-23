import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AssistantSettings, Business } from "@/db/schema";

/*
 * Bookable time slots for site visits and calls, in the business's own time zone.
 * A slot is open when it's inside the booking hours, far enough ahead, and doesn't
 * overlap anything already on that business's schedule.
 */

export const DEFAULT_BOOKING: Required<Omit<AssistantSettings, "instructions" | "enabled">> = {
  timezone: "America/Chicago",
  days: [1, 2, 3, 4, 5], // Mon–Fri
  start: "09:00",
  end: "17:00",
  slotMinutes: 30,
  bufferMinutes: 0,
  minNoticeHours: 12,
  daysAhead: 14,
  offerCalls: true,
};

export function bookingSettings(b: Pick<Business, "assistant">) {
  const a = b.assistant ?? {};
  return {
    ...DEFAULT_BOOKING,
    ...Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== null && v !== "")),
  } as typeof DEFAULT_BOOKING & AssistantSettings;
}

/** Minutes east of UTC that a time zone is at a given instant (e.g. Chicago in winter = -360). */
function tzOffsetMinutes(tz: string, at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Wall-clock time in a time zone -> real instant. Handles daylight saving changes. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffsetMinutes(tz, new Date(guess)) * 60000;
  t = guess - tzOffsetMinutes(tz, new Date(t)) * 60000;
  return new Date(t);
}

/** The calendar date (y, m, d, weekday) in a time zone for an instant. */
function zonedDate(tz: string, at: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(at).map((x) => [x.type, x.value]),
  );
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: +p.year, m: +p.month, d: +p.day, wd };
}

export function slotLabel(start: Date, tz: string) {
  return start.toLocaleString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type Slot = { start: string; label: string };

/** Open slots, earliest first. `fromDate` (YYYY-MM-DD, business time) lets the customer ask for a later week. */
export async function availableSlots(b: Business, opts: { fromDate?: string | null; limit?: number; perDay?: number } = {}): Promise<Slot[]> {
  const s = bookingSettings(b);
  const tz = isValidTimezone(s.timezone) ? s.timezone : DEFAULT_BOOKING.timezone;
  const now = new Date();
  const earliest = new Date(now.getTime() + s.minNoticeHours * 3600e3);
  const horizon = new Date(now.getTime() + s.daysAhead * 864e5);
  const [sh, sm] = s.start.split(":").map(Number);
  const [eh, em] = s.end.split(":").map(Number);
  const step = Math.max(15, s.slotMinutes);

  let cursor = now;
  if (opts.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.fromDate)) {
    const [y, m, d] = opts.fromDate.split("-").map(Number);
    const from = zonedToUtc(y, m, d, 0, 0, tz);
    if (from > cursor) cursor = from;
  }

  const busy = await db
    .select({ s: schema.scheduleEvents.startsAt, e: schema.scheduleEvents.endsAt })
    .from(schema.scheduleEvents)
    .where(and(eq(schema.scheduleEvents.businessId, b.id), lt(schema.scheduleEvents.startsAt, horizon), gt(schema.scheduleEvents.endsAt, now)));
  const pad = s.bufferMinutes * 60000;
  const overlaps = (a: Date, z: Date) => busy.some((x) => a.getTime() < x.e.getTime() + pad && z.getTime() + pad > x.s.getTime());

  const out: Slot[] = [];
  const limit = opts.limit ?? 12;
  for (let i = 0; i < s.daysAhead + 1 && out.length < limit; i++) {
    const day = zonedDate(tz, new Date(cursor.getTime() + i * 864e5));
    if (!s.days.includes(day.wd)) continue;
    const dayEnd = zonedToUtc(day.y, day.m, day.d, eh, em, tz);
    let perDay = 0;
    for (let t = zonedToUtc(day.y, day.m, day.d, sh, sm, tz); t.getTime() + s.slotMinutes * 60000 <= dayEnd.getTime(); t = new Date(t.getTime() + step * 60000)) {
      const end = new Date(t.getTime() + s.slotMinutes * 60000);
      if (t < earliest || t > horizon || overlaps(t, end)) continue;
      out.push({ start: t.toISOString(), label: slotLabel(t, tz) });
      // Spread options across days instead of listing one day's every half hour.
      if (++perDay >= (opts.perDay ?? 4) || out.length >= limit) break;
    }
  }
  return out;
}

/** Re-check a single slot right before booking (another customer may have taken it). */
export async function slotIsOpen(b: Business, start: Date) {
  const s = bookingSettings(b);
  const end = new Date(start.getTime() + s.slotMinutes * 60000);
  const pad = s.bufferMinutes * 60000;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.scheduleEvents)
    .where(
      and(
        eq(schema.scheduleEvents.businessId, b.id),
        lt(schema.scheduleEvents.startsAt, new Date(end.getTime() + pad)),
        gt(schema.scheduleEvents.endsAt, new Date(start.getTime() - pad)),
      ),
    );
  if (Number(n) > 0) return false;
  // Must also be a slot we'd actually offer (inside hours, notice and horizon).
  const day = start.toISOString().slice(0, 10);
  const offered = await availableSlots(b, { fromDate: day, limit: 400, perDay: 400 });
  return offered.some((o) => o.start === start.toISOString());
}
