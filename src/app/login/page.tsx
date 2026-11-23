import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSession, homeFor } from "@/lib/session";
import { LoginForm, SetupForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session));
  const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(schema.users);
  const needsSetup = Number(c) === 0;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">Nucleus</h1>
          <p className="text-sm text-muted">{needsSetup ? "Create the owner account" : "Sign in to your dashboard"}</p>
        </div>
        {needsSetup ? <SetupForm /> : <LoginForm />}
      </div>
    </main>
  );
}
