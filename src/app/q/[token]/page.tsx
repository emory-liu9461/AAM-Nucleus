import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { customerAcceptQuote, customerDeclineQuote } from "@/app/quote-actions";
import { getSession } from "@/lib/session";
import { logoUrl } from "@/lib/site-defaults";
import { quoteSettings } from "@/lib/quotes";
import { fmtDate, moneyExact } from "@/lib/format";
import { QuoteDocument } from "@/components/QuoteDocument";

/* The customer's quote (/q/<token>): what's included, the price with tax, and Accept / Decline. */

export const metadata: Metadata = { title: "Your quote", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CustomerQuote({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ preview?: string; expired?: string }> }) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const [row] = await db
    .select({ q: schema.quotes, b: schema.businesses, c: schema.contacts })
    .from(schema.quotes)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.quotes.businessId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.quotes.contactId))
    .where(eq(schema.quotes.token, token));
  if (!row) notFound();
  const { q, b, c } = row;
  // Drafts are only visible to the team, as a preview.
  const session = sp.preview ? await getSession() : null;
  const teamPreview = Boolean(session?.businesses.some((x) => x.id === b.id));
  if (q.status === "draft" && !teamPreview) notFound();
  if (!teamPreview && !q.viewedAt && (q.status === "sent" || q.status === "approved")) await db.update(schema.quotes).set({ viewedAt: new Date() }).where(eq(schema.quotes.id, q.id));

  const today = new Date().toISOString().slice(0, 10);
  const expired = Boolean(q.validUntil && q.validUntil < today && (q.status === "sent" || q.status === "approved"));
  const open = (q.status === "sent" || q.status === "approved") && !expired;
  const s = quoteSettings(b);
  const logo = logoUrl(b);

  return (
    <div className="min-h-screen bg-surface">
      {teamPreview && <div className="bg-accent px-4 py-2 text-center text-sm font-medium text-white">Preview: this is what the customer sees{q.status === "draft" ? " once the quote is approved and sent" : ""}. Costs and margins are never shown.</div>}
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <span className="font-semibold">{b.name}</span>
          {b.phone && <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`} className="text-sm font-medium text-muted hover:text-ink">{b.phone}</a>}
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {q.status === "accepted" && <div className="card border-good/40 bg-good/10 text-sm font-medium">Thank you! You accepted this quote. We&apos;ll be in touch shortly to schedule the work.</div>}
        {q.status === "declined" && <div className="card text-sm">This quote was declined. Questions? Contact {b.name}{b.phone ? ` at ${b.phone}` : ""}.</div>}
        {(expired || sp.expired) && q.status !== "accepted" && <div className="card border-bad/40 bg-bad/10 text-sm">This quote expired on {fmtDate(q.validUntil!)}. Contact {b.name} for an updated price.</div>}

        <QuoteDocument q={q} b={b} c={c} variant="external" logo={logo} terms={s.terms} />

        {open && !teamPreview && (
          <section className="card space-y-3">
            <form action={customerAcceptQuote.bind(null, token)}>
              <button className="btn w-full py-3 text-base" style={{ background: b.color }}>Accept quote ({moneyExact(q.total)})</button>
            </form>
            <p className="text-center text-xs text-muted">By accepting you agree to the price and terms above. We&apos;ll contact you to schedule the work.</p>
            <details className="text-sm">
              <summary className="cursor-pointer text-center text-muted">Not right for you?</summary>
              <form action={customerDeclineQuote.bind(null, token)} className="mt-2 space-y-2">
                <textarea name="reason" rows={2} className="input w-full" placeholder="Optional: let us know why (price, timing, scope…)" />
                <button className="btn-ghost w-full">Decline quote</button>
              </form>
            </details>
          </section>
        )}

        <p className="text-center text-xs text-muted">Questions? Contact {b.name}{b.phone ? ` at ${b.phone}` : ""}{b.email ? ` or ${b.email}` : ""}.</p>
      </main>
    </div>
  );
}
