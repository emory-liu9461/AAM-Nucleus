import { NavLink } from "@/components/NavLink";
import { can, requireBusiness, type Permission } from "@/lib/session";

const TABS: [string, string, Permission | null][] = [
  ["", "Dashboard", "view_financials"],
  ["/leads", "Leads", null],
  ["/contacts", "Contacts", null],
  ["/jobs", "Jobs", null],
  ["/invoices", "Invoices", "manage_invoices"],
  ["/schedule", "Schedule", null],
  ["/website", "Website", "manage_business"],
  ["/settings", "Settings", "manage_business"],
];

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business: b, user } = await requireBusiness(slug);
  const base = `/b/${b.slug}`;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="h-3 w-3 rounded-full" style={{ background: b.color }} />
        <span className="font-semibold text-ink">{b.name}</span>
        <span>· {b.trade}</span>
        {b.archived && <span className="pill bg-gray-500/15">Archived</span>}
      </div>
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-line pb-2">
        {TABS.filter(([, , perm]) => !perm || can(user, perm)).map(([path, name]) => (
          <NavLink key={name} href={base + path} exact={path === ""} className="shrink-0">
            {name}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  );
}
