import Link from "next/link";
import type { Site } from "@/lib/site";
import { nucleusUrl, telHref } from "@/lib/site";
import { Icon, Stars } from "./Icon";
import { QuoteForm } from "./QuoteForm";

export const endpointFor = (s: Site) => (s.business.formKey ? `${nucleusUrl()}/api/public/leads/${s.business.formKey}` : null);

export function trustPoints(s: Site) {
  const c = s.content;
  return [
    c.license ? { icon: "badge", label: "Licensed", detail: `License ${c.license}` } : { icon: "badge", label: "Licensed", detail: "Fully licensed" },
    c.insured ? { icon: "shield", label: "Insured", detail: "Fully insured for your protection" } : null,
    { icon: "check", label: "Warranty", detail: c.warranty },
    c.yearsInBusiness ? { icon: "calendar", label: `${c.yearsInBusiness}+ years`, detail: "Serving our neighbors" } : { icon: "doc", label: "Free quotes", detail: "Clear, written estimates" },
  ].filter(Boolean) as { icon: string; label: string; detail: string }[];
}

export function Hero({ site }: { site: Site }) {
  const { business: b, content: c } = site;
  return (
    <section className="relative overflow-hidden bg-brand-soft">
      <div aria-hidden className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(var(--brand) 1px, transparent 1px), linear-gradient(90deg, var(--brand) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
      <div className="wrap relative grid items-center gap-10 py-14 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <div>
          {c.primaryCity && <p className="eyebrow flex items-center gap-1.5"><Icon name="pin" className="h-4 w-4" />{c.primaryCity}</p>}
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl lg:text-6xl">{c.heroHeadline}</h1>
          <p className="lead mt-5 max-w-xl">{c.heroSubheadline}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/quote" className="btn-primary text-base">Get a free quote <Icon name="arrow" className="h-4 w-4" /></Link>
            {b.phone && <a href={telHref(b.phone)} className="btn-outline text-base"><Icon name="phone" className="h-4 w-4" />{b.phone}</a>}
          </div>
          <ul className="mt-8 grid max-w-lg grid-cols-2 gap-3 text-sm font-medium">
            {trustPoints(site).map((t) => (
              <li key={t.label} className="flex items-center gap-2"><Icon name={t.icon} className="h-5 w-5 text-brand" />{t.label}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-white p-6 shadow-xl shadow-slate-900/5" id="quote">
          <QuoteForm businessName={site.business.name} endpoint={endpointFor(site)} services={c.services.map((s) => s.name)} compact heading="Request your free quote" />
        </div>
      </div>
    </section>
  );
}

/** Pick an icon that suits the service. */
export function serviceIcon(name: string, trade: string) {
  if (/paint|stain|cabinet|coat|finish/i.test(name) || /paint/i.test(trade)) return /repair|drywall/i.test(name) ? "wrench" : "brush";
  if (/repair|fix|drywall/i.test(name)) return "wrench";
  return "home";
}

export function PageHero({ eyebrow, title, intro }: { eyebrow?: string; title: string; intro?: string }) {
  return (
    <section className="border-b border-line bg-brand-soft">
      <div className="wrap py-12 sm:py-16">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
        {intro && <p className="lead mt-4 max-w-2xl">{intro}</p>}
      </div>
    </section>
  );
}

export function TrustBar({ site }: { site: Site }) {
  return (
    <section className="border-b border-line">
      <div className="wrap grid grid-cols-2 gap-6 py-8 lg:grid-cols-4">
        {trustPoints(site).map((t) => (
          <div key={t.label} className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><Icon name={t.icon} /></span>
            <div><div className="font-semibold">{t.label}</div><div className="text-sm text-muted">{t.detail}</div></div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ServicesGrid({ site, limit }: { site: Site; limit?: number }) {
  const list = limit ? site.content.services.slice(0, limit) : site.content.services;
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((s) => (
        <Link key={s.slug} href={`/services/${s.slug}`} className="group rounded-xl border border-line bg-white p-6 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg hover:shadow-slate-900/5">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-soft text-brand"><Icon name={serviceIcon(s.name, site.business.trade)} className="h-6 w-6" /></span>
          <h3 className="mt-4 text-lg font-bold">{s.name}</h3>
          {s.summary && <p className="mt-2 text-sm text-muted">{s.summary}</p>}
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand">Learn more <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
        </Link>
      ))}
    </div>
  );
}

export function Process() {
  const steps = [
    { icon: "doc", title: "Request a quote", text: "Tell us about your project online or by phone." },
    { icon: "calendar", title: "Site visit", text: "We visit, measure and talk through your options." },
    { icon: "dollar", title: "Clear estimate", text: "A written, itemized price, with no surprises." },
    { icon: "check", title: "Quality work", text: "We do the job right, clean up, and stand behind it." },
  ];
  return (
    <section className="bg-surface py-16 sm:py-20">
      <div className="wrap">
        <p className="eyebrow">How it works</p>
        <h2 className="h2 mt-2">Simple from first call to final walkthrough</h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-line bg-white p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
                <Icon name={s.icon} className="h-5 w-5 text-brand" />
              </div>
              <h3 className="mt-4 font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Reviews({ site, limit }: { site: Site; limit?: number }) {
  const list = limit ? site.content.reviews.slice(0, limit) : site.content.reviews;
  if (!list.length) return null;
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {list.map((r, i) => (
        <figure key={i} className="flex flex-col rounded-xl border border-line bg-white p-6">
          <Stars n={r.rating} />
          <blockquote className="mt-3 flex-1 text-ink">&ldquo;{r.text}&rdquo;</blockquote>
          <figcaption className="mt-4 text-sm font-semibold">{r.name}{r.city && <span className="font-normal text-muted"> · {r.city}</span>}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function Areas({ site }: { site: Site }) {
  if (!site.content.serviceAreas.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {site.content.serviceAreas.map((a) => (
        <li key={a.slug}>
          <Link href={`/areas/${a.slug}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium hover:border-brand hover:text-brand">
            <Icon name="pin" className="h-4 w-4 text-brand" />{a.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CtaBand({ site, title }: { site: Site; title?: string }) {
  const b = site.business;
  return (
    <section className="bg-brand">
      <div className="wrap flex flex-col items-start justify-between gap-6 py-12 text-white md:flex-row md:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{title ?? "Ready to get started?"}</h2>
          <p className="mt-2 text-white/85">Free, no-obligation quotes. {site.content.hours}.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/quote" className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-semibold text-brand-dark hover:bg-white/90">Get a free quote</Link>
          {b.phone && <a href={telHref(b.phone)} className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-5 py-3 font-semibold text-white hover:bg-white/10"><Icon name="phone" className="h-4 w-4" />{b.phone}</a>}
        </div>
      </div>
    </section>
  );
}

export function Section({ eyebrow, title, intro, children, action }: { eyebrow?: string; title: string; intro?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="py-16 sm:py-20">
      <div className="wrap">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 className="h2 mt-2">{title}</h2>
            {intro && <p className="lead mt-3 max-w-2xl">{intro}</p>}
          </div>
          {action}
        </div>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}
