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
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Raw bytes (project photos are stored in the database, no extra file service needed). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

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
  // Instant alerts to the owner/team (new leads, bookings, voicemails…).
  alertSettings: jsonb("alert_settings").$type<AlertSettings>(),
  // Ask happy customers for a review when a job is completed.
  reviewSettings: jsonb("review_settings").$type<ReviewSettings>(),
  // Customer workflow: automatic messages through a job, and the prep guide.
  workflowSettings: jsonb("workflow_settings").$type<WorkflowSettings>(),
  // Online payments: Stripe keys (encrypted) and e-Transfer instructions.
  paymentSettings: jsonb("payment_settings").$type<PaymentSettings>(),
  // Sales tax added to invoices (e.g. "HST", "13").
  taxLabel: text("tax_label"),
  taxRate: text("tax_rate"),
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
    marketingConsentAt: timestamp("marketing_consent_at", { withTimezone: true }), // ticked "send me offers" (CASL express consent)
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
    // Secret in the customer's project page link (/p/<token>): schedule, prep guide, progress photos.
    portalToken: text("portal_token")
      .notNull()
      .unique()
      .default(sql`replace(gen_random_uuid()::text, '-', '')`),
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
    subtotal: integer("subtotal"), // before tax (null on older invoices: amount had no tax)
    taxAmount: integer("tax_amount").notNull().default(0),
    taxLabel: text("tax_label"),
    // Secret in the customer's payment link (/pay/<token>).
    payToken: text("pay_token")
      .notNull()
      .unique()
      .default(sql`replace(gen_random_uuid()::text, '-', '')`),
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
  // A Stripe payment ("stripe:<checkout session>") is recorded once, however many times Stripe reports it.
  (t) => [index("payments_business_idx").on(t.businessId), uniqueIndex("payments_stripe_ref").on(t.reference).where(sql`${t.reference} like 'stripe:%'`)],
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
    // Multi-day work: the same daily hours (startsAt's time to endsAt's time) for this many
    // days in a row, starting on startsAt's date. endsAt is the end of the last day.
    days: integer("days").notNull().default(1),
    // Bumped on every change so calendar apps replace the old copy of an emailed invite.
    sequence: integer("sequence").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("events_business_idx").on(t.businessId), index("events_start_idx").on(t.startsAt)],
);

/*
 * Crew members (they don't need a Nucleus login). Work assigned to them is emailed as a
 * calendar invite, and calendarToken is the secret in their personal calendar feed URL.
 */
export const staffMembers = pgTable(
  "staff_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"), // e.g. "Crew lead", "Painter"
    phone: text("phone"),
    email: text("email"),
    color: text("color").notNull().default("#2563eb"),
    notes: text("notes"),
    sendInvites: boolean("send_invites").notNull().default(true),
    active: boolean("active").notNull().default(true),
    calendarToken: text("calendar_token")
      .notNull()
      .unique()
      .default(sql`replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("staff_business_idx").on(t.businessId)],
);

/** Who is working on each schedule event, in what role, and whether their calendar invite went out. */
export const eventStaff = pgTable(
  "event_staff",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => scheduleEvents.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staffMembers.id, { onDelete: "cascade" }),
    role: text("role"), // their role on this job, e.g. "Driver", "Painter", "Crew lead"
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    inviteError: text("invite_error"),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.staffId] }), index("event_staff_staff_idx").on(t.staffId)],
);

/** Editable content for a business's public website. Empty fields fall back to trade defaults. */
export type SiteContent = {
  logo?: string; // brand logo key, e.g. "arcus-painting" ("none" = text name); empty = automatic
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
  guaranteeDays?: number; // satisfaction guarantee ("tell us within N days and we'll make it right"); 0 = none
  // Editable page sections (empty = the defaults in src/lib/site-defaults.ts).
  trustPoints?: { label: string; detail?: string }[];
  priorities?: { title: string; text?: string }[];
  process?: { title: string; text?: string }[];
  sections?: Partial<Record<SiteSectionKey, SiteSectionText>>;
  social?: Record<string, string>; // channel key (google, facebook, instagram, tiktok…) -> profile URL
  analytics?: { ga4?: string; googleAds?: string; metaPixel?: string };
};

export type SiteSectionKey = "trust" | "services" | "projects" | "process" | "reviews" | "about" | "priorities" | "cta";
export type SiteSectionText = { show?: boolean; eyebrow?: string; title?: string; intro?: string };

export type Intake = {
  marketingConsent?: string; // "yes" = ticked "send me offers and tips"
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

/** Page views on the public websites (no cookies; a per-tab session id groups a visit). */
export const siteVisits = pgTable(
  "site_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    path: text("path").notNull(),
    source: text("source").notNull(), // google, facebook, direct, referral domain…
    newSession: boolean("new_session").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("visits_business_idx").on(t.businessId, t.createdAt)],
);

/** A connected social/review account (Google Business Profile, Facebook Page, Instagram, YouTube). */
export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(), // google | facebook | instagram | youtube
    externalId: text("external_id").notNull(), // location name, page id, IG user id, YouTube channel id
    name: text("name"),
    accessToken: text("access_token"), // encrypted (AES-256-GCM)
    refreshToken: text("refresh_token"), // encrypted
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    meta: jsonb("meta").$type<Record<string, string>>(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("social_accounts_unique").on(t.businessId, t.channel)],
);

/**
 * One row per business, channel and day: totals (followers, reviews, rating) and
 * recent activity (views, likes, comments over the last ~28 days), from an API sync
 * or typed in by hand.
 */
export const socialStats = pgTable(
  "social_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    day: date("day").notNull(),
    followers: integer("followers"),
    views: integer("views"),
    likes: integer("likes"),
    comments: integer("comments"),
    reviewsCount: integer("reviews_count"),
    rating: text("rating"), // decimal as text, e.g. "4.8"
    extra: jsonb("extra").$type<Record<string, number>>(), // e.g. Google calls / website clicks
    source: text("source").$type<"api" | "manual">().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("social_stats_day").on(t.businessId, t.channel, t.day)],
);

/** Individual reviews and comments pulled from connected accounts. */
export const socialItems = pgTable(
  "social_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    kind: text("kind").$type<"review" | "comment">().notNull(),
    externalId: text("external_id").notNull(),
    author: text("author"),
    text: text("text"),
    rating: integer("rating"),
    url: text("url"),
    replied: boolean("replied").notNull().default(false),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("social_items_unique").on(t.businessId, t.channel, t.externalId), index("social_items_recent").on(t.businessId, t.postedAt)],
);

/** A review request sent to a customer after a completed job. */
export const reviewRequests = pgTable(
  "review_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(), // used in the tracked review link
    channels: text("channels").notNull(), // "sms,email"
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  },
  (t) => [index("review_requests_business_idx").on(t.businessId, t.sentAt), uniqueIndex("review_requests_job").on(t.jobId)],
);

/*
 * Customer workflow: each message sent to the customer about a job (welcome, schedule,
 * reminder, on the way, progress, completed), shown on their project page and in Nucleus.
 */
export const jobUpdates = pgTable(
  "job_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => scheduleEvents.id, { onDelete: "set null" }),
    kind: text("kind").$type<WorkflowStep | "note">().notNull(),
    note: text("note"), // the progress update text (progress) or internal note
    message: text("message"), // what was sent to the customer
    channels: text("channels"), // "sms,email", empty when nothing could be sent
    error: text("error"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_updates_job_idx").on(t.jobId, t.createdAt)],
);

/** Progress photos for a job, shown to the customer on their project page. */
export const jobPhotos = pgTable(
  "job_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    updateId: uuid("update_id").references(() => jobUpdates.id, { onDelete: "cascade" }),
    // Set when the photo was also added to the website's project gallery.
    websitePhotoId: uuid("website_photo_id").references(() => projectPhotos.id, { onDelete: "set null" }),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_photos_job_idx").on(t.jobId)],
);

export type WorkflowStep = "welcome" | "scheduled" | "visit_cancelled" | "reminder" | "on_the_way" | "progress" | "completed";
export type WorkflowMessage = { enabled?: boolean; sms?: boolean; email?: boolean; message?: string };
export type WorkflowSettings = {
  steps?: Partial<Record<WorkflowStep, WorkflowMessage>>;
  prepGuide?: string[]; // "before we arrive" rules shown to the customer
  arrivalWindowMinutes?: number; // crew arrives between start and start + this
  reminderDaysBefore?: number;
};

/** Before/after and finished-project photos shown on the business website. */
export const projectPhotos = pgTable(
  "project_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    caption: text("caption"),
    serviceSlug: text("service_slug"),
    areaSlug: text("area_slug"),
    kind: text("kind").$type<"before" | "after" | "photo">().notNull().default("photo"),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes").notNull(),
    data: bytea("data").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("photos_business_idx").on(t.businessId, t.sortOrder)],
);

export type PaymentSettings = {
  stripeKey?: string; // encrypted secret/restricted key (src/lib/secret-box.ts)
  stripeWebhookSecret?: string; // encrypted webhook signing secret
  stripeAccount?: string; // account name shown in Nucleus
  etransferEmail?: string;
  etransferNote?: string;
};

export type AlertSettings = {
  phones?: string[]; // E.164, get a text for each alert
  emails?: string[];
  payment?: boolean; // an invoice paid online
  newLead?: boolean;
  booking?: boolean;
  voicemail?: boolean;
  needsReply?: boolean; // a text/email the AI isn't answering (paused, off or handed off)
};

export type ReviewSettings = {
  enabled?: boolean;
  link?: string; // where to leave a review (Google, HomeStars…)
  sms?: boolean;
  email?: boolean;
  message?: string; // {name}, {business}, {link}
  reminderDays?: number; // 0 = no reminder
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
export type StaffMember = typeof staffMembers.$inferSelect;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type InboxMessage = typeof inboxMessages.$inferSelect;
export type Call = typeof calls.$inferSelect;
