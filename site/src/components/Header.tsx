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

export function Header({ site }: { site: Site }) {
  const { business: b, content: c } = site;
  const dark = c.theme === "bold"; // dark header with the white logo
  const nav = NAV.filter(([href]) => (href === "/areas" ? c.serviceAreas.length > 0 : href === "/reviews" ? c.reviews.length > 0 : href === "/projects" ? (site.photos?.length ?? 0) > 0 : true));
  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur ${dark ? "border-white/10 bg-[#0f1115]/95 text-white" : "border-line bg-white/95"}`}>
      <div className="wrap flex h-16 items-center gap-6">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-2.5 lg:flex-none" aria-label={`${b.name} home`}>
          {b.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc(b, dark ? "-white" : "")} alt={b.name} className="h-11 w-auto max-w-full object-contain object-left sm:h-12" />
          ) : (
            <>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-lg font-black text-white">{b.name.trim()[0]}</span>
              <span className="truncate text-lg font-bold leading-tight">{b.name}</span>
            </>
          )}
        </Link>
        <nav className={`ml-auto hidden items-center gap-6 text-sm font-medium lg:flex ${dark ? "text-white/70" : "text-muted"}`}>
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={dark ? "hover:text-white" : "hover:text-ink"}>{label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          {b.phone && (
            <a href={telHref(b.phone)} className={`hidden items-center gap-1.5 font-semibold hover:text-brand sm:flex ${dark ? "text-white" : "text-ink"}`}>
              <Icon name="phone" className="h-4 w-4 text-brand" /> {b.phone}
            </a>
          )}
          <Link href="/quote" className="btn-primary shrink-0 whitespace-nowrap px-4 py-2 text-sm">Free quote</Link>
        </div>
      </div>
      <nav className={`wrap flex gap-5 overflow-x-auto pb-2 text-sm font-medium lg:hidden ${dark ? "text-white/70" : "text-muted"}`} aria-label="Main">
        {nav.map(([href, label]) => (
          <Link key={href} href={href} className="shrink-0 hover:text-ink">{label}</Link>
        ))}
      </nav>
    </header>
  );
}
