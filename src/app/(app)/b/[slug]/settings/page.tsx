import { sendTestAlert, setBusinessArchived, updateAlertSettings, updateBusiness, updateReviewSettings, updateTaxSettings } from "@/app/actions";
import { BusinessFields } from "@/components/BusinessForm";
import { ActionForm } from "@/components/ActionForm";
import { ALERT_KINDS, alertSettings } from "@/lib/alerts";
import { DEFAULT_REVIEW_MESSAGE, reviewSettings } from "@/lib/reviews";
import { requireBusinessPage } from "@/lib/session";
import { appBase, prettyPhone } from "@/lib/twilio";
import { headers } from "next/headers";
import { disconnectStripe, savePaymentSettings } from "@/app/payment-actions";
import { CopyField } from "@/components/CopyField";
import { stripeKey, stripeWebhookSecret } from "@/lib/stripe";

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
  const ps = b.paymentSettings ?? {};
  const key = stripeKey(b);
  const hookUrl = `${appBase(await headers())}/api/stripe/webhook/${b.id}`;

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

      <section className="card space-y-3" id="payments">
        <div>
          <div className="card-title mb-1">Online payments</div>
          <p className="text-sm text-muted">Every invoice gets a payment page for the customer. Connect this business&apos;s own Stripe account to take cards (money goes straight to that account, minus Stripe&apos;s fee), and add e-Transfer details.</p>
        </div>
        <div className={`rounded-lg p-3 text-sm ${key ? "bg-good/10" : "bg-bg"}`}>
          {key ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>✓ Card payments on: Stripe account <strong>{ps.stripeAccount}</strong>{key.includes("_test_") ? " (test mode)" : ""}{stripeWebhookSecret(b) ? "" : " · add the webhook secret below so payments always get recorded"}</span>
              <form action={disconnectStripe.bind(null, b.slug)}><button className="text-xs text-muted hover:text-bad">Disconnect</button></form>
            </div>
          ) : (
            <span>Card payments are off. Customers can still see their invoice and your e-Transfer details.</span>
          )}
        </div>
        <ActionForm action={savePaymentSettings.bind(null, b.slug)} submit="Save payments" className="grid gap-3 sm:grid-cols-2">
          <label className="field sm:col-span-2">Stripe secret key
            <input className="input font-mono" name="stripeKey" type="password" autoComplete="off" placeholder={key ? "Saved. Paste a new key to replace it." : "sk_live_…"} />
            <span className="font-normal">Stripe Dashboard → Developers → API keys → Secret key (or a restricted key with Checkout Sessions write access). It&apos;s stored encrypted and never shown again.</span>
          </label>
          <div className="field sm:col-span-2">Webhook address (add in Stripe)
            <CopyField value={hookUrl} />
            <span className="font-normal">Stripe Dashboard → Developers → Webhooks → Add endpoint: paste this address and choose the events <code>checkout.session.completed</code> and <code>checkout.session.async_payment_succeeded</code>. Then copy its signing secret below.</span>
          </div>
          <label className="field sm:col-span-2">Webhook signing secret
            <input className="input font-mono" name="stripeWebhookSecret" type="password" autoComplete="off" placeholder={stripeWebhookSecret(b) ? "Saved. Paste a new one to replace it." : "whsec_…"} />
          </label>
          <label className="field">e-Transfer email<input className="input" name="etransferEmail" type="email" defaultValue={ps.etransferEmail ?? ""} placeholder="payments@yourcompany.ca" /></label>
          <label className="field">e-Transfer note (optional)<input className="input" name="etransferNote" defaultValue={ps.etransferNote ?? ""} placeholder="Autodeposit is on, no security question needed." /></label>
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
