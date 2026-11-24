import Link from "next/link";
import { headers } from "next/headers";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { regenerateFormKey, updateWebsiteSettings } from "@/app/actions";
import { CopyField } from "@/components/CopyField";
import { fmtDate, label } from "@/lib/format";
import { RATE_LIMIT } from "@/lib/intake";
import { requireBusinessPage } from "@/lib/session";
import { websiteBaseUrl } from "@/lib/app-settings";
import { setWebsiteUrl, testWebsiteLink } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";

const { leads, contacts } = schema;

export default async function WebsitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business: b } = await requireBusinessPage(slug, "manage_business");
  const h = await headers();
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const formUrl = `${appUrl}/f/${b.formKey}`;
  // The live domain if one is connected, otherwise the website project's preview address.
  const previewBase = await websiteBaseUrl();
  const siteLink = b.domain ? `https://${b.domain}` : previewBase ? `${previewBase}/?site=${b.slug}` : null;
  const apiUrl = `${appUrl}/api/public/leads/${b.formKey}`;
  const embed = `<script src="${appUrl}/embed.js" data-key="${b.formKey}" async></script>`;
  const htmlForm = `<form action="${apiUrl}" method="POST">
  <input name="name" placeholder="Name" required>
  <input name="phone" placeholder="Phone">
  <input name="email" type="email" placeholder="Email">
  <input name="service" placeholder="What do you need?">
  <textarea name="message"></textarea>
  <input name="company_website" style="display:none" tabindex="-1" autocomplete="off">
  <input type="hidden" name="_redirect" value="https://YOUR-SITE.com/thank-you">
  <button>Request a quote</button>
</form>`;
  const curl = `curl -X POST ${apiUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Jane Smith","phone":"555-123-4567","email":"jane@example.com","service":"Roof repair","message":"Leak over the garage","utm_source":"google"}'`;

  const recent = await db
    .select({ lead: leads, first: contacts.firstName, last: contacts.lastName })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .where(and(eq(leads.businessId, b.id), isNotNull(leads.attribution)))
    .orderBy(desc(leads.createdAt))
    .limit(10);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Website lead capture</h1>
          <p className="text-sm text-muted">Quote requests from your website arrive in Leads automatically, tagged with where they came from.</p>
        </div>
        <span className={`pill ${b.formEnabled ? "bg-green-500/15 text-green-700 dark:text-green-300" : "bg-gray-500/15 text-muted"}`}>
          {b.formEnabled ? "Accepting requests" : "Paused"}
        </span>
      </div>

      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="card-title mb-1">Your website</div>
          {b.domain ? (
            <p className="text-sm text-muted">
              <span className="font-medium text-good">● Live</span> at{" "}
              <a className="text-accent hover:underline" href={`https://${b.domain}`} target="_blank" rel="noreferrer">{b.domain}</a>
              {previewBase && <> · preview copy at <a className="text-accent hover:underline" href={`${previewBase}/?site=${b.slug}`} target="_blank" rel="noreferrer">{previewBase.replace(/^https?:\/\//, "")}</a></>}
            </p>
          ) : siteLink ? (
            <div className="space-y-1 text-sm text-muted">
              <p>
                <span className="font-medium text-good">● Live</span> at{" "}
                <a className="break-all text-accent hover:underline" href={siteLink} target="_blank" rel="noreferrer">{siteLink.replace(/^https?:\/\//, "")}</a>
              </p>
              <p className="text-xs">
                Optional: give it its own address like yourbusiness.com. Enter the domain on{" "}
                <Link className="text-accent hover:underline" href={`/b/${b.slug}/website/content`}>Edit website content</Link>, then add the same domain to the website project in Vercel.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Not linked yet. Enter your website project&apos;s address below under &ldquo;Link to your website project&rdquo;.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {siteLink ? (
            <a href={siteLink} target="_blank" rel="noreferrer" className="btn">Open website ↗</a>
          ) : (
            <span className="btn-ghost cursor-not-allowed opacity-60" title="Set a domain on Edit website content, or SITE_PREVIEW_URL in Vercel">Open website ↗</span>
          )}
          <Link href={`/b/${b.slug}/website/content`} className="btn-ghost">Edit website content</Link>
          <Link href={`/b/${b.slug}/website/assistant`} className="btn-ghost">AI assistant{b.assistant?.enabled ? " (on)" : ""}</Link>
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <div className="card-title mb-1">Link to your website project</div>
          <p className="text-sm text-muted">
            The address of your website project in Vercel (the one with Root Directory <code>site</code>). One address serves every business; Nucleus adds
            <code> ?site={b.slug}</code> for this one. In that project, <code>NUCLEUS_URL</code> must be this Nucleus address: <code>{appUrl}</code>
          </p>
        </div>
        <ActionForm action={setWebsiteUrl} submit="Save link" className="flex flex-wrap items-start gap-2">
          <input className="input min-w-0 flex-1" name="websiteUrl" defaultValue={previewBase ?? ""} placeholder="https://aam-nucleus-site.vercel.app" />
        </ActionForm>
        {previewBase && (
          <ActionForm action={testWebsiteLink.bind(null, b.slug)} submit="Test link" pendingText="Testing…" className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted">Check that the website shows {b.name} and sends quote requests here:</span>
          </ActionForm>
        )}
      </section>

      <p className="text-sm text-muted">Already have a different website? Connect it to Nucleus with any of these:</p>

      <section className="card space-y-3">
        <div>
          <div className="card-title mb-1">1. Put the quote form on your website</div>
          <p className="text-sm text-muted">Paste this where the form should appear. It matches your brand color and resizes itself.</p>
        </div>
        <CopyField value={embed} />
        <details className="text-sm">
          <summary className="cursor-pointer text-muted hover:text-ink">Where to paste it on WordPress, Wix, Squarespace, GoDaddy…</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li><strong className="text-ink">WordPress:</strong> edit the page → add a <em>Custom HTML</em> block → paste.</li>
            <li><strong className="text-ink">Wix:</strong> Add (+) → Embed Code → <em>Embed HTML</em> → choose &ldquo;Code&rdquo; → paste. Make the box about 650px tall.</li>
            <li><strong className="text-ink">Squarespace:</strong> edit the page → add a <em>Code</em> block → paste. Needs a Business plan or higher.</li>
            <li><strong className="text-ink">GoDaddy Website Builder:</strong> Add Section → <em>HTML</em> → paste.</li>
            <li><strong className="text-ink">Webflow / Shopify / custom site:</strong> an Embed / Custom code / Liquid block, or straight into the page HTML.</li>
          </ul>
        </details>
      </section>

      <section className="card space-y-3">
        <div>
          <div className="card-title mb-1">2. Or share a link</div>
          <p className="text-sm text-muted">
            A ready-made quote page. Use it for your Google Business Profile &ldquo;Get a quote&rdquo; link, Facebook, Instagram bio, texts and emails.
            Add tags to see which one brings the most work, e.g. <code className="text-xs">?utm_source=facebook</code> or <code className="text-xs">?utm_source=google&amp;utm_medium=gbp</code>.
          </p>
        </div>
        <CopyField value={formUrl} />
        <a href={formUrl} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">Open the form ↗</a>
      </section>

      <section className="card space-y-3">
        <div>
          <div className="card-title mb-1">3. Already have a form? Send it here</div>
          <p className="text-sm text-muted">
            Point your existing form, Zapier, Make or a form builder&apos;s webhook at this address (POST, JSON or a normal form post).
            Common field names just work: <code className="text-xs">name</code> or <code className="text-xs">first_name</code>/<code className="text-xs">last_name</code>,{" "}
            <code className="text-xs">email</code>, <code className="text-xs">phone</code>, <code className="text-xs">address</code>, <code className="text-xs">service</code>,{" "}
            <code className="text-xs">message</code>, <code className="text-xs">budget</code>, <code className="text-xs">utm_source</code>… Name plus an email or phone is required.
          </p>
        </div>
        <CopyField value={apiUrl} />
        <details className="text-sm">
          <summary className="cursor-pointer text-muted hover:text-ink">Plain HTML form example</summary>
          <div className="mt-2"><CopyField value={htmlForm} multiline /></div>
          <p className="mt-1 text-xs text-muted"><code>_redirect</code> sends visitors back to your own thank-you page. The hidden <code>company_website</code> field catches spam bots.</p>
        </details>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted hover:text-ink">JSON / developer example</summary>
          <div className="mt-2"><CopyField value={curl} multiline /></div>
          <p className="mt-1 text-xs text-muted">Responds <code>201 {"{"}&quot;ok&quot;:true,&quot;id&quot;:…{"}"}</code>; <code>422</code> if name/contact is missing; <code>429</code> after {RATE_LIMIT.max} requests from one visitor in {RATE_LIMIT.windowMinutes} minutes.</p>
        </details>
      </section>

      <section className="card">
        <div className="card-title">Form settings</div>
        <form action={updateWebsiteSettings.bind(null, b.slug)} className="grid gap-3 sm:grid-cols-2">
          <label className="field">Heading<input className="input" name="formHeading" defaultValue={b.formHeading ?? ""} placeholder="Request a free quote" /></label>
          <label className="field">Thank-you message<input className="input" name="formThankYou" defaultValue={b.formThankYou ?? ""} placeholder={`Thanks! ${b.name} will be in touch shortly.`} /></label>
          <label className="field">Services dropdown (one per line; blank = free text)
            <textarea className="input min-h-28" name="formServices" defaultValue={b.formServices ?? ""} placeholder={"Roof replacement\nRoof repair\nGutters"} />
          </label>
          <div className="space-y-3">
            <label className="field">Only accept from these websites (optional)
              <input className="input" name="allowedDomains" defaultValue={b.allowedDomains ?? ""} placeholder="yourcompany.com, otherdomain.com" />
              <span className="font-normal">Blocks other sites from posting to your form address. Subdomains are included. Leave blank while testing.</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="formEnabled" defaultChecked={b.formEnabled} /> Accept new requests
            </label>
          </div>
          <div className="sm:col-span-2"><button className="btn">Save settings</button></div>
        </form>
      </section>

      <section className="card">
        <div className="card-title">Recent website leads</div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">None yet. Submit the form above to test it, then check the Leads tab.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {recent.map(({ lead, first, last }) => (
              <li key={lead.id} className="flex flex-wrap items-center gap-x-3 py-2">
                <span className="font-medium">{first} {last}</span>
                <span>{lead.title}</span>
                <span className="text-muted">{label(lead.source)}{lead.attribution?.utmCampaign ? ` · ${lead.attribution.utmCampaign}` : ""}</span>
                <span className="ml-auto text-xs text-muted">{fmtDate(lead.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="card-title">Preview</div>
        <iframe src={`/f/${b.formKey}?embed=1&utm_source=preview`} title="Form preview" className="h-[620px] w-full max-w-xl rounded-lg border border-line bg-white" />
        <p className="mt-2 text-xs text-muted">Submitting here creates a real lead (source tagged &ldquo;preview&rdquo;).</p>
      </section>

      <section className="card border-bad/40">
        <div className="card-title">Reset form address</div>
        <p className="mb-3 text-sm text-muted">Use this if spam is getting through. It changes the form key, so you&apos;ll need to paste the new embed code or link everywhere you used the old one.</p>
        <form action={regenerateFormKey.bind(null, b.slug)}>
          <button className="btn-ghost text-bad">Generate a new form key</button>
        </form>
      </section>
    </div>
  );
}
