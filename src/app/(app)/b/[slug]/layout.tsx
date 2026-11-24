import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { NavLink } from "@/components/NavLink";
import { can, requireBusiness, type Permission } from "@/lib/session";

const TABS: [string, string, Permission | null][] = [
  ["", "Dashboard", "view_financials"],
  ["/leads", "Leads", null],
  ["/inbox", "Inbox", null],
  ["/contacts", "Contacts", null],
  ["/jobs", "Jobs", null],
  ["/invoices", "Invoices", "manage_invoices"],
  ["/schedule", "Schedule", null],
  ["/social", "Social", "manage_business"],
  ["/settings", "Settings", "manage_business"],
];

export default async function BusinessLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business: b, user } = await requireBusiness(slug);
  const base = `/b/${b.slug}`;
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.leads)
    .where(and(eq(schema.leads.businessId, b.id), eq(schema.leads.stage, "new")));
  const newLeads = Number(n);
  // Conversations whose latest message is from the customer (waiting for a reply).
  const waiting = await db.execute(sql`
    select count(*)::int as n from (
      select distinct on (m.conversation_id) m.author
      from inbox_messages m where m.business_id = ${b.id} and m.created_at > now() - interval '14 days'
      order by m.conversation_id, m.created_at desc
    ) x where x.author = 'customer'`);
  const inboxWaiting = Number((waiting as unknown as { n: number }[])[0]?.n ?? 0);
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
            {name === "Inbox" && inboxWaiting > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-white" title={`${inboxWaiting} waiting for a reply`}>{inboxWaiting}</span>
            )}
            {name === "Leads" && newLeads > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-white" title={`${newLeads} new`}>{newLeads}</span>
            )}
          </NavLink>
        ))}
      </nav>
      {children}
    </div>
  );
}
