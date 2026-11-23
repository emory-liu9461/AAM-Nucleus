import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSession, homeFor } from "@/lib/session";
import { LoginForm, SetupForm } from "./forms";
import { explainDbError } from "@/lib/db-health";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  let needsSetup = false;
  let session = null;
  try {
    session = await getSession();
    const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(schema.users);
    needsSetup = Number(c) === 0;
  } catch (err) {
    const help = explainDbError(err);
    if (!help) throw err;
    console.error("Database problem on /login:", err);
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
  if (session) redirect(homeFor(session));
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="mb-2"><Logo className="h-12" /></h1>
          <p className="text-sm text-muted">{needsSetup ? "Create the owner account" : "Sign in to your dashboard"}</p>
        </div>
        {needsSetup ? <SetupForm /> : <LoginForm />}
      </div>
    </main>
  );
}
