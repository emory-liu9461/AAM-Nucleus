import { NavLink } from "@/components/NavLink";
import { can, requireBusiness } from "@/lib/session";

export default async function InboxLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business: b, user } = await requireBusiness(slug);
  const base = `/b/${b.slug}/inbox`;
  return (
    <div className="space-y-4">
      <nav className="flex gap-1 text-sm">
        <NavLink href={base} exact>Messages</NavLink>
        <NavLink href={`${base}/calls`}>Calls</NavLink>
        {can(user, "manage_business") && <NavLink href={`${base}/settings`}>Phone &amp; email settings</NavLink>}
      </nav>
      {children}
    </div>
  );
}
