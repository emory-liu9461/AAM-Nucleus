import Link from "next/link";
import type { Business, User } from "@/db/schema";
import { logout } from "@/app/auth-actions";
import { can } from "@/lib/session";
import { label } from "@/lib/format";
import { NavLink } from "./NavLink";
import { Logo } from "./Logo";

export function Sidebar({ businesses, user, unread = 0 }: { businesses: Business[]; user: User; unread?: number }) {
  const financials = can(user, "view_financials");
  const linkFor = (b: Business) => (financials ? `/b/${b.slug}` : `/b/${b.slug}/leads`);
  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-b border-line bg-panel p-3 md:sticky md:top-0 md:h-screen md:w-60 md:border-r md:border-b-0">
      <Link href={financials ? "/" : businesses[0] ? linkFor(businesses[0]) : "/account"} className="px-2" aria-label="Nucleus home">
        <Logo className="h-9" />
      </Link>
      <nav className="flex flex-col gap-0.5">
        {financials && businesses.length > 1 && (
          <NavLink href="/" exact>
            <span className="h-2.5 w-2.5 rounded-sm bg-ink" /> All businesses
          </NavLink>
        )}
        <NavLink href="/messages">
          <span className="w-2.5 text-center text-xs">✉</span> Messages
          {unread > 0 && <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-white" title={`${unread} not replied yet`}>{unread > 99 ? "99+" : unread}</span>}
        </NavLink>
      </nav>
      <div className="flex flex-col gap-0.5">
        <div className="px-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-muted">Businesses</div>
        {businesses.length === 0 && <p className="px-2.5 text-xs text-muted">No businesses assigned yet.</p>}
        {businesses.map((b) => (
          <NavLink key={b.id} href={`/b/${b.slug}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
            <span className="truncate">{b.name}</span>
          </NavLink>
        ))}
        {can(user, "manage_business") && (
          <NavLink href="/businesses/new" className="mt-1">
            <span className="w-2.5 text-center">+</span> Add business
          </NavLink>
        )}
      </div>
      <div className="flex flex-col gap-0.5 md:mt-auto">
        {can(user, "manage_team") && <NavLink href="/team">Team</NavLink>}
        <NavLink href="/account">
          <span className="truncate">{user.name}</span>
          <span className="ml-auto text-xs text-muted">{label(user.role)}</span>
        </NavLink>
        <form action={logout}>
          <button className="px-2.5 py-1.5 text-sm text-muted hover:text-ink">Sign out</button>
        </form>
      </div>
    </aside>
  );
}
