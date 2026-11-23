import { redirect } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { can, requireBusiness } from "@/lib/session";

export default async function BusinessDashboard({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ range?: string }> }) {
  const [{ slug }, { range }] = await Promise.all([params, searchParams]);
  const { business: b, user } = await requireBusiness(slug);
  if (!can(user, "view_financials")) redirect(`/b/${b.slug}/leads`);
  return <Dashboard title="Dashboard" list={[b]} range={range} />;
}
