import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { QuoteDocument } from "@/components/QuoteDocument";
import { PrintButton } from "@/components/PrintButton";
import { can, getSession } from "@/lib/session";
import { logoUrl } from "@/lib/site-defaults";
import { quoteSettings } from "@/lib/quotes";

/* Printable quote, internal (costs) or external (customer): /print/quote/<id>?v=internal|external. Sign-in required. */

export const metadata: Metadata = { title: "Quote", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PrintQuote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const [{ id }, { v }] = await Promise.all([params, searchParams]);
  const s = await getSession();
  if (!s) redirect("/login");
  if (!/^[0-9a-f-]{36}$/.test(id) || !can(s.user, "view_financials")) notFound();
  const [row] = await db.select({ q: schema.quotes, b: schema.businesses, c: schema.contacts }).from(schema.quotes).innerJoin(schema.businesses, eq(schema.businesses.id, schema.quotes.businessId)).innerJoin(schema.contacts, eq(schema.contacts.id, schema.quotes.contactId)).where(eq(schema.quotes.id, id));
  if (!row || !s.businesses.some((b) => b.id === row.b.id)) notFound();
  const variant = v === "internal" ? "internal" : "external";
  return (
    <main className="mx-auto max-w-3xl bg-white p-6 print:max-w-none print:p-0">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <span className="text-sm text-muted">{variant === "internal" ? "Internal version (our costs)" : "External version (for the customer)"}</span>
        <PrintButton />
      </div>
      <QuoteDocument q={row.q} b={row.b} c={row.c} variant={variant} logo={logoUrl(row.b)} terms={quoteSettings(row.b).terms} />
    </main>
  );
}
