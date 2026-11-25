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
import { moneyExact } from "@/lib/format";

const { businesses, invoices, payments, contacts } = schema;

/* ---------- Settings → Online payments (owner) ---------- */

export async function savePaymentSettings(slug: string, _: FormState, form: FormData): Promise<FormState> {
  const { business: b } = await requireBusiness(slug, "manage_business");
  const cur: PaymentSettings = b.paymentSettings ?? {};
  const next: PaymentSettings = {
    ...cur,
    etransferEmail: String(form.get("etransferEmail") ?? "").trim().toLowerCase().slice(0, 200) || undefined,
    etransferNote: String(form.get("etransferNote") ?? "").trim().slice(0, 500) || undefined,
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
  await db.update(businesses).set({ paymentSettings: { etransferEmail: cur.etransferEmail, etransferNote: cur.etransferNote } }).where(eq(businesses.id, b.id));
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
  const ways = cardPaymentsOn(b) ? "by card or e-Transfer" : "by e-Transfer";
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
