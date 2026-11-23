import { Dashboard } from "@/components/Dashboard";
import { getBusiness } from "@/lib/business";

export default async function BusinessDashboard({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ range?: string }> }) {
  const [{ slug }, { range }] = await Promise.all([params, searchParams]);
  const b = await getBusiness(slug);
  return <Dashboard title="Dashboard" list={[b]} range={range} />;
}
