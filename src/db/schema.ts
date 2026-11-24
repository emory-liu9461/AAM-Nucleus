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
  jsonb,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  "phone",
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
  "call",
]);

export const chatStatus = pgEnum("chat_status", ["open", "booked", "handoff", "closed"]);
export const chatChannel = pgEnum("chat_channel", ["web", "sms", "email"]);
export const inboxChannel = pgEnum("inbox_channel", ["sms", "email"]);
export const messageAuthor = pgEnum("message_author", ["customer", "assistant", "staff", "system"]);
export const callStatus = pgEnum("call_status", ["ringing", "answered", "missed", "voicemail"]);

export const userRole = pgEnum("user_role", ["owner", "manager", "staff"]);

/*
 * Logins. Owners see every business; managers and staff only see businesses
 * listed for them in user_businesses. sessionVersion is bumped to sign a user
 * out everywhere (deactivation, password reset).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("staff"),
    active: boolean("active").notNull().default(true),
    sessionVersion: integer("session_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)],
);

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
  // Website lead capture. formKey is public (it's embedded in your website),
  // so spam is limited by allowedDomains, a honeypot and per-IP rate limiting.
  formKey: text("form_key")
    .notNull()
    .unique()
    .default(sql`replace(gen_random_uuid()::text, '-', '')`),
  formEnabled: boolean("form_enabled").notNull().default(true),
  formHeading: text("form_heading"),
  formServices: text("form_services"), // one per line; shown as a dropdown
  formThankYou: text("form_thank_you"),
  allowedDomains: text("allowed_domains"), // comma/space separated; empty = any
  // Public website (site/ app). domain is the bare hostname, e.g. "roofingco.com".
  domain: text("domain").unique(),
  site: jsonb("site").$type<SiteContent>(),
  // AI website assistant: on/off, booking hours and owner-written facts.
  assistant: jsonb("assistant").$type<AssistantSettings>(),
  // Twilio phone number, call forwarding and automatic texting.
  phoneSettings: jsonb("phone_settings").$type<PhoneSettings>(),
  // Email address customers write to, and automatic AI replies.
  emailSettings: jsonb("email_settings").$type<EmailSettings>(),
});

export const userBusinesses = pgTable(
  "user_businesses",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.businessId] })],
);

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
    smsOptOut: boolean("sms_opt_out").notNull().default(false), // replied STOP
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
    // Where a website lead came from: utm tags, landing page, referrer, form name.
    attribution: jsonb("attribution").$type<Attribution>(),
    // Answers from the website intake form (timeline, budget, property, contact preferences…).
    intake: jsonb("intake").$type<Intake>(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
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
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
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
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
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
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("events_business_idx").on(t.businessId), index("events_start_idx").on(t.startsAt)],
);

/** Editable content for a business's public website. Empty fields fall back to trade defaults. */
export type SiteContent = {
  tagline?: string;
  heroHeadline?: string;
  heroSubheadline?: string;
  about?: string;
  yearsInBusiness?: number;
  license?: string;
  insured?: boolean;
  warranty?: string;
  hours?: string;
  primaryCity?: string;
  serviceAreas?: string[];
  services?: { name: string; summary?: string }[];
  reviews?: { name: string; city?: string; text: string; rating?: number }[];
  financing?: string;
  social?: { facebook?: string; instagram?: string; google?: string };
  analytics?: { ga4?: string; googleAds?: string; metaPixel?: string };
};

export type Intake = {
  timeline?: string;
  budgetRange?: string;
  propertyType?: string;
  homeowner?: string;
  contactMethod?: string;
  bestTime?: string;
  preferredDate?: string;
  heardAbout?: string;
  zip?: string;
};

export type Attribution = {
  channel?: "embed" | "hosted" | "api" | "site" | "chat";
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  fbclid?: string;
  page?: string;
  referrer?: string;
  formName?: string;
  ipHash?: string;
};
export type User = typeof users.$inferSelect;
export type Role = (typeof userRole.enumValues)[number];
/** Website chat conversations with the AI assistant. messages is the exact API history (append-only). */
export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    token: text("token").notNull(), // secret the visitor's browser holds to continue the chat
    channel: chatChannel("channel").notNull().default("web"),
    address: text("address"), // customer's phone (E.164) for texts, or email address for email
    aiPaused: boolean("ai_paused").notNull().default(false), // staff took over
    status: chatStatus("status").notNull().default("open"),
    messages: jsonb("messages").$type<unknown[]>().notNull().default([]),
    userTurns: integer("user_turns").notNull().default(0),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => scheduleEvents.id, { onDelete: "set null" }),
    attribution: jsonb("attribution").$type<Attribution>(),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_business_idx").on(t.businessId, t.updatedAt)],
);

/** Every text message and email sent or received, for the Inbox. */
export const inboxMessages = pgTable(
  "inbox_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    channel: inboxChannel("channel").notNull(),
    conversationId: uuid("conversation_id").references(() => chatConversations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    direction: text("direction").$type<"in" | "out">().notNull(),
    author: messageAuthor("author").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    fromAddr: text("from_addr").notNull(),
    toAddr: text("to_addr").notNull(),
    externalId: text("external_id"), // Twilio message SID or email Message-ID
    status: text("status"), // received, sent, failed
    sentById: uuid("sent_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inbox_conv_idx").on(t.conversationId, t.createdAt), index("inbox_contact_idx").on(t.contactId)],
);

/** Phone calls to a business number. */
export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    callSid: text("call_sid").notNull().unique(),
    fromNumber: text("from_number").notNull(),
    toNumber: text("to_number").notNull(),
    status: callStatus("status").notNull().default("ringing"),
    durationSec: integer("duration_sec"),
    recordingUrl: text("recording_url"),
    recordingSeconds: integer("recording_seconds"),
    textedBack: boolean("texted_back").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("calls_business_idx").on(t.businessId, t.createdAt)],
);

export type EmailSettings = {
  inboundAddress?: string; // address that forwards into Nucleus (e.g. hello@yourcompany.com)
  fromAddress?: string; // replies are sent from this address (verified in Postmark)
  fromName?: string;
  aiReplies?: boolean;
  signature?: string;
};

export type PhoneSettings = {
  number?: string; // the business's Twilio number, E.164 (+15551234567)
  forwardTo?: string[]; // phones that ring for incoming calls, E.164
  ringSeconds?: number;
  whisper?: boolean; // announce "Call for <business>" when you answer
  voicemail?: boolean;
  missedCallTextBack?: boolean;
  missedCallMessage?: string;
  smsAssistant?: boolean; // AI replies to texts
};

/** App-wide settings editable in Nucleus (e.g. the website project's address). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AssistantSettings = {
  enabled?: boolean;
  timezone?: string; // IANA, e.g. "America/Chicago"
  days?: number[]; // 0 = Sunday … 6 = Saturday
  start?: string; // "09:00"
  end?: string; // "17:00"
  slotMinutes?: number;
  bufferMinutes?: number;
  minNoticeHours?: number;
  daysAhead?: number;
  offerCalls?: boolean;
  instructions?: string; // facts and rules from the owner
};

export type Business = typeof businesses.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type ScheduleEvent = typeof scheduleEvents.$inferSelect;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type InboxMessage = typeof inboxMessages.$inferSelect;
export type Call = typeof calls.$inferSelect;
