"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { dollarsToCents, slugify } from "@/lib/format";
import { can, requireBusiness, requirePermission } from "@/lib/session";

// Every action checks the signed-in user's access first. requireBusiness() 404s
// if the user isn't assigned to that business; the optional permission argument
// enforces the role rules in src/lib/session.ts.

const { businesses, contacts, leads, jobs, invoices, payments, scheduleEvents } = schema;

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

export async function updateBusiness(slug: string, form: FormData) {
  const { business: b } = await requireBusiness(slug, "manage_business");
  await db.update(businesses).set(bizFromForm(form, b.color)).where(eq(businesses.id, b.id));
  revalidatePath("/", "layout");
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
