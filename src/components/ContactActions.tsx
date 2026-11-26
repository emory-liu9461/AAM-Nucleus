import { callContact, messageContact } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import type { Contact } from "@/db/schema";

/** Call, and Text / Email the contact from the business (opens a short form), with the phone's own apps as a fallback. */
export function ContactActions({ slug, contact: c, leadId = null, businessName, yourPhones = [] }: { slug: string; contact: Contact; leadId?: string | null; businessName: string; yourPhones?: string[] }) {
  const digits = (c.phone ?? "").replace(/[^\d+]/g, "");
  return (
    <div className="space-y-2">
      {digits && (
        <details className="group rounded-lg border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium">
            <span>📞 Call {c.phone}</span><span className="text-xs text-muted group-open:hidden">from {businessName}</span>
          </summary>
          <div className="space-y-2 border-t border-line p-3">
            <ActionForm action={callContact.bind(null, slug, c.id)} submit="Call from Nucleus" pendingText="Calling your phone…" className="space-y-2">
              <label className="field">Ring my phone at
                <input className="input" name="yourPhone" type="tel" list={`my-phones-${c.id}`} defaultValue={yourPhones[0] ?? ""} placeholder="Your cell" required />
                <datalist id={`my-phones-${c.id}`}>{yourPhones.map((n) => <option key={n} value={n} />)}</datalist>
              </label>
              <p className="text-xs text-muted">Your phone rings first; answer and you&apos;re connected to them from the business number. The call is logged and counts as a reply.</p>
            </ActionForm>
            <a className="inline-block text-xs text-muted hover:text-ink" href={`tel:${digits}`}>Or call from your phone directly (not tracked; use &ldquo;Mark as replied&rdquo; after)</a>
          </div>
        </details>
      )}
      {digits && (
        <details className="group rounded-lg border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium">
            <span>💬 Text {c.firstName || "them"}</span><span className="text-xs text-muted group-open:hidden">from {businessName}</span>
          </summary>
          <div className="border-t border-line p-3">
            {c.smsOptOut ? (
              <p className="text-sm text-bad">They replied STOP, so they can&apos;t be texted until they reply START.</p>
            ) : (
              <ActionForm action={messageContact.bind(null, slug, c.id, leadId, "sms")} submit="Send text" pendingText="Sending…" resetOnSuccess className="space-y-2">
                <textarea name="body" required rows={3} maxLength={1500} className="input" placeholder={`Hi ${c.firstName || "there"}, this is ${businessName}…`} />
              </ActionForm>
            )}
            <a className="mt-2 inline-block text-xs text-muted hover:text-ink" href={`sms:${digits}`}>Or text from your phone instead</a>
          </div>
        </details>
      )}
      {c.email && (
        <details className="group rounded-lg border border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium">
            <span>✉️ Email {c.firstName || "them"}</span><span className="truncate pl-2 text-xs text-muted group-open:hidden">{c.email}</span>
          </summary>
          <div className="border-t border-line p-3">
            <ActionForm action={messageContact.bind(null, slug, c.id, leadId, "email")} submit="Send email" pendingText="Sending…" resetOnSuccess className="space-y-2">
              <input className="input" name="subject" defaultValue={`Your request with ${businessName}`} aria-label="Subject" />
              <textarea name="body" required rows={5} className="input" placeholder={`Hi ${c.firstName || "there"},\n\n`} />
              <p className="text-xs text-muted">Sent from the business email; your signature is added automatically. Their reply comes back to the Inbox.</p>
            </ActionForm>
            <a className="mt-2 inline-block text-xs text-muted hover:text-ink" href={`mailto:${c.email}`}>Or use your own email app</a>
          </div>
        </details>
      )}
      {!digits && !c.email && <p className="text-sm text-muted">No phone or email on file.</p>}
    </div>
  );
}
