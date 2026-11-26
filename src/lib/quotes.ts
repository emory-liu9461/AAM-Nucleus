import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business, Quote, QuoteSettings } from "@/db/schema";
import { sendWelcome } from "./workflow";
import { notify } from "./alerts";
import { moneyExact } from "./format";

/*
 * Quotes: defaults, numbering, and winning the lead when a customer accepts.
 * Pricing itself is in quote-math.ts (shared with the builder in the browser).
 */

const { quotes, leads, jobs, contacts } = schema;

const MATERIALS: [RegExp, QuoteSettings["materials"]][] = [
  [/paint|stain|coating/i, [
    { name: "Paint, premium interior", unit: "gallon", unitCost: 65 },
    { name: "Paint, exterior", unit: "gallon", unitCost: 75 },
    { name: "Primer", unit: "gallon", unitCost: 45 },
    { name: "Ceiling paint", unit: "gallon", unitCost: 50 },
    { name: "Trim enamel", unit: "quart", unitCost: 30 },
    { name: "Deck / fence stain", unit: "gallon", unitCost: 60 },
    { name: "Caulking", unit: "tube", unitCost: 9 },
    { name: "Drywall compound", unit: "bucket", unitCost: 25 },
    { name: "Tape, plastic and drop cloths", unit: "room", unitCost: 15 },
    { name: "Rollers, brushes and trays", unit: "job", unitCost: 40 },
  ]],
  [/clean|janitor|maid/i, [
    { name: "Cleaning supplies", unit: "visit", unitCost: 20 },
    { name: "Green / specialty products", unit: "visit", unitCost: 15 },
    { name: "Floor care products", unit: "visit", unitCost: 12 },
    { name: "Window cleaning supplies", unit: "visit", unitCost: 10 },
    { name: "Garbage bags and liners", unit: "box", unitCost: 18 },
    { name: "Disposal / dump fee", unit: "load", unitCost: 75 },
  ]],
  [/roof/i, [
    { name: "Architectural shingles", unit: "bundle", unitCost: 45 },
    { name: "Underlayment", unit: "roll", unitCost: 120 },
    { name: "Ice and water shield", unit: "roll", unitCost: 150 },
    { name: "Drip edge", unit: "10 ft", unitCost: 15 },
    { name: "Roofing nails", unit: "box", unitCost: 60 },
    { name: "Dumpster / disposal", unit: "load", unitCost: 450 },
  ]],
  [/.*/, [
    { name: "Lumber", unit: "piece", unitCost: 12 },
    { name: "Drywall sheet", unit: "sheet", unitCost: 18 },
    { name: "Fasteners", unit: "box", unitCost: 25 },
    { name: "Concrete mix", unit: "bag", unitCost: 9 },
    { name: "Dumpster / disposal", unit: "load", unitCost: 450 },
  ]],
];

export function quoteSettings(b: Pick<Business, "quoteSettings" | "trade">) {
  const q: QuoteSettings = b.quoteSettings ?? {};
  return {
    hourlyCost: q.hourlyCost ?? 35,
    marginPercent: q.marginPercent ?? 30,
    materials: q.materials?.length ? q.materials : defaultMaterials(b.trade),
    validDays: q.validDays ?? 30,
    terms: q.terms ?? "Price includes labour, materials and clean-up. A deposit may be required to book your start date. Any changes to the scope will be quoted before the work is done.",
  };
}
export const defaultMaterials = (trade: string) => MATERIALS.find(([re]) => re.test(trade))![1]!;

export async function nextQuoteNumber(b: Business) {
  const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(quotes).where(eq(quotes.businessId, b.id));
  const prefix = b.slug.split("-").map((p) => p[0]).join("").toUpperCase().slice(0, 3);
  return `Q-${prefix}-${1001 + Number(c)}`;
}

/**
 * Win a lead: mark it Won and create its job once (with the customer-workflow welcome message).
 * A quote's price and cost become the job's contract value and estimated cost.
 */
export async function winLead(b: Business, leadId: string, opts: { userId?: string | null; contractValue?: number; estimatedCost?: number } = {}) {
  const [lead] = await db.update(leads).set({ stage: "won", closedAt: new Date(), ...(opts.contractValue ? { estimatedValue: opts.contractValue } : {}) }).where(and(eq(leads.id, leadId), eq(leads.businessId, b.id))).returning();
  if (!lead) return null;
  const [existing] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.leadId, lead.id));
  if (existing) {
    if (opts.contractValue) await db.update(jobs).set({ contractValue: opts.contractValue, ...(opts.estimatedCost ? { estimatedCost: opts.estimatedCost } : {}) }).where(eq(jobs.id, existing.id));
    return existing.id;
  }
  const [c] = await db.select().from(contacts).where(eq(contacts.id, lead.contactId));
  const [job] = await db
    .insert(jobs)
    .values({
      businessId: b.id,
      contactId: lead.contactId,
      leadId: lead.id,
      name: `${lead.title} – ${c?.lastName || c?.firstName || "Customer"}`,
      contractValue: opts.contractValue ?? lead.estimatedValue,
      estimatedCost: opts.estimatedCost ?? 0,
      address: [c?.address, c?.city].filter(Boolean).join(", ") || null,
    })
    .returning({ id: jobs.id });
  await sendWelcome(b, job.id, { userId: opts.userId ?? null }).catch((e) => console.error("welcome message:", e));
  return job.id;
}

/** The customer accepted the quote online: win the lead, create the job, tell the team. */
export async function acceptQuote(b: Business, q: Quote) {
  if (q.status === "accepted") return q.jobId;
  let jobId: string | null = null;
  if (q.leadId) jobId = await winLead(b, q.leadId, { contractValue: q.price, estimatedCost: q.cost });
  await db.update(quotes).set({ status: "accepted", acceptedAt: new Date(), jobId, updatedAt: new Date() }).where(eq(quotes.id, q.id));
  // Other open quotes on the same lead are no longer needed.
  if (q.leadId) await db.update(quotes).set({ status: "declined", declinedAt: new Date() }).where(and(eq(quotes.leadId, q.leadId), sql`${quotes.id} <> ${q.id}`, sql`${quotes.status} in ('draft','approved','sent')`));
  const [c] = await db.select({ first: contacts.firstName, last: contacts.lastName }).from(contacts).where(eq(contacts.id, q.contactId));
  await notify(b, "newLead", { title: `Quote accepted: ${q.number} (${moneyExact(q.total)})`, detail: `${`${c?.first ?? ""} ${c?.last ?? ""}`.trim()} accepted "${q.title}". The job has been created.`, path: jobId ? `/b/${b.slug}/jobs` : `/b/${b.slug}/quotes/${q.id}` });
  return jobId;
}

/** Latest quote per lead (for the Leads tab totals and the customer profile). */
export async function latestQuotes(businessId: string) {
  return db
    .selectDistinctOn([quotes.leadId], { leadId: quotes.leadId, id: quotes.id, status: quotes.status, price: quotes.price, cost: quotes.cost, total: quotes.total, number: quotes.number })
    .from(quotes)
    .where(and(eq(quotes.businessId, businessId), sql`${quotes.leadId} is not null`, sql`${quotes.status} <> 'declined'`))
    .orderBy(quotes.leadId, desc(quotes.createdAt));
}
