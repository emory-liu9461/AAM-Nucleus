import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmtDateTime } from "@/lib/format";
import { requireBusinessPage } from "@/lib/session";
import { prettyPhone } from "@/lib/twilio";

const TONE: Record<string, string> = {
  answered: "bg-green-500/15 text-green-700 dark:text-green-300",
  missed: "bg-red-500/15 text-red-700 dark:text-red-300",
  voicemail: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ringing: "bg-gray-500/15 text-muted",
};

export default async function CallsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business: b } = await requireBusinessPage(slug);
  const rows = await db
    .select({ call: schema.calls, contact: schema.contacts })
    .from(schema.calls)
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.calls.contactId))
    .where(eq(schema.calls.businessId, b.id))
    .orderBy(desc(schema.calls.createdAt))
    .limit(200);
  return (
    <section className="card overflow-x-auto p-0">
      <table className="tbl">
        <thead><tr><th>When</th><th>Caller</th><th>Result</th><th>Length</th><th>Voicemail</th><th>Text-back</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted">No calls yet.</td></tr>}
          {rows.map(({ call, contact }) => {
            const name = contact ? `${contact.firstName} ${contact.lastName}`.trim() : "";
            return (
              <tr key={call.id}>
                <td className="whitespace-nowrap text-muted">{fmtDateTime(call.createdAt)}</td>
                <td>
                  <div className="font-medium">{name && name !== prettyPhone(call.fromNumber) ? name : prettyPhone(call.fromNumber)}</div>
                  {name && name !== prettyPhone(call.fromNumber) && <div className="text-xs text-muted">{prettyPhone(call.fromNumber)}</div>}
                </td>
                <td><span className={`pill ${TONE[call.status]}`}>{call.status === "voicemail" ? "Voicemail" : call.status === "missed" ? "Missed" : call.status === "answered" ? "Answered" : "In progress"}</span></td>
                <td className="text-muted">{call.durationSec ? `${Math.floor(call.durationSec / 60)}:${String(call.durationSec % 60).padStart(2, "0")}` : "—"}</td>
                <td>{call.recordingUrl ? <audio controls preload="none" src={`/api/recordings/${call.id}`} className="h-8 w-56" /> : <span className="text-muted">—</span>}</td>
                <td className="text-muted">{call.textedBack ? <Link className="text-accent hover:underline" href={`/b/${b.slug}/inbox?ch=sms`}>Texted</Link> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
