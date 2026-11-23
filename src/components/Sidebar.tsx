import Link from "next/link";
import type { Business } from "@/db/schema";
import { logout } from "@/app/actions";
import { NavLink } from "./NavLink";

export function Sidebar({ businesses }: { businesses: Business[] }) {
  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-b border-line bg-panel p-3 md:sticky md:top-0 md:h-screen md:w-60 md:border-r md:border-b-0">
      <Link href="/" className="px-2 text-lg font-bold tracking-tight">
        Nucleus
      </Link>
      <nav className="flex flex-col gap-0.5">
        <NavLink href="/" exact>
          <span className="h-2.5 w-2.5 rounded-sm bg-ink" /> All businesses
        </NavLink>
      </nav>
      <div className="flex flex-col gap-0.5">
        <div className="px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted">Businesses</div>
        {businesses.map((b) => (
          <NavLink key={b.id} href={`/b/${b.slug}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
            <span className="truncate">{b.name}</span>
          </NavLink>
        ))}
        <NavLink href="/businesses/new" className="mt-1">
          <span className="w-2.5 text-center">+</span> Add business
        </NavLink>
      </div>
      <form action={logout} className="mt-auto hidden md:block">
        <button className="px-2.5 text-sm text-muted hover:text-ink">Sign out</button>
      </form>
    </aside>
  );
}
