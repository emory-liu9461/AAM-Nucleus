import { Sidebar } from "@/components/Sidebar";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, businesses } = await requireSession();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar businesses={businesses} user={user} />
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
