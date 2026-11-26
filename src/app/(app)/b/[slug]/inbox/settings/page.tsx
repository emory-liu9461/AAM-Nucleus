import { headers } from "next/headers";
import { updateEmailSettings, updatePhoneSettings } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { CopyField } from "@/components/CopyField";
import { assistantConfigured } from "@/lib/assistant";
import { emailSettings, postmarkConfigured } from "@/lib/email";
import { requireBusinessPage } from "@/lib/session";
import { DEFAULT_PHONE, phoneSettings } from "@/lib/sms";
import { appBase, prettyPhone, twilioConfigured } from "@/lib/twilio";

function Status({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`pill ${ok ? "bg-green-500/15 text-green-700 dark:text-green-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>{ok ? "✓" : "!"} {label}</span>;
}

export default async function InboxSettings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business: b } = await requireBusinessPage(slug, "manage_business");
  const base = appBase(await headers());
  const p = phoneSettings(b);
  const e = emailSettings(b);
  const inboundToken = process.env.POSTMARK_INBOUND_TOKEN;

  return (
    <div className="max-w-4xl space-y-6">
      <section className="card space-y-3">
        <div className="card-title">Connections</div>
        <div className="flex flex-wrap gap-2">
          <Status ok={twilioConfigured()} label="Twilio (calls & texts)" />
          <Status ok={postmarkConfigured() && Boolean(inboundToken)} label="Postmark (email)" />
          <Status ok={assistantConfigured()} label="AI replies (Anthropic)" />
          <Status ok={Boolean(process.env.APP_URL)} label="APP_URL set" />
        </div>
        <p className="text-xs text-muted">
          These are set in Vercel → aam-nucleus → Settings → Environment Variables: <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code>,{" "}
          <code>POSTMARK_SERVER_TOKEN</code>, <code>POSTMARK_INBOUND_TOKEN</code>, <code>ANTHROPIC_API_KEY</code>, and <code>APP_URL</code> (your Nucleus address, e.g. https://app.yourcompany.com).
          The website chat is set up separately under Social → AI assistant.
        </p>
      </section>

      <section className="card space-y-4">
        <div>
          <div className="card-title mb-1">Phone: calls and texts (Twilio)</div>
          <p className="text-sm text-muted">Customers call or text this business&apos;s Twilio number. Calls ring your phones; texts land in the Inbox and the AI can reply.</p>
        </div>
        <ActionForm action={updatePhoneSettings.bind(null, b.slug)} submit="Save phone settings" className="grid gap-3 sm:grid-cols-2">
          <label className="field">Twilio number for this business
            <input className="input" name="number" defaultValue={p.number ? prettyPhone(p.number) : ""} placeholder="(555) 123-4567" />
          </label>
          <label className="field">Ring for (seconds) before voicemail
            <input className="input" type="number" name="ringSeconds" min={10} max={60} defaultValue={p.ringSeconds} />
          </label>
          <label className="field sm:col-span-2">Phones that ring for incoming calls (one per line; they ring at the same time)
            <textarea className="input" name="forwardTo" rows={2} defaultValue={p.forwardTo.map(prettyPhone).join("\n")} placeholder={"(555) 222-3333  ← your cell\n(555) 444-5555  ← office manager"} />
          </label>
          <div className="space-y-2 text-sm sm:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" name="whisper" defaultChecked={p.whisper} /> Say &ldquo;Call for {b.name}&rdquo; when you answer</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="voicemail" defaultChecked={p.voicemail} /> Take a voicemail when nobody answers</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="missedCallTextBack" defaultChecked={p.missedCallTextBack} /> Text missed callers automatically</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="smsAssistant" defaultChecked={p.smsAssistant} /> AI replies to texts and WhatsApp messages (answers questions, books site visits)</label>
          </div>
          <fieldset className="space-y-2 rounded-lg border border-line p-3 text-sm sm:col-span-2">
            <legend className="px-1 font-medium">WhatsApp</legend>
            <label className="flex items-center gap-2"><input type="checkbox" name="whatsapp" defaultChecked={Boolean(b.phoneSettings?.whatsapp)} /> Customers can message this business on WhatsApp</label>
            <label className="field">WhatsApp number (leave blank if it&apos;s the Twilio number above)
              <input className="input" name="whatsappNumber" defaultValue={b.phoneSettings?.whatsappNumber ? prettyPhone(b.phoneSettings.whatsappNumber) : ""} placeholder="Same as the Twilio number" />
            </label>
            <p className="text-xs text-muted">
              Turn this on after Twilio approves your WhatsApp sender (Twilio Console → Messaging → Senders → WhatsApp senders; it uses your Meta Business account and usually takes a few days).
              In the sender&apos;s settings, set <strong>Webhook URL for incoming messages</strong> to the same address as texts: <span className="font-mono">{`${base}/api/twilio/sms`}</span>.
              WhatsApp lets you reply freely within 24 hours of the customer&apos;s last message; after that, text or call them.
            </p>
          </fieldset>
          <label className="field sm:col-span-2">Missed-call text ({"{business}"} becomes the business name)
            <textarea className="input" name="missedCallMessage" rows={2} maxLength={320} defaultValue={b.phoneSettings?.missedCallMessage ?? ""} placeholder={DEFAULT_PHONE.missedCallMessage} />
          </label>
        </ActionForm>
        <details className="text-sm" open={!p.number}>
          <summary className="cursor-pointer font-medium">How to connect Twilio</summary>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-muted">
            <li>In the Twilio Console, buy a local number for this business (Phone Numbers → Buy a number), and enter it above.</li>
            <li>Register for business texting (Messaging → Regulatory compliance → A2P 10DLC). US carriers block texts from unregistered numbers; approval can take a few days.</li>
            <li>
              Open the number&apos;s settings. Under <strong>Voice → A call comes in</strong>, choose Webhook, HTTP POST, and paste:
              <div className="mt-1"><CopyField value={`${base}/api/twilio/voice`} /></div>
            </li>
            <li>
              Under <strong>Messaging → A message comes in</strong>, choose Webhook, HTTP POST, and paste:
              <div className="mt-1"><CopyField value={`${base}/api/twilio/sms`} /></div>
            </li>
            <li>Copy your Account SID and Auth Token (Console home) into Vercel as <code>TWILIO_ACCOUNT_SID</code> and <code>TWILIO_AUTH_TOKEN</code>, set <code>APP_URL</code>, and redeploy.</li>
          </ol>
          <p className="mt-2 text-xs text-muted">The same two addresses work for every business. Nucleus tells them apart by the number that was called or texted.</p>
        </details>
      </section>

      <section className="card space-y-4">
        <div>
          <div className="card-title mb-1">Email (Postmark)</div>
          <p className="text-sm text-muted">Emails to this address land in the Inbox, and the AI can reply in the same thread.</p>
        </div>
        <ActionForm action={updateEmailSettings.bind(null, b.slug)} submit="Save email settings" className="grid gap-3 sm:grid-cols-2">
          <label className="field">Address customers email
            <input className="input" name="inboundAddress" type="email" defaultValue={b.emailSettings?.inboundAddress ?? ""} placeholder={b.email ?? "hello@yourcompany.com"} />
          </label>
          <label className="field">Send replies from
            <input className="input" name="fromAddress" type="email" defaultValue={b.emailSettings?.fromAddress ?? ""} placeholder={e.fromAddress ?? "hello@yourcompany.com"} />
          </label>
          <label className="field">Sender name<input className="input" name="fromName" defaultValue={b.emailSettings?.fromName ?? ""} placeholder={b.name} /></label>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="aiReplies" defaultChecked={e.aiReplies} /> AI replies to emails</label>
          <label className="field sm:col-span-2">Signature (added to every email)
            <textarea className="input" name="signature" rows={3} defaultValue={b.emailSettings?.signature ?? ""} placeholder={e.signature} />
          </label>
        </ActionForm>
        <p className="text-xs text-muted">The AI never replies to newsletters, out-of-office notices, other automated mail, or itself.</p>
        <details className="text-sm" open={!postmarkConfigured()}>
          <summary className="cursor-pointer font-medium">How to connect Postmark</summary>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-muted">
            <li>Create a Postmark account and a Server. Under <strong>Sender Signatures</strong>, verify your domain (add the DNS records it shows) so replies come from your address and don&apos;t land in spam.</li>
            <li>Copy the Server API token into Vercel as <code>POSTMARK_SERVER_TOKEN</code>. Make up a long random secret for <code>POSTMARK_INBOUND_TOKEN</code>, add both, and redeploy.</li>
            <li>
              In the server&apos;s <strong>Default Inbound Stream → Settings</strong>, set the webhook URL to:
              <div className="mt-1">
                {inboundToken ? <CopyField value={`${base}/api/email/inbound/${inboundToken}`} /> : <p className="rounded-lg bg-bg p-2 text-xs">Add POSTMARK_INBOUND_TOKEN first; the full address will appear here.</p>}
              </div>
              Tick &ldquo;Include raw email content&rdquo; off; it isn&apos;t needed.
            </li>
            <li>At your email provider (Google Workspace, Microsoft 365, GoDaddy…), forward the address above to the inbound address Postmark gives you (it ends in @inbound.postmarkapp.com). Or use Postmark&apos;s inbound domain forwarding for a dedicated address.</li>
          </ol>
        </details>
      </section>
    </div>
  );
}
