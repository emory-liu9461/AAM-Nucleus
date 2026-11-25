import { sql } from "drizzle-orm";
import { db } from "@/db";
import journal from "../../drizzle/meta/_journal.json";

/**
 * Turns common database setup problems into a plain-English message, so a
 * missing migration or wrong DATABASE_URL doesn't show up as a blank error page.
 */
export function explainDbError(err: unknown): string | null {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e?.cause?.code ?? e?.code;
  const msg = `${e?.message ?? ""} ${e?.cause?.message ?? ""}`;
  if (code === "42P01" || code === "42703" || code === "42704" || /does not exist/.test(msg))
    return "The database needs updating for this version of Nucleus. On your computer, in the AAM-Nucleus folder, run: git pull, npm install, set DATABASE_URL to your direct Neon connection string, then npm run db:migrate. Reload this page afterwards.";
  if (code === "28P01" || /password authentication failed/i.test(msg))
    return "The database password in DATABASE_URL is wrong. Copy the pooled connection string from Neon again, update DATABASE_URL in Vercel, then redeploy.";
  if (code === "ENOTFOUND" || code === "ECONNREFUSED" || /getaddrinfo|ECONNREFUSED|Invalid URL/i.test(msg) || !process.env.DATABASE_URL)
    return "Nucleus can't reach the database. Check DATABASE_URL in Vercel (Settings → Environment Variables), then redeploy.";
  return null;
}

const MIGRATE_HELP =
  "The database needs updating for this version of Nucleus. On your computer, in the AAM-Nucleus folder, run: git pull, npm install, set DATABASE_URL to your direct Neon connection string, then npm run db:migrate. Reload this page afterwards.";

let upToDate = false; // once the database has every migration, stop checking (per server instance)

/** Null when the database has every migration this version expects; otherwise what to do. */
export async function pendingMigrations(): Promise<string | null> {
  if (upToDate) return null;
  try {
    const rows = (await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)) as unknown as { n: number }[];
    const applied = Number(rows[0]?.n ?? 0);
    const expected = journal.entries.length;
    if (applied >= expected) {
      upToDate = true;
      return null;
    }
    return `${MIGRATE_HELP} (${expected - applied} update${expected - applied === 1 ? "" : "s"} waiting.)`;
  } catch (err) {
    return explainDbError(err);
  }
}
