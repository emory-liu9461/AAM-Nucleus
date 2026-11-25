import type { ScheduleEvent, StaffMember } from "@/db/schema";
import { saveWork } from "@/app/staff-actions";
import { ActionForm } from "@/components/ActionForm";
import { CREW_ROLES, CREW_ROWS, type CrewRow } from "@/lib/staff";
import { addDays, localDay, localTime } from "@/lib/calendar";
import { label } from "@/lib/format";
import { schema } from "@/db";

/** Schedule work (or edit it): what, when (one day or several), and who's on it in which role. */
export function WorkForm({
  slug,
  tz,
  jobs,
  staff,
  event,
  crew = [],
  defaultDate,
  defaultJobId,
}: {
  slug: string;
  tz: string;
  jobs: { id: string; name: string }[];
  staff: Pick<StaffMember, "id" | "name" | "title" | "active" | "email">[];
  event?: ScheduleEvent;
  crew?: CrewRow[];
  defaultDate?: string;
  defaultJobId?: string;
}) {
  const first = event ? localDay(event.startsAt, tz) : defaultDate;
  const rows = Math.max(CREW_ROWS, crew.length + 2);
  const people = staff.filter((s) => s.active || crew.some((c) => c.staffId === s.id));
  const id = event?.id ?? defaultJobId ?? "new";
  return (
    <ActionForm action={saveWork.bind(null, slug, event?.id ?? null)} submit={event ? "Save changes" : "Schedule and send invites"} pendingText="Saving and sending invites…" resetOnSuccess={!event} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="field lg:col-span-2">Job
        <select className="input" name="jobId" defaultValue={event?.jobId ?? defaultJobId ?? ""}>
          <option value="">No job (e.g. estimate, errand)</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
      </label>
      <label className="field lg:col-span-2">Title<input className="input" name="title" defaultValue={event?.title ?? ""} placeholder="Leave blank to use the job name, e.g. Exterior repaint – Oshawa" /></label>
      <label className="field">First day<input className="input" type="date" name="date" required defaultValue={first} /></label>
      <label className="field">Last day<input className="input" type="date" name="endDate" defaultValue={event && event.days > 1 ? addDays(first!, event.days - 1) : ""} />
        <span className="font-normal">Blank for one day</span>
      </label>
      <label className="field">Start time<input className="input" type="time" name="start" defaultValue={event ? localTime(event.startsAt, tz) : "08:00"} /></label>
      <label className="field">End time<input className="input" type="time" name="end" defaultValue={event ? localTime(event.endsAt, tz) : "16:00"} />
        <span className="font-normal">Same hours each day</span>
      </label>
      <label className="field">Type
        <select className="input" name="type" defaultValue={event?.type ?? "job_work"}>
          {schema.eventType.enumValues.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
      </label>
      <label className="field sm:col-span-1 lg:col-span-3">Notes for the crew<input className="input" name="notes" defaultValue={event?.notes ?? ""} placeholder="Gate code, materials to pick up, parking…" /></label>

      <fieldset className="sm:col-span-2 lg:col-span-4">
        <legend className="mb-1 text-sm font-medium">Crew and their role on this job</legend>
        {people.length === 0 ? (
          <p className="text-sm text-muted">Add crew members on the Staff tab first.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex gap-2">
                <select className="input min-w-0 flex-1" name={`crew_${i}_staff`} defaultValue={crew[i]?.staffId ?? ""} aria-label={`Crew member ${i + 1}`}>
                  <option value="">—</option>
                  {people.map((s) => <option key={s.id} value={s.id}>{s.name}{s.title ? ` (${s.title})` : ""}{s.email ? "" : " – no email"}</option>)}
                </select>
                <input className="input w-32 shrink-0" name={`crew_${i}_role`} list={`roles-${id}`} defaultValue={crew[i]?.role ?? ""} placeholder="Role" aria-label={`Role ${i + 1}`} />
              </div>
            ))}
          </div>
        )}
        <datalist id={`roles-${id}`}>{CREW_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
        <p className="mt-1 text-xs text-muted">Role blank = their usual title. Everyone with an email gets a calendar invite; changes send an update, and removing someone sends a cancellation.</p>
      </fieldset>
    </ActionForm>
  );
}
