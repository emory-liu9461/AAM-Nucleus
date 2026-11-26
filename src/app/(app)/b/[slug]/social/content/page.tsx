import Link from "next/link";
import { updateSiteContent } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { requireBusinessPage } from "@/lib/session";
import { BRAND_LOGOS, SECTION_LABELS, SITE_THEMES, logoFor, publicSite, themeForTrade, toLines } from "@/lib/site-defaults";
import type { SiteSectionKey } from "@/db/schema";
import { websiteBaseUrl } from "@/lib/app-settings";

export default async function SiteContentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business: b } = await requireBusinessPage(slug, "manage_business");
  const c = b.site ?? {};
  const d = publicSite(b).content; // defaults shown as placeholders
  const currentLogo = logoFor(b);
  const autoLogo = logoFor({ ...b, site: { ...(b.site ?? {}), logo: undefined } });
  const previewBase = await websiteBaseUrl();

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href={`/b/${b.slug}/social`} className="text-sm text-muted hover:text-ink">← Social</Link>
          <h1 className="text-xl font-semibold">Website content</h1>
          <p className="text-sm text-muted">Anything left blank uses the grey example text, which comes from the business&apos;s trade.</p>
        </div>
        <div className="flex gap-2">
          {b.domain && <a className="btn-ghost" href={`https://${b.domain}`} target="_blank" rel="noreferrer">Open {b.domain} ↗</a>}
          {previewBase && <a className="btn-ghost" href={`${previewBase}/?site=${b.slug}`} target="_blank" rel="noreferrer">Preview ↗</a>}
        </div>
      </div>

      {previewBase ? (
        <section className="card p-0">
          <div className="flex items-center justify-between px-4 pt-3 text-sm">
            <span className="card-title mb-0">Live preview</span>
            <span className="text-xs text-muted">Click around: it&apos;s the real website. Saved changes appear within about a minute.</span>
          </div>
          <iframe src={`${previewBase}/?site=${b.slug}`} title="Website preview" className="mt-3 h-[640px] w-full rounded-b-xl border-t border-line bg-white" />
        </section>
      ) : (
        <p className="card text-sm text-muted">
          To preview the website here, enter your website project&apos;s address under <Link className="text-accent hover:underline" href={`/b/${b.slug}/social`}>Social → Link to your website project</Link>.
        </p>
      )}

      <ActionForm action={updateSiteContent.bind(null, b.slug)} submit="Save website content" className="space-y-5">
        <Card title="Domain">
          <label className="field sm:col-span-2">Website domain
            <input className="input" name="domain" defaultValue={b.domain ?? ""} placeholder="yourcompany.com" />
            <span className="font-normal">The address customers type. Add the same domain to the website project in Vercel. Both yourcompany.com and www.yourcompany.com work.</span>
          </label>
        </Card>

        <Card title="Logo">
          <label className="field">Logo shown on the website
            <select className="input" name="logo" defaultValue={c.logo ?? ""}>
              <option value="">Automatic{autoLogo ? ` (${BRAND_LOGOS.find((l) => l.key === autoLogo)?.name})` : " (business name as text)"}</option>
              {BRAND_LOGOS.map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
              <option value="none">No logo (business name as text)</option>
            </select>
            <span className="font-normal">Choosing a trade logo also sets this business&apos;s brand color to match.</span>
          </label>
          <div className="flex items-center justify-center rounded-lg border border-line bg-white p-3">
            {currentLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/brand/arcus/${currentLogo}.svg`} alt="Current logo" className="h-12 w-auto" />
            ) : (
              <span className="text-sm text-muted">{b.name} (text)</span>
            )}
          </div>
        </Card>

        <Card title="Theme">
          <p className="text-sm text-muted sm:col-span-2">The overall look: fonts, corners, and the style of the header and top section. Your logo and brand colour are used in every theme.</p>
          <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5">
              <input type="radio" name="theme" value="" defaultChecked={!c.theme} className="mt-1" />
              <span><span className="font-semibold">Automatic</span><span className="block text-muted">Based on the trade: {SITE_THEMES.find((t) => t.key === themeForTrade(b.trade))?.name} for {b.trade.toLowerCase()}.</span></span>
            </label>
            {SITE_THEMES.map((t) => (
              <label key={t.key} className="flex cursor-pointer items-start gap-2 rounded-lg border border-line p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5">
                <input type="radio" name="theme" value={t.key} defaultChecked={c.theme === t.key} className="mt-1" />
                <span><span className="font-semibold">{t.name}</span><span className="block text-muted">{t.text}</span></span>
              </label>
            ))}
          </div>
        </Card>

        <Card title="Top of the home page">
          <Field name="heroHeadline" label="Headline" value={c.heroHeadline} placeholder={d.heroHeadline} />
          <Field name="tagline" label="Tagline (browser tab and Google)" value={c.tagline} placeholder={d.tagline} />
          <Field name="heroSubheadline" label="Sub-headline" value={c.heroSubheadline} placeholder={d.heroSubheadline} wide />
        </Card>

        <Card title="Services">
          <Area name="services" label="One per line: Service name | short description (optional)" rows={7}
            value={(c.services ?? []).map((s) => (s.summary ? `${s.name} | ${s.summary}` : s.name)).join("\n")}
            placeholder={d.services.map((s) => `${s.name} | ${s.summary}`).join("\n")} />
        </Card>

        <Card title="Where you work">
          <Field name="primaryCity" label="Main city" value={c.primaryCity} placeholder="Springfield, IL" />
          <div />
          <Area name="serviceAreas" label="Cities and towns you serve, one per line (each gets its own page, which helps local Google searches)" rows={5}
            value={(c.serviceAreas ?? []).join("\n")} placeholder={"Springfield, IL\nChatham, IL\nRochester, IL"} />
        </Card>

        <Card title="Why choose you">
          <Field name="yearsInBusiness" label="Years in business" value={c.yearsInBusiness?.toString()} placeholder="12" />
          <Field name="license" label="License number" value={c.license} placeholder="IL #104-012345" />
          <Field name="warranty" label="Warranty" value={c.warranty} placeholder={d.warranty} />
          <label className="field">Satisfaction guarantee (days)
            <input className="input" name="guaranteeDays" type="number" min={0} max={365} defaultValue={c.guaranteeDays ?? 14} />
            <span className="font-normal">&ldquo;Not satisfied? Tell us within … and we&apos;ll make it right.&rdquo; Used on the website and in the job-completed message. 0 = no guarantee.</span>
          </label>
          <Field name="hours" label="Hours" value={c.hours} placeholder={d.hours} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="insured" defaultChecked={c.insured ?? true} /> Fully insured</label>
          <Area name="about" label="About us" rows={4} value={c.about} placeholder={d.about} />
          <Area name="financing" label="Financing (optional; adds a Financing section)" rows={2} value={c.financing} placeholder="Flexible financing available, with low monthly payments on approved credit." />
        </Card>

        <Card title="Page sections">
          <p className="text-sm text-muted sm:col-span-2">
            Show or hide each part of the home page and change its wording. Lists are one item per line, as <span className="font-mono">Title | description</span>.
            Clear a heading to go back to the default. Text left as it is keeps following the defaults (for example, your warranty and licence above).
          </p>
          {(Object.keys(SECTION_LABELS) as SiteSectionKey[]).map((k) => {
            const sec = d.sections[k];
            return (
              <fieldset key={k} className="space-y-2 rounded-lg border border-line p-3 sm:col-span-2">
                <legend className="px-1 text-sm font-semibold">{SECTION_LABELS[k]}</legend>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={`sec_${k}_show`} defaultChecked={sec.show} /> Show on the website</label>
                {k !== "trust" && (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {!["priorities", "cta"].includes(k) && <label className="field">Small label above<input className="input" name={`sec_${k}_eyebrow`} defaultValue={sec.eyebrow} /></label>}
                    <label className={`field ${["priorities", "cta"].includes(k) ? "sm:col-span-3" : "sm:col-span-2"}`}>Heading<input className="input" name={`sec_${k}_title`} defaultValue={sec.title} /></label>
                    {k !== "about" && <label className="field sm:col-span-3">{k === "cta" ? "Text" : "Intro line"}<input className="input" name={`sec_${k}_intro`} defaultValue={sec.intro} /></label>}
                  </div>
                )}
                {k === "trust" && <ListArea name="trustPoints" label="Trust points: Label | short detail (6 fit best)" value={toLines(d.trustPoints.map((t) => ({ a: t.label, b: t.detail })))} />}
                {k === "priorities" && <ListArea name="priorities" label="In order: Title | description" value={toLines(d.priorities.map((t) => ({ a: t.title, b: t.text })))} />}
                {k === "process" && <ListArea name="process" label="Steps: Title | description (4 fit best)" value={toLines(d.process.map((t) => ({ a: t.title, b: t.text })))} />}
                {k === "about" && <p className="text-xs text-muted">The About text itself is under &ldquo;Why choose you&rdquo;.</p>}
              </fieldset>
            );
          })}
        </Card>

        <Card title="Reviews">
          <Area name="reviews" label="One per line: Name | City | Review | Stars (1–5)" rows={5}
            value={(c.reviews ?? []).map((r) => [r.name, r.city ?? "", r.text, r.rating ?? 5].join(" | ")).join("\n")}
            placeholder={"Sarah M. | Springfield | They replaced our roof in one day and cleaned up everything. | 5"} />
          <p className="text-xs text-muted sm:col-span-2">Only use real reviews from real customers, with their permission.</p>
        </Card>

        <Card title="Tracking (optional)">
          <p className="text-sm text-muted sm:col-span-2">
            Social media profile links are set on the <Link className="text-accent hover:underline" href={`/b/${b.slug}/social`}>Social</Link> tab.
          </p>
          <Field name="ga4" label="Google Analytics ID" value={c.analytics?.ga4} placeholder="G-XXXXXXXXXX" />
          <Field name="googleAds" label="Google Ads ID" value={c.analytics?.googleAds} placeholder="AW-XXXXXXXXX" />
          <Field name="metaPixel" label="Meta (Facebook) Pixel ID" value={c.analytics?.metaPixel} placeholder="1234567890" />
        </Card>
        <p className="text-sm text-muted">Business name, phone, email and brand color come from <Link className="text-accent hover:underline" href={`/b/${b.slug}/settings`}>Settings</Link>. The quote form uses the <Link className="text-accent hover:underline" href={`/b/${b.slug}/social`}>Social</Link> tab&apos;s form settings.</p>
      </ActionForm>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="card-title">{title}</div>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}
function Field({ name, label, value, placeholder, wide }: { name: string; label: string; value?: string; placeholder?: string; wide?: boolean }) {
  return (
    <label className={`field ${wide ? "sm:col-span-2" : ""}`}>{label}
      <input className="input" name={name} defaultValue={value ?? ""} placeholder={placeholder} />
    </label>
  );
}
function ListArea({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="field">{label}
      <textarea className="input font-normal" name={name} rows={Math.max(3, value.split("\n").length + 1)} defaultValue={value} />
    </label>
  );
}
function Area({ name, label, value, placeholder, rows = 3 }: { name: string; label: string; value?: string; placeholder?: string; rows?: number }) {
  return (
    <label className="field sm:col-span-2">{label}
      <textarea className="input" name={name} rows={rows} defaultValue={value ?? ""} placeholder={placeholder} />
    </label>
  );
}
