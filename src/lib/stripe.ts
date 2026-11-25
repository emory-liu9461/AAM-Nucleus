import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Business, Invoice } from "@/db/schema";
import { open } from "./secret-box";
import { notify } from "./alerts";
import { moneyExact } from "./format";

/*
 * Card payments through each business's own Stripe account (payouts go straight to that
 * business). The customer opens /pay/<token>, taps Pay by card, pays on Stripe's hosted
 * Checkout page, and the payment is recorded on the invoice: when they come back, and by
 * Stripe's webhook (/api/stripe/webhook/<business id>) in case they don't.
 */

const { invoices, payments } = schema;
const api = () => (process.env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/$/, "");
export const currency = () => (process.env.CURRENCY ?? "CAD").toLowerCase();

export const stripeKey = (b: Pick<Business, "paymentSettings">) => open(b.paymentSettings?.stripeKey);
export const stripeWebhookSecret = (b: Pick<Business, "paymentSettings">) => open(b.paymentSettings?.stripeWebhookSecret);
export const cardPaymentsOn = (b: Pick<Business, "paymentSettings">) => Boolean(stripeKey(b));

/** Stripe's form encoding, with nested keys like line_items[0][price_data][currency]. */
function encode(params: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(params).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) return [];
    if (typeof v === "object") return encode(Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [i, x])) : (v as Record<string, unknown>), key);
    return [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`];
  });
}

async function stripe<T>(key: string, method: "GET" | "POST", path: string, params?: Record<string, unknown>): Promise<T> {
  const body = params ? encode(params).join("&") : undefined;
  const res = await fetch(`${api()}${path}${method === "GET" && body ? `?${body}` : ""}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" },
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe error ${res.status}`);
  return json;
}

/** Checks a key and returns the account's display name. */
export async function stripeAccountName(key: string) {
  const a = await stripe<{ id: string; email?: string; settings?: { dashboard?: { display_name?: string } }; business_profile?: { name?: string } }>(key, "GET", "/v1/account");
  return a.settings?.dashboard?.display_name || a.business_profile?.name || a.email || a.id;
}

type CheckoutSession = { id: string; url?: string; payment_status?: string; amount_total?: number; currency?: string; metadata?: Record<string, string>; payment_intent?: string | null };

/** A Stripe Checkout page for the invoice's remaining balance. */
export async function createCheckout(b: Business, inv: Invoice, balance: number, opts: { baseUrl: string; email?: string | null }) {
  const key = stripeKey(b);
  if (!key) throw new Error("Card payments aren't set up for this business.");
  const back = `${opts.baseUrl}/pay/${inv.payToken}`;
  const s = await stripe<CheckoutSession>(key, "POST", "/v1/checkout/sessions", {
    mode: "payment",
    client_reference_id: inv.id,
    customer_email: opts.email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: currency(), unit_amount: balance, product_data: { name: `Invoice ${inv.number} – ${b.name}`, description: inv.description || undefined } } }],
    metadata: { invoice_id: inv.id, business_id: b.id },
    payment_intent_data: { metadata: { invoice_id: inv.id, business_id: b.id }, description: `Invoice ${inv.number}` },
    success_url: `${back}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: back,
  });
  if (!s.url) throw new Error("Stripe didn't return a payment page.");
  return s.url;
}

export async function getCheckout(b: Business, sessionId: string) {
  const key = stripeKey(b);
  if (!key || !/^cs_[\w]+$/.test(sessionId)) return null;
  return stripe<CheckoutSession>(key, "GET", `/v1/checkout/sessions/${sessionId}`);
}

/** Record a paid Checkout session on its invoice (once). Returns the amount recorded, or 0. */
export async function recordCheckout(b: Business, s: CheckoutSession) {
  const invoiceId = s.metadata?.invoice_id;
  if (s.payment_status !== "paid" || !invoiceId || !s.amount_total || s.metadata?.business_id !== b.id) return 0;
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, b.id)));
  if (!inv) return 0;
  const inserted = await db
    .insert(payments)
    .values({ businessId: b.id, invoiceId: inv.id, amount: s.amount_total, method: "card", reference: `stripe:${s.id}` })
    .onConflictDoNothing()
    .returning({ id: payments.id });
  if (!inserted.length) return 0; // already recorded
  const [{ paid }] = await db.select({ paid: sql<number>`coalesce(sum(${payments.amount}),0)` }).from(payments).where(eq(payments.invoiceId, inv.id));
  await db.update(invoices).set({ status: Number(paid) >= inv.amount ? "paid" : "partial" }).where(eq(invoices.id, inv.id));
  await notify(b, "payment", { title: `Paid online: ${moneyExact(s.amount_total)} on ${inv.number}`, detail: Number(paid) >= inv.amount ? "Invoice paid in full" : `Balance left ${moneyExact(inv.amount - Number(paid))}`, path: `/b/${b.slug}/invoices` });
  return s.amount_total;
}

/** Stripe's webhook signature: "t=<time>,v1=<hmac of `${t}.${body}`>", within 5 minutes. */
export function verifyStripeSignature(body: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => {
    const sig = Buffer.from(p.slice(3), "hex");
    const exp = Buffer.from(expected, "hex");
    return sig.length === exp.length && timingSafeEqual(sig, exp);
  });
}
