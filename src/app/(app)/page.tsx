import Link from "next/link";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { can, homeFor, requireSession } from "@/lib/session";

export default async function Overview({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const session = await requireSession();
  if (!can(session.user, "view_financials")) redirect(homeFor(session));
  const { range } = await searchParams;
  const list = session.businesses;
  if (!list.length)
    return (
      <div className="card mx-auto mt-16 max-w-md text-center">
        <h1 className="text-lg font-semibold">No businesses yet</h1>
        {can(session.user, "manage_business") ? (
          <>
            <p className="mt-1 text-sm text-muted">Add your first business to start tracking leads, jobs and revenue.</p>
            <Link href="/businesses/new" className="btn mt-4">Add business</Link>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">You haven&apos;t been given access to a business yet. Ask the owner.</p>
        )}
      </div>
    );
  return (
    <Dashboard
      title={list.length > 1 ? "All businesses" : list[0].name}
      subtitle={list.length > 1 ? `Combined view across ${list.length} businesses` : undefined}
      list={list}
      range={range}
    />
  );
}
