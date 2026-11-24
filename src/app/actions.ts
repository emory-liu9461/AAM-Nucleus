"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { dollarsToCents, slugify } from "@/lib/format";
import { can, requireBusiness, requirePermission } from "@/lib/session";
import { normalizeDomain } from "@/lib/site-defaults";
import type { AssistantSettings, EmailSettings, PhoneSettings, SiteContent } from "@/db/schema";
import { sendBusinessSms } from "@/lib/sms";
import { sendBusinessEmail } from "@/lib/email";
import { toE164 } from "@/lib/twilio";
import { normalizeSiteUrl, websiteBaseUrl } from "@/lib/app-settings";
import { isValidTimezone } from "@/lib/availability";

// Every action checks the signed-in user's access first. requireBusiness() 404s
// if the user isn't assigned to that business; the optional permission argument
// enforces the role rules in src/lib/session.ts.

const { businesses, contacts, leads, jobs, invoices, payments, scheduleEvents, chatConversations, inboxMessages, appSettings } = schema;

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const req = (f: FormData, k: string) => {
  const v = str(f, k);
  if (!v) throw new Error(`${k} is required`);
  return v;
};

/* ---------- businesses (owner only) ---------- */

const bizSchema = z.object({
  name: z.string().min(2),
  trade: z.string().min(2),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
});

const bizFromForm = (form: FormData, fallbackColor = "#2563eb") =>
  bizSchema.parse({
    name: str(form, "name"),
    trade: str(form, "trade"),
    color: str(form, "color") ?? fallbackColor,
    phone: str(form, "phone"),
    email: str(form, "email"),
    website: str(form, "website"),
  });

export async function createBusiness(form: FormData) {
  await requirePermission("manage_business");
  const data = bizFromForm(form);
  let slug = slugify(str(form, "slug") ?? data.name) || "business";
  const taken = await db.select({ slug: businesses.slug }).from(businesses).where(sql`${businesses.slug} like ${slug + "%"}`);
  if (taken.some((t) => t.slug === slug)) slug = `${slug}-${taken.length + 1}`;
  await db.insert(businesses).values({ ...data, slug });
  revalidatePath("/", "layout");
  redirect(`/b/${slug}`);
}

export async function updateBusiness(slug: string, _: { error?: string; ok?: string } | null, form: FormData) {
  const { business: b } = await requireBusiness(slug, "manage_business");
  const parsed = bizSchema.safeParse({
    name: str(form, "name"), trade: str(form, "trade"), color: str(form, "color") ?? b.color,
    phone: str(form, "phone"), email: str(form, "email"), website: str(form, "website"),
  });
  if (!parsed.success) return { error: "Check the name, trade and color." };
  await db.update(businesses).set(parsed.data).where(eq(businesses.id, b.id));
  revalidatePath("/", "layout");
  return { ok: "Saved. Your website shows the new name, phone, email and color within about a minute." };
}

export async function setBusinessArchived(slug: string, archived: boolean) {
  const { business: b } = await requireBusiness(slug, "manage_business");
  await db.update(businesses).set({ archived }).where(eq(businesses.id, b.id));
  revalidatePath("/", "layout");
  if (archived) redirect("/");
}

/* ---------- CRM (all roles) ---------- */

export async function createLead(slug: string, form: FormData) {
  const { business: b, user } = await requireBusiness(slug);
  const source = (str(form, "source") ?? "other") as (typeof schema.leadSource.enumValues)[number];
  const [c] = await db
    .insert(contacts)
    .values({
      businessId: b.id,
      firstName: req(form, "firstName"),
      lastName: str(form, "lastName") ?? "",
      email: str(form, "email"),
      phone: str(form, "phone"),
      address: str(form, "address"),
      city: str(form, "city"),
      source,
    })
    .returning();
  await db.insert(leads).values({
    businessId: b.id,
    contactId: c.id,
    title: req(form, "title"),
    source,
    estimatedValue: dollarsToCents(form.get("estimatedValue")),
    notes: str(form, "notes"),
    createdById: user.id,
  });
  revalidatePath(`/b/${slug}`, "layout");
}

export async function setLeadStage(slug: string, leadId: string, form: FormData) {
  const { business: b } = await requireBusiness(slug);
  const stage = req(form, "stage") as (typeof schema.leadStage.enumValues)[number];
  const [lead] = await db
    .update(leads)
    .set({ stage, closedAt: stage === "won" || stage === "lost" ? new Date() : null })
    .where(and(eq(leads.id, leadId), eq(leads.businessId, b.id)))
    .returning();
  // Winning a lead creates its job automatically (once).
  if (lead && stage === "won") {
    const [existing] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.leadId, lead.id));
    if (!existing) {
      const [c] = await db.select().from(contacts).where(eq(contacts.id, lead.contactId));
      await db.insert(jobs).values({
        businessId: b.id,
        contactId: lead.contactId,
        leadId: lead.id,
        name: `${lead.title} – ${c?.lastName || c?.firstName || "Customer"}`,
        contractValue: lead.estimatedValue,
        address: c?.address,
      });
    }
  }
  revalidatePath(`/b/${slug}`, "layout");
  revalidatePath("/");
}

/* ---------- jobs ---------- */

export async function updateJob(slug: string, jobId: string, form: FormData) {
  const { business: b, user } = await requireBusiness(slug);
  const status = req(form, "status") as (typeof schema.jobStatus.enumValues)[number];
  const dates = {
    status,
    startDate: str(form, "startDate"),
    endDate: str(form, "endDate") ?? (status === "completed" ? new Date().toISOString().slice(0, 10) : null),
  };
  // Staff can move a job along but never see or change money fields.
  const money = can(user, "view_financials")
    ? {
        contractValue: dollarsToCents(form.get("contractValue")),
        estimatedCost: dollarsToCents(form.get("estimatedCost")),
        actualCost: dollarsToCents(form.get("actualCost")),
      }
    : {};
  await db
    .update(jobs)
    .set({ ...dates, ...money })
    .where(and(eq(jobs.id, jobId), eq(jobs.businessId, b.id)));
  revalidatePath(`/b/${slug}`, "layout");
  revalidatePath("/");
}

/* ---------- invoices & payments (owner + manager) ---------- */

export async function createInvoice(slug: string, form: FormData) {
  const { business: b, user } = await requireBusiness(slug, "manage_invoices");
  const jobId = req(form, "jobId");
  const [job] = await db.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.businessId, b.id)));
  if (!job) throw new Error("Job not found");
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(invoices).where(eq(invoices.businessId, b.id));
  const prefix = b.slug.split("-").map((p) => p[0]).join("").toUpperCase().slice(0, 3);
  const issued = new Date();
  const due = new Date(issued.getTime() + Number(str(form, "terms") ?? 15) * 864e5);
  await db.insert(invoices).values({
    businessId: b.id,
    contactId: job.contactId,
    jobId: job.id,
    number: `${prefix}-${2000 + Number(count)}`,
    description: str(form, "description"),
    amount: dollarsToCents(form.get("amount")),
    status: "sent",
    issuedAt: issued.toISOString().slice(0, 10),
    dueAt: due.toISOString().slice(0, 10),
    createdById: user.id,
  });
  revalidatePath(`/b/${slug}`, "layout");
  revalidatePath("/");
}

export async function recordPayment(slug: string, invoiceId: string, form: FormData) {
  const { business: b, user } = await requireBusiness(slug, "manage_invoices");
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, b.id)));
  if (!inv) throw new Error("Invoice not found");
  const amount = dollarsToCents(form.get("amount"));
  if (amount <= 0) throw new Error("Amount must be positive");
  await db.insert(payments).values({
    businessId: b.id,
    invoiceId: inv.id,
    amount,
    method: (str(form, "method") ?? "card") as (typeof schema.paymentMethod.enumValues)[number],
    reference: str(form, "reference"),
    createdById: user.id,
  });
  const [{ paid }] = await db
    .select({ paid: sql<number>`coalesce(sum(${payments.amount}),0)` })
    .from(payments)
    .where(eq(payments.invoiceId, inv.id));
  await db
    .update(invoices)
    .set({ status: Number(paid) >= inv.amount ? "paid" : "partial" })
    .where(eq(invoices.id, inv.id));
  revalidatePath(`/b/${slug}`, "layout");
  revalidatePath("/");
}

export async function voidInvoice(slug: string, invoiceId: string) {
  const { business: b } = await requireBusiness(slug, "manage_invoices");
  await db.update(invoices).set({ status: "void" }).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, b.id)));
  revalidatePath(`/b/${slug}`, "layout");
  revalidatePath("/");
}

/* ---------- schedule (all roles) ---------- */

export async function createEvent(slug: string, form: FormData) {
  const { business: b, user } = await requireBusiness(slug);
  const date = req(form, "date");
  const start = new Date(`${date}T${str(form, "start") ?? "08:00"}`);
  const end = new Date(`${date}T${str(form, "end") ?? "09:00"}`);
  if (end <= start) throw new Error("End must be after start");
  const jobId = str(form, "jobId");
  let contactId: string | null = null;
  if (jobId) {
    const [j] = await db.select({ contactId: jobs.contactId }).from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.businessId, b.id)));
    if (!j) throw new Error("Job not found");
    contactId = j.contactId;
  }
  await db.insert(scheduleEvents).values({
    businessId: b.id,
    jobId,
    contactId,
    title: req(form, "title"),
    type: (str(form, "type") ?? "other") as (typeof schema.eventType.enumValues)[number],
    startsAt: start,
    endsAt: end,
    assignee: str(form, "assignee"),
    notes: str(form, "notes"),
    createdById: user.id,
  });
  revalidatePath(`/b/${slug}`, "layout");
  revalidatePath("/");
}

export async function deleteEvent(slug: string, eventId: string) {
  const { business: b } = await requireBusiness(slug);
  await db.delete(scheduleEvents).where(and(eq(scheduleEvents.id, eventId), eq(scheduleEvents.businessId, b.id)));
  revalidatePath(`/b/${slug}`, "layout");
  revalidatePath("/");
}


/* ---------- website lead capture (owner) ---------- */

export async function updateWebsiteSettings(slug: string, form: FormData) {
  const { business: b } = await requireBusiness(slug, "manage_business");
  await db
    .update(businesses)
    .set({
      formEnabled: form.get("formEnabled") === "on",
      formHeading: str(form, "formHeading"),
      formServices: str(form, "formServices"),
      formThankYou: str(form, "formThankYou"),
      allowedDomains: str(form, "allowedDomains"),
    })
    .where(eq(businesses.id, b.id));
  revalidatePath(`/b/${slug}/website`);
}

export async function regenerateFormKey(slug: string) {
  const { business: b } = await requireBusiness(slug, "manage_business");
  await db
    .update(businesses)
    .set({ formKey: sql`replace(gen_random_uuid()::text, '-', '')` })
    .where(eq(businesses.id, b.id));
  revalidatePath(`/b/${slug}/website`);
}

/* ---------- public website content (owner) ---------- */

export async function updateSiteContent(slug: string, _: { error?: string; ok?: string } | null, form: FormData) {
  const { business: b } = await requireBusiness(slug, "manage_business");
  const lines = (k: string) => (str(form, k) ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const rawDomain = str(form, "domain");
  const domain = normalizeDomain(rawDomain);
  if (rawDomain && !domain) return { error: "Domain should look like yourcompany.com" };
  if (domain) {
    const [taken] = await db.select({ id: businesses.id }).from(businesses).where(and(eq(businesses.domain, domain), sql`${businesses.id} <> ${b.id}`));
    if (taken) return { error: `${domain} is already used by another business` };
  }
  const years = Number(str(form, "yearsInBusiness"));
  const site: SiteContent = {
    tagline: str(form, "tagline") ?? undefined,
    heroHeadline: str(form, "heroHeadline") ?? undefined,
    heroSubheadline: str(form, "heroSubheadline") ?? undefined,
    about: str(form, "about") ?? undefined,
    yearsInBusiness: Number.isFinite(years) && years > 0 ? Math.round(years) : undefined,
    license: str(form, "license") ?? undefined,
    insured: form.get("insured") === "on",
    warranty: str(form, "warranty") ?? undefined,
    hours: str(form, "hours") ?? undefined,
    primaryCity: str(form, "primaryCity") ?? undefined,
    serviceAreas: lines("serviceAreas"),
    services: lines("services").map((l) => {
      const [name, ...rest] = l.split("|");
      return { name: name.trim(), summary: rest.join("|").trim() || undefined };
    }).filter((s) => s.name),
    reviews: lines("reviews").map((l) => {
      const [name, city, text, rating] = l.split("|").map((p) => p.trim());
      return { name, city: city || undefined, text: text ?? "", rating: Number(rating) || 5 };
    }).filter((r) => r.name && r.text),
    financing: str(form, "financing") ?? undefined,
    social: { facebook: str(form, "facebook") ?? undefined, instagram: str(form, "instagram") ?? undefined, google: str(form, "google") ?? undefined },
    analytics: { ga4: str(form, "ga4") ?? undefined, googleAds: str(form, "googleAds") ?? undefined, metaPixel: str(form, "metaPixel") ?? undefined },
  };
  await db.update(businesses).set({ domain, site }).where(eq(businesses.id, b.id));
  revalidatePath(`/b/${slug}/website`, "layout");
  return { ok: "Saved. The live website updates within about a minute." };
}

/* ---------- AI website assistant (owner) ---------- */

export async function updateAssistantSettings(slug: string, _: { error?: string; ok?: string } | null, form: FormData) {
  const { business: b } = await requireBusiness(slug, "manage_business");
  const time = (k: string, d: string) => (/^\d{2}:\d{2}$/.test(str(form, k) ?? "") ? (str(form, k) as string) : d);
  const num = (k: string, d: number, min: number, max: number) => {
    const n = Number(str(form, k));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
  };
  const start = time("start", "09:00");
  const end = time("end", "17:00");
  if (end <= start) return { error: "End time must be after start time" };
  const days = form.getAll("days").map(Number).filter((d) => d >= 0 && d <= 6);
  if (!days.length) return { error: "Pick at least one day for appointments" };
  const timezone = str(form, "timezone") ?? "America/Chicago";
  if (!isValidTimezone(timezone)) return { error: "Unknown time zone" };
  const assistant: AssistantSettings = {
    enabled: form.get("enabled") === "on",
    timezone,
    days,
    start,
    end,
    slotMinutes: num("slotMinutes", 30, 15, 240),
    bufferMinutes: num("bufferMinutes", 0, 0, 120),
    minNoticeHours: num("minNoticeHours", 12, 0, 168),
    daysAhead: num("daysAhead", 14, 1, 60),
    offerCalls: form.get("offerCalls") === "on",
    instructions: (str(form, "instructions") ?? "").slice(0, 4000) || undefined,
  };
  await db.update(businesses).set({ assistant }).where(eq(businesses.id, b.id));
  revalidatePath(`/b/${slug}/website`, "layout");
  return { ok: assistant.enabled ? "Saved. The assistant is on." : "Saved. The assistant is off." };
}

/* ---------- Inbox: texts + email (all roles), phone/email settings (owner) ---------- */

async function inboxConversation(slug: string, conversationId: string) {
  const ctx = await requireBusiness(slug);
  const [conv] = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.businessId, ctx.business.id)));
  if (!conv || conv.channel === "web" || !conv.address) throw new Error("Conversation not found");
  return { ...ctx, conv };
}

export async function sendInboxReply(slug: string, conversationId: string, _: { error?: string; ok?: string } | null, form: FormData) {
  const { business: b, user, conv } = await inboxConversation(slug, conversationId);
  const body = (str(form, "body") ?? "").slice(0, conv.channel === "sms" ? 1500 : 20000);
  if (!body) return { error: "Type a message first" };
  let result;
  if (conv.channel === "sms") {
    result = await sendBusinessSms(b, conv.address!, body, { conversationId: conv.id, contactId: conv.contactId, author: "staff", sentById: user.id });
  } else {
    const [lastIn] = await db
      .select()
      .from(inboxMessages)
      // Thread onto the customer's latest real email (auto-replies carry no Message-ID we can use).
      .where(and(eq(inboxMessages.conversationId, conv.id), eq(inboxMessages.direction, "in"), sql`${inboxMessages.externalId} is not null`, sql`${inboxMessages.subject} !~* '^(out of office|automatic reply|auto(matic)?[- ]?reply)'`))
      .orderBy(desc(inboxMessages.createdAt))
      .limit(1);
    const subject = lastIn?.subject ? (/^re:/i.test(lastIn.subject) ? lastIn.subject : `Re: ${lastIn.subject}`) : `Message from ${b.name}`;
    result = await sendBusinessEmail(b, conv.address!, subject, body, { conversationId: conv.id, contactId: conv.contactId, author: "staff", sentById: user.id, inReplyTo: lastIn?.externalId });
  }
  // A person has taken over: the AI stops replying in this conversation.
  await db.update(chatConversations).set({ aiPaused: true }).where(eq(chatConversations.id, conv.id));
  revalidatePath(`/b/${slug}/inbox`, "layout");
  return "error" in result && result.error ? { error: result.error } : { ok: "Sent. The AI is paused for this conversation." };
}

export async function setConversationAi(slug: string, conversationId: string, paused: boolean) {
  const { conv } = await inboxConversation(slug, conversationId);
  await db.update(chatConversations).set({ aiPaused: paused }).where(eq(chatConversations.id, conv.id));
  revalidatePath(`/b/${slug}/inbox`, "layout");
}

export async function updatePhoneSettings(slug: string, _: { error?: string; ok?: string } | null, form: FormData) {
  const { business: b } = await requireBusiness(slug, "manage_business");
  const rawNumber = str(form, "number");
  const number = rawNumber ? toE164(rawNumber) : null;
  if (rawNumber && !number) return { error: "Twilio number should look like +15551234567 or (555) 123-4567" };
  const forwardLines = (str(form, "forwardTo") ?? "").split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
  const forwardTo = forwardLines.map(toE164);
  if (forwardTo.some((n) => !n)) return { error: "Each forwarding number should be a full phone number" };
  if (number) {
    const others = await db.select({ id: businesses.id, name: businesses.name }).from(businesses).where(sql`${businesses.phoneSettings}->>'number' = ${number} and ${businesses.id} <> ${b.id}`);
    if (others.length) return { error: `${number} is already used by ${others[0].name}` };
    if (forwardTo.includes(number)) return { error: "Don't forward the Twilio number to itself" };
  }
  const ring = Number(str(form, "ringSeconds"));
  const phoneSettings: PhoneSettings = {
    number: number ?? undefined,
    forwardTo: forwardTo as string[],
    ringSeconds: Number.isFinite(ring) ? Math.min(60, Math.max(10, Math.round(ring))) : 20,
    whisper: form.get("whisper") === "on",
    voicemail: form.get("voicemail") === "on",
    missedCallTextBack: form.get("missedCallTextBack") === "on",
    missedCallMessage: (str(form, "missedCallMessage") ?? "").slice(0, 320) || undefined,
    smsAssistant: form.get("smsAssistant") === "on",
  };
  await db.update(businesses).set({ phoneSettings }).where(eq(businesses.id, b.id));
  revalidatePath(`/b/${slug}/inbox`, "layout");
  return { ok: "Phone settings saved" };
}

export async function updateEmailSettings(slug: string, _: { error?: string; ok?: string } | null, form: FormData) {
  const { business: b } = await requireBusiness(slug, "manage_business");
  const emailOk = (v: string | null) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const inboundAddress = str(form, "inboundAddress")?.toLowerCase() ?? null;
  const fromAddress = str(form, "fromAddress")?.toLowerCase() ?? null;
  if (!emailOk(inboundAddress) || !emailOk(fromAddress)) return { error: "Enter valid email addresses" };
  if (inboundAddress) {
    const others = await db.select({ name: businesses.name }).from(businesses).where(sql`lower(${businesses.emailSettings}->>'inboundAddress') = ${inboundAddress} and ${businesses.id} <> ${b.id}`);
    if (others.length) return { error: `${inboundAddress} is already used by ${others[0].name}` };
  }
  const emailSettings: EmailSettings = {
    inboundAddress: inboundAddress ?? undefined,
    fromAddress: fromAddress ?? undefined,
    fromName: str(form, "fromName") ?? undefined,
    aiReplies: form.get("aiReplies") === "on",
    signature: (str(form, "signature") ?? "").slice(0, 600) || undefined,
  };
  await db.update(businesses).set({ emailSettings }).where(eq(businesses.id, b.id));
  revalidatePath(`/b/${slug}/inbox`, "layout");
  return { ok: "Email settings saved" };
}

/* ---------- link to the website project (owner) ---------- */

export async function setWebsiteUrl(_: { error?: string; ok?: string } | null, form: FormData) {
  await requirePermission("manage_business");
  const raw = str(form, "websiteUrl");
  const url = normalizeSiteUrl(raw);
  if (raw && !url) return { error: "Enter the website project's address, e.g. https://aam-nucleus-site.vercel.app" };
  if (!url) {
    await db.delete(appSettings).where(eq(appSettings.key, "website_url"));
  } else {
    await db
      .insert(appSettings)
      .values({ key: "website_url", value: url })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: url, updatedAt: new Date() } });
  }
  revalidatePath("/", "layout");
  return { ok: url ? `Linked to ${url.replace(/^https?:\/\//, "")}` : "Website link removed" };
}

/** Checks both directions: the website responds, and it reads this business's content from this Nucleus. */
export async function testWebsiteLink(slug: string, _: { error?: string; ok?: string } | null) {
  const { business: b } = await requireBusiness(slug, "manage_business");
  const base = await websiteBaseUrl();
  if (!base) return { error: "Enter the website project's address first." };
  try {
    const res = await fetch(`${base}/?site=${b.slug}`, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    if (!res.ok) return { error: `The website answered with an error (${res.status}). Check its latest deployment in Vercel.` };
    if (html.includes("This website isn") || html.includes("Website preview"))
      return { error: "The website loads but didn't pick this business. Redeploy the website project, then test again." };
    if (b.formEnabled && !html.includes(b.formKey))
      return { error: `The website loads, but it isn't reading from this Nucleus. In Vercel, set NUCLEUS_URL on the website project to this Nucleus address, then redeploy.` };
    return { ok: `Connected: the website shows ${b.name} and sends its quote requests here.` };
  } catch {
    return { error: "Couldn't reach the website. Check the address and that its deployment is Ready in Vercel." };
  }
}
