import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";

/*
 * Every business-owned table carries businessId. Money is stored as integer cents.
 * Adding a new business = inserting one row in `businesses`; everything else scopes to it.
 */

export const leadStage = pgEnum("lead_stage", [
  "new",
  "contacted",
  "site_visit",
  "estimate_sent",
  "won",
  "lost",
]);

export const leadSource = pgEnum("lead_source", [
  "website",
  "referral",
  "google",
  "facebook",
  "angi",
  "repeat",
  "walk_in",
  "other",
]);

export const jobStatus = pgEnum("job_status", [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "sent",
  "partial",
  "paid",
  "void",
]);

export const paymentMethod = pgEnum("payment_method", [
  "card",
  "ach",
  "check",
  "cash",
  "financing",
]);

export const eventType = pgEnum("event_type", [
  "site_visit",
  "job_work",
  "follow_up",
  "other",
]);

export const businesses = pgTable("businesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  trade: text("trade").notNull().default("General Contracting"),
  color: text("color").notNull().default("#2563eb"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    source: leadSource("source").notNull().default("other"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contacts_business_idx").on(t.businessId)],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    stage: leadStage("stage").notNull().default("new"),
    source: leadSource("source").notNull().default("other"),
    estimatedValue: integer("estimated_value").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("leads_business_idx").on(t.businessId)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    status: jobStatus("status").notNull().default("scheduled"),
    contractValue: integer("contract_value").notNull().default(0),
    estimatedCost: integer("estimated_cost").notNull().default(0),
    actualCost: integer("actual_cost").notNull().default(0),
    address: text("address"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_business_idx").on(t.businessId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    number: text("number").notNull(),
    description: text("description"),
    status: invoiceStatus("status").notNull().default("draft"),
    amount: integer("amount").notNull(),
    issuedAt: date("issued_at").notNull(),
    dueAt: date("due_at").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoices_business_idx").on(t.businessId)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    method: paymentMethod("method").notNull().default("card"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    reference: text("reference"),
  },
  (t) => [index("payments_business_idx").on(t.businessId)],
);

export const scheduleEvents = pgTable(
  "schedule_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    type: eventType("type").notNull().default("other"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    assignee: text("assignee"),
    notes: text("notes"),
  },
  (t) => [index("events_business_idx").on(t.businessId), index("events_start_idx").on(t.startsAt)],
);

export type Business = typeof businesses.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type ScheduleEvent = typeof scheduleEvents.$inferSelect;
