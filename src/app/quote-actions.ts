"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FormState } from "@/app/auth-actions";
import type { QuoteSettings } from "@/db/schema";
import { requireBusiness } from "@/lib/session";
import { cleanItems, quoteTotals } from "@/lib/quote-math";
import { acceptQuote, nextQuoteNumber, quoteSettings } from "@/lib/quotes";
import { appBase, toE164, twilioConfigured } from "@/lib/twilio";
import { phoneSettings, sendBusinessSms, smsConversation } from "@/lib/sms";
import { emailConversation, emailSettings, postmarkConfigured, sendBusinessEmail } from "@/lib/email";
import { moneyExact } from "@/lib/format";
import { notify } from "@/lib/alerts";

// Quotes show costs and margins, so only owners and managers build, approve and send them.
const { quotes, leads, contacts, businesses } = schema;
const refresh = (slug: string) => revalidatePath(`/b/${slug}`, "layout");

export async function createQuote(slug: string, leadId: string) {
  const { business: b, user } = await requireBusiness(slug, "view_financials");
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.businessId, b.id)));
  if (!lead) throw new Error("Lead not found");
  const s = quoteSettings(b);
  const items = { labour: [{ description: "Labour", workers: 2, hours: 8, rate: s.hourlyCost }], materials: [], other: [] };
  const t = quoteTotals(items, { marginType: "percent", marginValue: s.marginPercent, taxRate: b.taxRate, includeTax: true });
  const valid = new Date(Date.now() + s.validDays * 864e5).toISOString().slice(0, 10);
  const [q] = await db
    .insert(quotes)
    .values({
      businessId: b.id, leadId: lead.id, contactId: lead.contactId, number: await nextQuoteNumber(b), title: lead.title,
      scope: lead.notes, items, marginType: "percent", marginValue: String(s.marginPercent),
      cost: t.cost, listPrice: t.listPrice, price: t.price, taxLabel: b.taxRate ? `${b.taxLabel || "Tax"} ${Number(b.taxRate)}%` : null, taxAmount: t.tax, total: t.total,
      validUntil: valid, createdById: user.id,
    })
    .returning({ id: quotes.id });
  refresh(slug);
  redirect(`/b/${slug}/quotes/${q.id}`);
}

/** Save the builder. Editing an approved (not yet sent) quote sends it back for approval. */
export async function saveQuote(slug: string, quoteId: string, _: FormState, form: FormData): Promise<FormState> {
  const { business: b } = await requireBusiness(slug, "view_financials");
  const [q] = await db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.businessId, b.id)));
  if (!q) return { error: "Quote not found." };
  if (q.status === "sent" || q.status === "accepted" || q.status === "declined") return { error: "This quote has gone to the customer. Make a new quote to change it." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("items") ?? "{}"));
  } catch {
    return { error: "Couldn't read the quote lines." };
  }
  const items = cleanItems(raw);
  const marginType = form.get("marginType") === "amount" ? "amount" : "percent";
  const marginValue = String(Math.max(0, Number(form.get("marginValue")) || 0));
  if (marginType === "percent" && Number(marginValue) >= 95) return { error: "A profit margin has to be under 95% of the price." };
  const discountType = form.get("discountType") === "amount" ? "amount" : "percent";
  const discountValue = String(Math.max(0, Number(form.get("discountValue")) || 0));
  if (discountType === "percent" && Number(discountValue) > 100) return { error: "A discount can't be more than 100%." };
  const includeTax = form.get("includeTax") !== "off";
  const t = quoteTotals(items, { marginType, marginValue, discountType, discountValue, includeTax, taxRate: b.taxRate });
  const title = String(form.get("title") ?? "").trim().slice(0, 200) || q.title;
  const validUntil = /^\d{4}-\d{2}-\d{2}$/.test(String(form.get("validUntil"))) ? String(form.get("validUntil")) : q.validUntil;
  await db
    .update(quotes)
    .set({
      title, scope: String(form.get("scope") ?? "").trim().slice(0, 5000) || null, items, marginType, marginValue,
      discountType, discountValue, discount: t.discount, includeTax,
      cost: t.cost, listPrice: t.listPrice, price: t.price, taxLabel: includeTax && b.taxRate ? `${b.taxLabel || "Tax"} ${Number(b.taxRate)}%` : null, taxAmount: t.tax, total: t.total,
      validUntil, status: "draft", approvedAt: null, approvedById: null, updatedAt: new Date(),
    })
    .where(eq(quotes.id, q.id));
  refresh(slug);
  return { ok: `${q.status === "approved" ? "Saved. It needs approving again before it can be sent." : "Saved."} Total ${moneyExact(t.total)}${t.tax ? " incl. tax" : ""}.${t.profit < 0 ? " Warning: the price is below your cost." : ""}` };
}

export async function approveQuote(slug: string, quoteId: string) {
  const { business: b, user } = await requireBusiness(slug, "view_financials");
  await db.update(quotes).set({ status: "approved", approvedById: user.id, approvedAt: new Date(), updatedAt: new Date() }).where(and(eq(quotes.id, quoteId), eq(quotes.businessId, b.id), eq(quotes.status, "draft")));
  refresh(slug);
}

export async function reopenQuote(slug: string, quoteId: string) {
  const { business: b } = await requireBusiness(slug, "view_financials");
  await db.update(quotes).set({ status: "draft", approvedAt: null, approvedById: null, updatedAt: new Date() }).where(and(eq(quotes.id, quoteId), eq(quotes.businessId, b.id), eq(quotes.status, "approved")));
  refresh(slug);
}

/** Text and/or email the customer their quote link. Only approved quotes go out. */
export async function sendQuote(slug: string, quoteId: string, _: FormState, form: FormData): Promise<FormState> {
  const { business: b, user } = await requireBusiness(slug, "view_financials");
  if (!user.canSendQuotes) return { error: "You don't have permission to send quotes. Ask an owner (Team → Can send quotes)." };
  const [row] = await db.select({ q: quotes, c: contacts }).from(quotes).innerJoin(contacts, eq(contacts.id, quotes.contactId)).where(and(eq(quotes.id, quoteId), eq(quotes.businessId, b.id)));
  if (!row) return { error: "Quote not found." };
  const { q, c } = row;
  if (q.status === "draft") return { error: "Approve the quote before sending it." };
  if (q.status === "accepted" || q.status === "declined") return { error: `This quote was already ${q.status}.` };
  const link = `${appBase(await headers())}/q/${q.token}`;
  const text = `Hi ${c.firstName || "there"}, here's your quote from ${b.name} for ${q.title}: ${moneyExact(q.total)}${q.taxAmount ? " incl. tax" : ""}. View the details and accept it online: ${link}`;
  const used: string[] = [];
  const problems: string[] = [];
  const phone = toE164(c.phone);
  if (form.get("sms") === "on" && phone && !c.smsOptOut && phoneSettings(b).number && twilioConfigured()) {
    const conv = await smsConversation(b, phone, c, q.leadId);
    const r = await sendBusinessSms(b, phone, text, { conversationId: conv.id, contactId: c.id, author: "staff", sentById: user.id });
    if ("error" in r && r.error) problems.push(r.error);
    else used.push("text");
  }
  if (form.get("email") === "on" && c.email && emailSettings(b).fromAddress && postmarkConfigured()) {
    const conv = await emailConversation(b, c.email.toLowerCase(), c, q.leadId);
    const r = await sendBusinessEmail(b, c.email, `Your quote from ${b.name}: ${q.title}`, text, { conversationId: conv.id, contactId: c.id, author: "staff", sentById: user.id });
    if ("error" in r && r.error) problems.push(r.error);
    else used.push("email");
  }
  if (!used.length) return { error: problems[0] ?? "Couldn't send: no phone/email, or texting and email aren't set up yet. Copy the link and send it yourself, then mark it sent." };
  await markSentNow(b.id, q.id, q.leadId);
  refresh(slug);
  return { ok: `Quote sent by ${used.join(" and ")}.` };
}

/** You sent the link yourself (copied it into your own email or text). */
export async function markQuoteSent(slug: string, quoteId: string) {
  const { business: b, user } = await requireBusiness(slug, "view_financials");
  if (!user.canSendQuotes) throw new Error("You don't have permission to send quotes");
  const [q] = await db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.businessId, b.id)));
  if (q && q.status === "approved") await markSentNow(b.id, q.id, q.leadId);
  refresh(slug);
}

async function markSentNow(businessId: string, quoteId: string, leadId: string | null) {
  await db.update(quotes).set({ status: "sent", sentAt: new Date(), updatedAt: new Date() }).where(eq(quotes.id, quoteId));
  // The lead moves to "Estimate sent" (unless it's further along).
  if (leadId) await db.update(leads).set({ stage: "estimate_sent" }).where(and(eq(leads.id, leadId), eq(leads.businessId, businessId), sql`${leads.stage} in ('new','contacted','site_visit')`));
}

export async function deleteQuote(slug: string, quoteId: string) {
  const { business: b } = await requireBusiness(slug, "view_financials");
  const [q] = await db.delete(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.businessId, b.id), sql`${quotes.status} in ('draft','approved')`)).returning({ leadId: quotes.leadId });
  refresh(slug);
  redirect(q?.leadId ? `/b/${slug}/leads/${q.leadId}` : `/b/${slug}/leads`);
}

/* ---------- the customer's quote page (/q/<token>): accept or decline ---------- */

async function byToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const [row] = await db.select({ q: quotes, b: businesses }).from(quotes).innerJoin(businesses, eq(businesses.id, quotes.businessId)).where(eq(quotes.token, token));
  return row && row.q.status === "sent" ? row : null; // only quotes that were actually sent
}

export async function customerAcceptQuote(token: string) {
  const row = await byToken(token);
  if (row) {
    if (row.q.validUntil && row.q.validUntil < new Date().toISOString().slice(0, 10)) redirect(`/q/${token}?expired=1`);
    await acceptQuote(row.b, row.q);
  }
  redirect(`/q/${token}`);
}

export async function customerDeclineQuote(token: string, form: FormData) {
  const row = await byToken(token);
  if (row) {
    const reason = String(form.get("reason") ?? "").trim().slice(0, 500);
    await db.update(quotes).set({ status: "declined", declinedAt: new Date(), updatedAt: new Date() }).where(eq(quotes.id, row.q.id));
    await notify(row.b, "needsReply", { title: `Quote declined: ${row.q.number}`, detail: reason ? `Reason: ${reason}` : `"${row.q.title}" was declined online.`, path: `/b/${row.b.slug}/quotes/${row.q.id}` });
  }
  redirect(`/q/${token}`);
}

/* ---------- Settings → Quotes (owner) ---------- */

export async function saveQuoteSettings(slug: string, _: FormState, form: FormData): Promise<FormState> {
  const { business: b } = await requireBusiness(slug, "manage_business");
  const num = (k: string, max: number) => {
    const v = Number(form.get(k));
    return Number.isFinite(v) && v >= 0 && v <= max ? v : undefined;
  };
  const materials = String(form.get("materials") ?? "")
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter(([name]) => name)
    .slice(0, 100)
    .map(([name, unit, cost]) => ({ name: name.slice(0, 100), unit: (unit || "each").slice(0, 30), unitCost: Math.max(0, Number(String(cost ?? "").replace(/[$,]/g, "")) || 0) }));
  const s: QuoteSettings = {
    hourlyCost: num("hourlyCost", 1000),
    marginPercent: num("marginPercent", 90),
    materials: materials.length ? materials : undefined,
    validDays: num("validDays", 365),
    terms: String(form.get("terms") ?? "").trim().slice(0, 2000) || undefined,
  };
  await db.update(businesses).set({ quoteSettings: s }).where(eq(businesses.id, b.id));
  refresh(slug);
  return { ok: "Saved. New quotes use these defaults." };
}
