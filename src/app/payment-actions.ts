"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FormState } from "@/app/auth-actions";
import type { PaymentSettings } from "@/db/schema";
import { requireBusiness } from "@/lib/session";
import { seal } from "@/lib/secret-box";
import { cardPaymentsOn, createCheckout, stripeAccountName } from "@/lib/stripe";
import { appBase, toE164, twilioConfigured } from "@/lib/twilio";
import { sendBusinessSms, phoneSettings } from "@/lib/sms";
import { emailSettings, postmarkConfigured, sendBusinessEmail } from "@/lib/email";
import { dollarsToCents, moneyExact } from "@/lib/format";
import { PAYMENT_METHODS, joinWays, needsConfirming, paymentLabel, paymentWays, syncInvoiceStatus, type PaymentMethod } from "@/lib/payments";
import { businessTz } from "@/lib/calendar";
import { zonedToUtc } from "@/lib/availability";

const { businesses, invoices, payments, contacts } = schema;

/* ---------- Settings → Online payments (owner) ---------- */

export async function savePaymentSettings(slug: string, _: FormState, form: FormData): Promise<FormState> {
  const { business: b } = await requireBusiness(slug, "manage_business");
  const cur: PaymentSettings = b.paymentSettings ?? {};
  const next: PaymentSettings = {
    ...cur,
    etransferEmail: String(form.get("etransferEmail") ?? "").trim().toLowerCase().slice(0, 200) || undefined,
    etransferNote: String(form.get("etransferNote") ?? "").trim().slice(0, 500) || undefined,
    chequePayableTo: String(form.get("chequePayableTo") ?? "").trim().slice(0, 200) || undefined,
    chequeAddress: String(form.get("chequeAddress") ?? "").trim().slice(0, 300) || undefined,
    cashNote: String(form.get("cashNote") ?? "").trim().slice(0, 300) || undefined,
    instructions: String(form.get("instructions") ?? "").trim().slice(0, 1000) || undefined,
  };
  if (next.etransferEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.etransferEmail)) return { error: "The e-Transfer email doesn't look right." };
  const key = String(form.get("stripeKey") ?? "").trim();
  const hook = String(form.get("stripeWebhookSecret") ?? "").trim();
  let note = "";
  if (key) {
    if (!/^(sk|rk)_(live|test)_[\w]+$/.test(key)) return { error: "The Stripe key should start with sk_live_ (or rk_live_ for a restricted key; _test_ for test mode)." };
    try {
      next.stripeAccount = await stripeAccountName(key);
    } catch (e) {
      return { error: `Stripe didn't accept that key: ${e instanceof Error ? e.message : "unknown error"}` };
    }
    next.stripeKey = seal(key);
    note = ` Connected to Stripe account “${next.stripeAccount}”${key.includes("_test_") ? " (test mode)" : ""}.`;
  }
  if (hook) {
    if (!/^whsec_[\w]+$/.test(hook)) return { error: "The webhook signing secret should start with whsec_." };
    next.stripeWebhookSecret = seal(hook);
  }
  await db.update(businesses).set({ paymentSettings: next }).where(eq(businesses.id, b.id));
  revalidatePath(`/b/${slug}`, "layout");
  return { ok: `Saved.${note}` };
}

export async function disconnectStripe(slug: string) {
  const { business: b } = await requireBusiness(slug, "manage_business");
  const cur = b.paymentSettings ?? {};
  await db.update(businesses).set({ paymentSettings: { etransferEmail: cur.etransferEmail, etransferNote: cur.etransferNote, chequePayableTo: cur.chequePayableTo, chequeAddress: cur.chequeAddress, cashNote: cur.cashNote, instructions: cur.instructions } }).where(eq(businesses.id, b.id));
  revalidatePath(`/b/${slug}`, "layout");
}

/* ---------- send an invoice's payment link to the customer ---------- */

export async function sendInvoiceLink(slug: string, invoiceId: string, _: FormState, _f: FormData): Promise<FormState> {
  const { business: b, user } = await requireBusiness(slug, "manage_invoices");
  const [row] = await db
    .select({ inv: invoices, c: contacts, paid: sql<number>`(select coalesce(sum(p.amount),0) from payments p where p.invoice_id = "invoices"."id")` })
    .from(invoices)
    .innerJoin(contacts, eq(contacts.id, invoices.contactId))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, b.id)));
  if (!row) return { error: "Invoice not found." };
  const { inv, c } = row;
  const balance = inv.amount - Number(row.paid);
  if (balance <= 0 || inv.status === "void") return { error: "Nothing left to pay on this invoice." };
  const link = `${appBase(await headers())}/pay/${inv.payToken}`;
  const list = paymentWays(b, cardPaymentsOn(b));
  const ways = list.length ? `by ${joinWays(list)}` : "and see how to pay";
  const text = `Hi ${c.firstName || "there"}, here's invoice ${inv.number} from ${b.name} for ${moneyExact(balance)}${inv.dueAt ? `, due ${new Date(`${inv.dueAt}T12:00:00Z`).toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" })}` : ""}. View and pay ${ways}: ${link}`;
  const used: string[] = [];
  const problems: string[] = [];
  const phone = toE164(c.phone);
  if (phone && !c.smsOptOut && phoneSettings(b).number && twilioConfigured()) {
    const r = await sendBusinessSms(b, phone, text, { contactId: c.id, author: "staff", sentById: user.id });
    if ("error" in r && r.error) problems.push(r.error);
    else used.push("text");
  }
  if (c.email && emailSettings(b).fromAddress && postmarkConfigured()) {
    const r = await sendBusinessEmail(b, c.email, `Invoice ${inv.number} from ${b.name}`, text, { contactId: c.id, author: "staff", sentById: user.id });
    if ("error" in r && r.error) problems.push(r.error);
    else used.push("email");
  }
  if (!used.length) return { error: problems[0] ?? "Couldn't send: the customer has no phone/email, or texting and email aren't set up yet. Copy the link instead." };
  return { ok: `Sent by ${used.join(" and ")}.` };
}

/* ---------- the customer's Pay by card button (public: the invoice's secret link is the key) ---------- */

export async function startCardPayment(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) redirect("/");
  const [row] = await db
    .select({ inv: invoices, b: businesses, email: contacts.email, paid: sql<number>`(select coalesce(sum(p.amount),0) from payments p where p.invoice_id = "invoices"."id")` })
    .from(invoices)
    .innerJoin(businesses, eq(businesses.id, invoices.businessId))
    .innerJoin(contacts, eq(contacts.id, invoices.contactId))
    .where(eq(invoices.payToken, token));
  if (!row || row.inv.status === "void") redirect(`/pay/${token}`);
  const balance = row.inv.amount - Number(row.paid);
  if (balance <= 0) redirect(`/pay/${token}`);
  let url: string;
  try {
    url = await createCheckout(row.b, row.inv, balance, { baseUrl: appBase(await headers()), email: row.email });
  } catch (e) {
    console.error("checkout failed", e);
    redirect(`/pay/${token}?error=1`);
  }
  redirect(url);
}

/* ---------- Recording payments (Invoices page) ---------- */

export async function recordPayment(slug: string, invoiceId: string, _: FormState, form: FormData): Promise<FormState> {
  const { business: b, user } = await requireBusiness(slug, "manage_invoices");
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, b.id)));
  if (!inv || inv.status === "void") return { error: "Invoice not found." };
  const [{ paid }] = await db.select({ paid: sql<number>`coalesce(sum(${payments.amount}),0)` }).from(payments).where(eq(payments.invoiceId, inv.id));
  const balance = inv.amount - Number(paid);
  const amount = dollarsToCents(form.get("amount"));
  if (!(amount > 0)) return { error: "Enter the amount received." };
  if (amount > balance) return { error: `That's more than the ${moneyExact(balance)} left on this invoice.` };
  const method = String(form.get("method") ?? "") as PaymentMethod;
  if (!PAYMENT_METHODS.some(([k]) => k === method)) return { error: "Choose how it was paid." };
  const reference = String(form.get("reference") ?? "").trim().slice(0, 200) || null;
  if (method === "other" && !reference) return { error: "For Other, add a note saying how it was paid." };
  // The day it was received (defaults to now); noon in the business's time zone for past days.
  let receivedAt = new Date();
  const day = String(form.get("receivedOn") ?? "");
  const tz = businessTz(b);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day !== today) {
    if (day > today) return { error: "The payment date can't be in the future." };
    const [y, m, d] = day.split("-").map(Number);
    receivedAt = new Date(zonedToUtc(y, m, d, 12, 0, tz));
  }
  const owner = user.role === "owner";
  await db.insert(payments).values({
    businessId: b.id, invoiceId: inv.id, amount, method, reference, receivedAt, createdById: user.id,
    confirmedAt: needsConfirming(method, owner) ? null : new Date(), confirmedById: needsConfirming(method, owner) ? null : user.id,
  });
  const total = await syncInvoiceStatus(inv);
  revalidatePath(`/b/${slug}`, "layout");
  revalidatePath("/");
  const left = inv.amount - total;
  return { ok: `${moneyExact(amount)} by ${paymentLabel(method)} recorded. ${left > 0 ? `${moneyExact(left)} left.` : "Paid in full."}${needsConfirming(method, owner) ? " An owner will confirm it." : ""}` };
}

/** An owner confirms cash or a cheque someone else collected was handed in. */
export async function confirmPayment(slug: string, paymentId: string) {
  const { business: b, user } = await requireBusiness(slug, "manage_invoices");
  if (user.role !== "owner") throw new Error("Only an owner can confirm cash and cheques.");
  await db.update(payments).set({ confirmedAt: new Date(), confirmedById: user.id }).where(and(eq(payments.id, paymentId), eq(payments.businessId, b.id), sql`${payments.confirmedAt} is null`));
  revalidatePath(`/b/${slug}`, "layout");
}

/** Undo a payment recorded by mistake (not card payments taken online: refund those in Stripe). */
export async function deletePayment(slug: string, paymentId: string) {
  const { business: b, user } = await requireBusiness(slug, "manage_invoices");
  const [p] = await db.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.businessId, b.id)));
  if (!p) return;
  if (p.reference?.startsWith("stripe:")) throw new Error("Card payments taken online can't be removed here. Refund them in Stripe.");
  if (p.confirmedAt && p.createdById !== user.id && user.role !== "owner") throw new Error("Only an owner can remove a payment someone else recorded.");
  await db.delete(payments).where(eq(payments.id, p.id));
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, p.invoiceId));
  if (inv) await syncInvoiceStatus(inv);
  revalidatePath(`/b/${slug}`, "layout");
  revalidatePath("/");
}

/** Remove-button form wrapper: shows the reason instead of crashing when it isn't allowed. */
export async function removePayment(slug: string, paymentId: string, _: FormState, _f: FormData): Promise<FormState> {
  try {
    await deletePayment(slug, paymentId);
    return { ok: "Removed." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't remove it." };
  }
}
