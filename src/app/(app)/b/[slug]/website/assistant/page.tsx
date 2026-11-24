import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { updateAssistantSettings } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { assistantConfigured, transcript } from "@/lib/assistant";
import { Transcript } from "@/components/Transcript";
import { availableSlots, bookingSettings } from "@/lib/availability";
import { fmtDateTime } from "@/lib/format";
import { requireBusinessPage } from "@/lib/session";

const CHAT_STATUS = {
  booked: { label: "Booked", tone: "bg-green-500/15 text-green-700 dark:text-green-300" },
  handoff: { label: "Needs follow-up", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  open: { label: "Chat", tone: "bg-gray-500/15 text-muted" },
  closed: { label: "Closed", tone: "bg-gray-500/15 text-muted" },
} as const;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Canadian and US time zones (label, IANA name).
const ZONES: [string, string][] = [
  ["Canada – Pacific (Vancouver)", "America/Vancouver"],
  ["Canada – Mountain (Edmonton, Calgary)", "America/Edmonton"],
  ["Canada – Saskatchewan (Regina)", "America/Regina"],
  ["Canada – Central (Winnipeg)", "America/Winnipeg"],
  ["Canada – Eastern (Toronto, Ottawa, Montréal)", "America/Toronto"],
  ["Canada – Atlantic (Halifax)", "America/Halifax"],
  ["Canada – Newfoundland (St. John's)", "America/St_Johns"],
  ["US – Eastern", "America/New_York"],
  ["US – Central", "America/Chicago"],
  ["US – Mountain", "America/Denver"],
  ["US – Arizona", "America/Phoenix"],
  ["US – Pacific", "America/Los_Angeles"],
  ["US – Alaska", "America/Anchorage"],
  ["US – Hawaii", "Pacific/Honolulu"],
];

export default async function AssistantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business: b } = await requireBusinessPage(slug, "manage_business");
  const s = bookingSettings(b);
  const keySet = assistantConfigured();
  const [chats, preview] = await Promise.all([
    db.select().from(schema.chatConversations).where(eq(schema.chatConversations.businessId, b.id)).orderBy(desc(schema.chatConversations.updatedAt)).limit(30),
    availableSlots(b, { limit: 6 }),
  ]);
  const live = Boolean(b.assistant?.enabled && keySet && b.formEnabled);

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href={`/b/${b.slug}/website`} className="text-sm text-muted hover:text-ink">← Website</Link>
          <h1 className="text-xl font-semibold">AI assistant</h1>
          <p className="text-sm text-muted">A chat on your website that answers questions and books site visits{s.offerCalls ? " and calls" : ""} into your Schedule.</p>
        </div>
        <span className={`pill ${live ? "bg-green-500/15 text-green-700 dark:text-green-300" : "bg-gray-500/15 text-muted"}`}>{live ? "Live on website" : "Off"}</span>
      </div>

      {!keySet && (
        <div className="card border-amber-500/40 text-sm">
          <div className="card-title">Add an Anthropic API key to turn it on</div>
          <p className="text-muted">
            The assistant runs on Claude. Create a key at console.anthropic.com, then add it in Vercel to this Nucleus project as <code>ANTHROPIC_API_KEY</code> and redeploy.
            You can set everything else up now.
          </p>
        </div>
      )}
      {!b.formEnabled && <div className="card text-sm text-muted">Website requests are paused on the Website tab, so the assistant is hidden too.</div>}

      <ActionForm action={updateAssistantSettings.bind(null, b.slug)} submit="Save assistant settings" className="space-y-5">
        <section className="card space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="enabled" defaultChecked={b.assistant?.enabled ?? false} /> Show the assistant on this business&apos;s website
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="field">Time zone
              <select className="input" name="timezone" defaultValue={s.timezone}>
                {(ZONES.some(([, z]) => z === s.timezone) ? ZONES : [[s.timezone, s.timezone] as [string, string], ...ZONES]).map(([l, z]) => <option key={z} value={z}>{l}</option>)}
              </select>
            </label>
            <label className="field">Appointments start<input className="input" type="time" name="start" defaultValue={s.start} /></label>
            <label className="field">Last appointment ends by<input className="input" type="time" name="end" defaultValue={s.end} /></label>
          </div>
          <fieldset className="field">
            <legend className="mb-1">Days</legend>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((d, i) => (
                <label key={d} className="flex items-center gap-1.5 text-sm font-normal text-ink">
                  <input type="checkbox" name="days" value={i} defaultChecked={s.days.includes(i)} /> {d}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="field">Appointment length (min)<input className="input" type="number" name="slotMinutes" min={15} max={240} step={15} defaultValue={s.slotMinutes} /></label>
            <label className="field">Gap between (min)<input className="input" type="number" name="bufferMinutes" min={0} max={120} step={5} defaultValue={s.bufferMinutes} /></label>
            <label className="field">Book at least (hours ahead)<input className="input" type="number" name="minNoticeHours" min={0} max={168} defaultValue={s.minNoticeHours} /></label>
            <label className="field">Book up to (days ahead)<input className="input" type="number" name="daysAhead" min={1} max={60} defaultValue={s.daysAhead} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="offerCalls" defaultChecked={s.offerCalls} /> Also let customers book a phone call</label>
          <p className="text-xs text-muted">Times already on this business&apos;s Schedule are never offered, so the assistant can&apos;t double-book.</p>
        </section>

        <section className="card">
          <div className="card-title">What the assistant should know</div>
          <p className="mb-2 text-sm text-muted">
            It already knows everything on your website content (services, areas, hours, license, warranty, financing). Add anything else here:
            common questions, things you don&apos;t do, policies.
          </p>
          <textarea className="input" name="instructions" rows={6} defaultValue={b.assistant?.instructions ?? ""}
            placeholder={"Estimates are always free.\nWe don't do commercial jobs over 3 stories.\nMost interior jobs take 2–4 days.\nWe use Sherwin-Williams and Benjamin Moore paints."} />
        </section>
      </ActionForm>

      <section className="card">
        <div className="card-title">Next open times the assistant would offer</div>
        {preview.length ? (
          <ul className="flex flex-wrap gap-2 text-sm">{preview.map((p) => <li key={p.start} className="rounded-full border border-line px-3 py-1">{p.label}</li>)}</ul>
        ) : (
          <p className="text-sm text-muted">No open times in the booking window. Check the days and hours above.</p>
        )}
      </section>

      <section className="card">
        <div className="card-title">Recent chats</div>
        {chats.length === 0 ? (
          <p className="text-sm text-muted">No chats yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {chats.map((c) => {
              const lines = transcript(c.messages);
              const first = lines.find((l) => l.role === "customer")?.text ?? "";
              return (
                <li key={c.id} className="py-2">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className={`pill ${CHAT_STATUS[c.status].tone}`}>{CHAT_STATUS[c.status].label}</span>
                      <span className="min-w-0 flex-1 truncate">{first}</span>
                      {c.leadId && <Link className="text-xs text-accent hover:underline" href={`/b/${b.slug}/leads/${c.leadId}`}>View lead</Link>}
                      <span className="text-xs text-muted">{fmtDateTime(c.updatedAt)}</span>
                    </summary>
                    <Transcript lines={lines} />
                    {c.summary && <p className="mt-2 text-xs text-muted">Handoff note: {c.summary}</p>}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
