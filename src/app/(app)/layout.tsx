import { Sidebar } from "@/components/Sidebar";
import { activeBusinesses } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const businesses = await activeBusinesses();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar businesses={businesses} />
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
