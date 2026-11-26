import Link from "next/link";
import type { Site } from "@/lib/site";
import { logoSrc, telHref } from "@/lib/site";
import { Icon } from "./Icon";

const NAV = [
  ["/services", "Services"],
  ["/projects", "Projects"],
  ["/areas", "Service areas"],
  ["/reviews", "Reviews"],
  ["/about", "About"],
] as const;

function navFor(site: Site) {
  const c = site.content;
  return NAV.filter(([href]) => (href === "/areas" ? c.serviceAreas.length > 0 : href === "/reviews" ? c.reviews.length > 0 : href === "/projects" ? (site.photos?.length ?? 0) > 0 : true));
}

function Logo({ site, white, className = "" }: { site: Site; white?: boolean; className?: string }) {
  const b = site.business;
  return (
    <Link href="/" className={`flex min-w-0 items-center gap-2.5 ${className}`} aria-label={`${b.name} home`}>
      {b.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoSrc(b, white ? "-white" : "")} alt={b.name} className="h-11 w-auto max-w-full object-contain object-left sm:h-12" />
      ) : (
        <>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-lg font-black text-white">{b.name.trim()[0]}</span>
          <span className="truncate text-lg font-bold leading-tight">{b.name}</span>
        </>
      )}
    </Link>
  );
}

function MobileNav({ site, className }: { site: Site; className: string }) {
  return (
    <nav className={`wrap flex gap-5 overflow-x-auto pb-2 text-sm font-medium lg:hidden ${className}`} aria-label="Main">
      {navFor(site).map(([href, label]) => <Link key={href} href={href} className="shrink-0">{label}</Link>)}
    </nav>
  );
}

/* Each theme has its own header so the sites differ from the first glance. */
export function Header({ site }: { site: Site }) {
  switch (site.content.theme) {
    case "bold": return <BoldHeader site={site} />;
    case "fresh": return <FreshHeader site={site} />;
    case "elegant": return <ElegantHeader site={site} />;
    case "modern": return <ModernHeader site={site} />;
    default: return <ClassicHeader site={site} />;
  }
}

/** Classic: logo left, links right, phone and button. */
function ClassicHeader({ site }: { site: Site }) {
  const b = site.business;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="wrap flex h-16 items-center gap-6">
        <Logo site={site} className="flex-1 lg:flex-none" />
        <nav className="ml-auto hidden items-center gap-6 text-sm font-medium text-muted lg:flex">
          {navFor(site).map(([href, label]) => <Link key={href} href={href} className="hover:text-ink">{label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          {b.phone && <a href={telHref(b.phone)} className="hidden items-center gap-1.5 font-semibold text-ink hover:text-brand sm:flex"><Icon name="phone" className="h-4 w-4 text-brand" /> {b.phone}</a>}
          <Link href="/quote" className="btn-primary shrink-0 whitespace-nowrap px-4 py-2 text-sm">Free quote</Link>
        </div>
      </div>
      <MobileNav site={site} className="text-muted" />
    </header>
  );
}

/** Bold: brand-colour info strip, then a dark bar with condensed capitals. */
function BoldHeader({ site }: { site: Site }) {
  const { business: b, content: c } = site;
  return (
    <header className="sticky top-0 z-40 bg-[#0f1115] text-white">
      <div className="hidden bg-brand sm:block">
        <div className="wrap flex h-9 items-center justify-between gap-4 text-xs font-semibold uppercase tracking-wider">
          <span className="flex items-center gap-1.5"><Icon name="pin" className="h-3.5 w-3.5" />{c.primaryCity ? `Serving ${c.primaryCity}${c.serviceAreas.length > 1 ? " & area" : ""}` : "Free estimates"}</span>
          <span className="flex items-center gap-1.5"><Icon name="clock" className="h-3.5 w-3.5" />{c.hours}</span>
        </div>
      </div>
      <div className="wrap flex h-16 items-center gap-6 border-b border-white/10">
        <Logo site={site} white className="flex-1 lg:flex-none" />
        <nav className="ml-auto hidden items-center gap-7 font-head text-lg font-semibold uppercase tracking-wide text-white/70 lg:flex">
          {navFor(site).map(([href, label]) => <Link key={href} href={href} className="hover:text-white">{label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-4 lg:ml-0">
          {b.phone && <a href={telHref(b.phone)} className="hidden font-head text-xl font-bold hover:text-brand md:block">{b.phone}</a>}
          <Link href="/quote" className="btn-primary shrink-0 whitespace-nowrap px-4 py-2 text-sm">Free quote</Link>
        </div>
      </div>
      <MobileNav site={site} className="pt-2 font-semibold uppercase text-white/70" />
    </header>
  );
}

/** Fresh: a floating rounded bar with pill links. */
function FreshHeader({ site }: { site: Site }) {
  return (
    <header className="sticky top-0 z-40 bg-brand-soft pb-2 pt-3 lg:bg-transparent lg:pb-0">
      <div className="wrap">
        <div className="flex h-16 items-center gap-3 rounded-full border border-line bg-white/95 pl-5 pr-2 shadow-lg shadow-slate-900/5 backdrop-blur">
          <Logo site={site} className="flex-1 lg:flex-none [&_img]:h-10" />
          <nav className="mx-auto hidden items-center gap-1 text-sm font-medium text-muted lg:flex">
            {navFor(site).map(([href, label]) => <Link key={href} href={href} className="rounded-full px-3.5 py-2 hover:bg-brand-soft hover:text-brand">{label}</Link>)}
          </nav>
          <Link href="/quote" className="btn-primary shrink-0 whitespace-nowrap px-5 py-2.5 text-sm">Free quote</Link>
        </div>
      </div>
      <nav className="wrap mt-2 flex gap-2 overflow-x-auto text-sm font-medium lg:hidden" aria-label="Main">
        {navFor(site).map(([href, label]) => <Link key={href} href={href} className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-muted shadow-sm">{label}</Link>)}
      </nav>
    </header>
  );
}

/** Elegant: centred logo, phone and consultation either side, spaced small capitals underneath. */
function ElegantHeader({ site }: { site: Site }) {
  const b = site.business;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="wrap grid h-20 grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div>{b.phone && <a href={telHref(b.phone)} className="hidden text-sm tracking-wider text-muted hover:text-brand md:inline">{b.phone}</a>}</div>
        <Logo site={site} className="justify-center" />
        <div className="flex justify-end"><Link href="/quote" className="btn-outline whitespace-nowrap px-3 py-2 text-[11px] uppercase tracking-[0.18em] sm:px-4">Consultation</Link></div>
      </div>
      <nav className="hidden border-t border-line lg:block" aria-label="Main">
        <div className="wrap flex h-11 items-center justify-center gap-10 text-xs uppercase tracking-[0.22em] text-muted">
          <Link href="/" className="hover:text-brand">Home</Link>
          {navFor(site).map(([href, label]) => <Link key={href} href={href} className="hover:text-brand">{label}</Link>)}
        </div>
      </nav>
      <MobileNav site={site} className="text-xs uppercase tracking-[0.18em] text-muted" />
    </header>
  );
}

/** Modern: glassy bar, links grouped in a pill in the middle. */
function ModernHeader({ site }: { site: Site }) {
  const b = site.business;
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-white/80 backdrop-blur-xl">
      <div className="wrap flex h-16 items-center gap-4">
        <Logo site={site} className="flex-1 lg:flex-none" />
        <nav className="mx-auto hidden items-center gap-1 rounded-full bg-surface p-1 text-sm font-medium text-muted lg:flex">
          {navFor(site).map(([href, label]) => <Link key={href} href={href} className="rounded-full px-4 py-1.5 hover:bg-white hover:text-ink hover:shadow-sm">{label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          {b.phone && <a href={telHref(b.phone)} aria-label={`Call ${b.phone}`} className="hidden h-10 w-10 items-center justify-center rounded-full border border-line text-brand hover:border-brand sm:flex"><Icon name="phone" className="h-4 w-4" /></a>}
          <Link href="/quote" className="btn-primary shrink-0 whitespace-nowrap !rounded-full px-5 py-2 text-sm">Free quote</Link>
        </div>
      </div>
      <MobileNav site={site} className="text-muted" />
    </header>
  );
}
