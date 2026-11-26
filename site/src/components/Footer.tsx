import Link from "next/link";
import type { Site } from "@/lib/site";
import { SOCIAL_NAMES, logoSrc, telHref } from "@/lib/site";
import { Icon } from "./Icon";

export function Footer({ site }: { site: Site }) {
  const { business: b, content: c } = site;
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-surface pb-24 pt-14 sm:pb-10">
      <div className="wrap grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          {b.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc(b)} alt={b.name} className="h-11 w-auto max-w-full object-contain object-left" />
          ) : (
            <div className="text-lg font-bold">{b.name}</div>
          )}
          <p className="mt-2 max-w-sm text-sm text-muted">{c.tagline}</p>
          <ul className="mt-4 space-y-2 text-sm">
            {b.phone && <li><a className="flex items-center gap-2 hover:text-brand" href={telHref(b.phone)}><Icon name="phone" className="h-4 w-4 text-brand" />{b.phone}</a></li>}
            {b.email && <li><a className="flex items-center gap-2 hover:text-brand" href={`mailto:${b.email}`}><Icon name="doc" className="h-4 w-4 text-brand" />{b.email}</a></li>}
            <li className="flex items-center gap-2 text-muted"><Icon name="clock" className="h-4 w-4 text-brand" />{c.hours}</li>
            {c.license && <li className="flex items-center gap-2 text-muted"><Icon name="badge" className="h-4 w-4 text-brand" />License {c.license}</li>}
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold">Services</div>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {c.services.slice(0, 8).map((s) => <li key={s.slug}><Link className="hover:text-ink" href={`/services/${s.slug}`}>{s.name}</Link></li>)}
          </ul>
        </div>
        <div>
          <div className="text-sm font-semibold">Company</div>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link className="hover:text-ink" href="/about">About us</Link></li>
            {c.serviceAreas.length > 0 && <li><Link className="hover:text-ink" href="/areas">Service areas</Link></li>}
            {c.reviews.length > 0 && <li><Link className="hover:text-ink" href="/reviews">Reviews</Link></li>}
            <li><Link className="hover:text-ink" href="/quote">Get a free quote</Link></li>
            <li><Link className="hover:text-ink" href="/privacy">Privacy policy</Link></li>
          </ul>
          {SOCIAL_NAMES.some(([k]) => c.social[k]) && (
            <div className="mt-4">
              <div className="text-sm font-semibold">Find us on</div>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {SOCIAL_NAMES.filter(([k]) => c.social[k]).map(([k, name]) => (
                  <li key={k}><a className="text-muted hover:text-brand" href={c.social[k]} rel="noopener" target="_blank">{name}</a></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="wrap mt-10 border-t border-line pt-6 text-xs text-muted">© {year} {b.name}. All rights reserved.</div>
    </footer>
  );
}

/** Phone-only bar pinned to the bottom of the screen: most contractor leads come from phones. */
export function MobileBar({ site }: { site: Site }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-line bg-white p-2 sm:hidden">
      {site.business.phone ? (
        <a href={telHref(site.business.phone)} className="btn-outline py-2.5"><Icon name="phone" className="h-4 w-4" />Call</a>
      ) : <span />}
      <Link href="/quote" className={`btn-primary py-2.5 ${site.business.phone ? "" : "col-span-2"}`}>Free quote</Link>
    </div>
  );
}
