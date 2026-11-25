import { Sidebar } from "@/components/Sidebar";
import { requireSession } from "@/lib/session";
import { pendingMigrations } from "@/lib/db-health";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // A database that's missing updates would otherwise fail with a blank "Application error".
  const help = await pendingMigrations();
  if (help) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="card w-full max-w-lg space-y-3 p-6">
          <h1 className="text-xl font-semibold">Nucleus needs a quick fix</h1>
          <p className="text-sm">{help}</p>
          <p className="text-xs text-muted">This message only appears while the database isn&apos;t ready.</p>
        </div>
      </main>
    );
  }
  const { user, businesses } = await requireSession();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar businesses={businesses} user={user} />
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
