import Link from "next/link";
import { Dashboard } from "@/components/Dashboard";
import { activeBusinesses } from "@/lib/metrics";

export default async function Overview({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range } = await searchParams;
  const list = await activeBusinesses();
  if (!list.length)
    return (
      <div className="card mx-auto mt-16 max-w-md text-center">
        <h1 className="text-lg font-semibold">No businesses yet</h1>
        <p className="mt-1 text-sm text-muted">Add your first business to start tracking leads, jobs and revenue.</p>
        <Link href="/businesses/new" className="btn mt-4">Add business</Link>
      </div>
    );
  return <Dashboard title="All businesses" subtitle={`Combined view across ${list.length} businesses`} list={list} range={range} />;
}
