import { sendTestAlert, setBusinessArchived, updateAlertSettings, updateBusiness, updateReviewSettings, updateTaxSettings } from "@/app/actions";
import { BusinessFields } from "@/components/BusinessForm";
import { ActionForm } from "@/components/ActionForm";
import { ALERT_KINDS, alertSettings } from "@/lib/alerts";
import { DEFAULT_REVIEW_MESSAGE, reviewSettings } from "@/lib/reviews";
import { requireBusinessPage } from "@/lib/session";
import { prettyPhone } from "@/lib/twilio";

// Common sales tax on contractor services by province (combined rate). Confirm with your accountant.
const TAX_PRESETS: [string, string][] = [
  ["HST|13", "Ontario: HST 13%"],
  ["HST|15", "New Brunswick, Newfoundland & Labrador, PEI: HST 15%"],
  ["HST|14", "Nova Scotia: HST 14%"],
  ["GST|5", "Alberta, BC*, Saskatchewan*, Manitoba*, territories: GST 5%"],
  ["GST + QST|14.975", "Quebec: GST 5% + QST 9.975%"],
  ["GST + PST|12", "BC with PST 7% (only if PST applies to your work)"],
  ["GST + PST|11", "Saskatchewan with PST 6% (only if PST applies)"],
  ["GST + RST|12", "Manitoba with RST 7% (only if RST applies)"],
  ["custom", "Custom (enter below)"],
];

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business: b } = await requireBusinessPage(slug, "manage_business");
  const alerts = await alertSettings(b);
  const reviews = reviewSettings(b);
  const presetValue = b.taxLabel && b.taxRate ? `${b.taxLabel}|${Number(b.taxRate)}` : "";
  const preset = TAX_PRESETS.some(([v]) => v === presetValue) ? presetValue : b.taxRate ? "custom" : "";

  return (
    <div className="max-w-2xl space-y-6">
      <ActionForm action={updateBusiness.bind(null, b.slug)} submit="Save changes" className="card grid gap-3 sm:grid-cols-2">
        <p className="rounded-lg bg-bg p-3 text-xs text-muted sm:col-span-2">
          Name, phone, email, brand color and trade are used on this business&apos;s website too. Saved changes appear there within about a minute.
        </p>
        <BusinessFields business={b} />
      </ActionForm>

      <section className="card space-y-3">
        <div>
          <div className="card-title mb-1">Alerts</div>
          <p className="text-sm text-muted">Get a text and an email the moment something needs you. Answering a new lead within minutes is one of the biggest factors in winning the job.</p>
        </div>
        <ActionForm action={updateAlertSettings.bind(null, b.slug)} submit="Save alerts" className="grid gap-3 sm:grid-cols-2">
          <label className="field">Text these phones (one per line)
            <textarea className="input" name="phones" rows={2} defaultValue={alerts.phones.map(prettyPhone).join("\n")} placeholder="(613) 555-0199" />
            <span className="font-normal">Sent from this business&apos;s Twilio number.</span>
          </label>
          <label className="field">Email these addresses (one per line)
            <textarea className="input" name="emails" rows={2} defaultValue={alerts.emails.join("\n")} />
            <span className="font-normal">Starts with the business owners&apos; logins.</span>
          </label>
          <fieldset className="space-y-1.5 text-sm sm:col-span-2">
            {ALERT_KINDS.map(([k, text]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" name={k} defaultChecked={alerts[k]} /> {text}</label>
            ))}
          </fieldset>
        </ActionForm>
        <ActionForm action={sendTestAlert.bind(null, b.slug)} submit="Send test alert" pendingText="Sending…" className="flex flex-wrap items-center gap-2"><span /></ActionForm>
      </section>

      <section className="card space-y-3">
        <div>
          <div className="card-title mb-1">Review requests</div>
          <p className="text-sm text-muted">When a job is marked <strong>Completed</strong>, the customer gets your review link by text and email, plus one reminder if they don&apos;t open it. You can also send one from any completed job.</p>
        </div>
        <ActionForm action={updateReviewSettings.bind(null, b.slug)} submit="Save review requests" className="grid gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" defaultChecked={reviews.enabled} /> Ask for a review automatically when a job is completed</label>
          <label className="field">Review link
            <input className="input" name="link" defaultValue={reviews.link} placeholder="https://g.page/r/XXXXXXXX/review" />
            <span className="font-normal">Google: in your Business Profile, choose &ldquo;Ask for reviews&rdquo; and copy the link. Or use your HomeStars review page.</span>
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="sms" defaultChecked={reviews.sms} /> Send by text</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="email" defaultChecked={reviews.email} /> Send by email</label>
            <label className="flex items-center gap-2">Reminder after <input className="input w-16 py-1" name="reminderDays" type="number" min={0} max={30} defaultValue={reviews.reminderDays} /> days (0 = none)</label>
          </div>
          <label className="field">Message ({"{name}"}, {"{business}"} and {"{link}"} are filled in)
            <textarea className="input" name="message" rows={3} maxLength={400} defaultValue={b.reviewSettings?.message ?? ""} placeholder={DEFAULT_REVIEW_MESSAGE} />
            <span className="font-normal">Texts end with &ldquo;Reply STOP to opt out.&rdquo; Customers who opted out aren&apos;t texted.</span>
          </label>
        </ActionForm>
      </section>

      <section className="card space-y-3">
        <div>
          <div className="card-title mb-1">Sales tax</div>
          <p className="text-sm text-muted">Added to new invoices. Amounts are shown in Canadian dollars. Confirm the right tax for your work with your accountant.</p>
        </div>
        <ActionForm action={updateTaxSettings.bind(null, b.slug)} submit="Save tax" className="grid gap-3 sm:grid-cols-3">
          <label className="field sm:col-span-3">Province
            <select className="input" name="preset" defaultValue={preset}>
              <option value="">No tax</option>
              {TAX_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field">Tax name (custom)<input className="input" name="taxLabel" defaultValue={b.taxLabel ?? ""} placeholder="HST" /></label>
          <label className="field">Rate % (custom)<input className="input" name="taxRate" inputMode="decimal" defaultValue={b.taxRate ?? ""} placeholder="13" /></label>
        </ActionForm>
      </section>

      <div className="card">
        <div className="card-title">{b.archived ? "Restore business" : "Archive business"}</div>
        <p className="mb-3 text-sm text-muted">
          {b.archived
            ? "Bring this business back into the sidebar and combined dashboard."
            : "Hides this business from the sidebar and combined totals. Its data is kept."}
        </p>
        <form action={setBusinessArchived.bind(null, b.slug, !b.archived)}>
          <button className="btn-ghost">{b.archived ? "Restore" : "Archive"}</button>
        </form>
      </div>
    </div>
  );
}
