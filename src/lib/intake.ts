import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Attribution, Business, Intake } from "@/db/schema";
import { notify } from "./alerts";

/*
 * Website lead intake, shared by the hosted/embedded form (/f/[key]) and the
 * public JSON/form-post API (/api/public/leads/[key]).
 */

const { businesses, contacts, leads } = schema;
type Source = (typeof schema.leadSource.enumValues)[number];

export const RATE_LIMIT = { max: 5, windowMinutes: 10 };

export async function businessByFormKey(key: string): Promise<Business | null> {
  if (!/^[a-zA-Z0-9]{16,64}$/.test(key)) return null;
  const [b] = await db.select().from(businesses).where(eq(businesses.formKey, key));
  return b && !b.archived && b.formEnabled ? b : null;
}

/** Accepts many common field names so existing website forms work without renaming fields. */
export function normalize(raw: Record<string, unknown>) {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      for (const variant of [k, k.toLowerCase(), k.replace(/_/g, ""), k.replace(/_/g, "-")]) {
        const v = raw[variant];
        if (typeof v === "string" && v.trim()) return v.trim().slice(0, 2000);
        if (typeof v === "number") return String(v);
      }
    }
    return "";
  };
  let first = get("first_name", "firstname", "fname", "given_name");
  let last = get("last_name", "lastname", "lname", "surname", "family_name");
  const full = get("name", "full_name", "fullname", "your_name", "your-name", "contact_name");
  if (!first && full) {
    const parts = full.split(/\s+/);
    first = parts.shift() ?? "";
    last = last || parts.join(" ");
  }
  return {
    firstName: first.slice(0, 100),
    lastName: last.slice(0, 100),
    email: get("email", "email_address", "your_email", "your-email").slice(0, 200).toLowerCase(),
    phone: get("phone", "phone_number", "tel", "telephone", "mobile", "your_phone", "your-phone").slice(0, 40),
    address: get("address", "street", "street_address", "address1").slice(0, 200),
    city: get("city", "town").slice(0, 100),
    zip: get("zip", "zipcode", "postal_code", "postcode").slice(0, 20),
    service: get("service", "project", "project_type", "service_type", "subject", "interest").slice(0, 200),
    message: get("message", "details", "description", "comments", "notes", "your_message", "your-message"),
    budget: get("budget", "estimated_value", "value"),
    honeypot: get("company_website", "_gotcha", "hp"),
    intake: {
      timeline: get("timeline", "when").slice(0, 100) || undefined,
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(get("start_date", "ideal_start_date")) ? get("start_date", "ideal_start_date") : undefined,
      budgetRange: get("budget_range", "budgetrange").slice(0, 100) || undefined,
      propertyType: get("property_type", "propertytype").slice(0, 100) || undefined,
      homeowner: get("homeowner", "owner", "own_home").slice(0, 50) || undefined,
      contactMethod: get("contact_method", "preferred_contact").slice(0, 50) || undefined,
      bestTime: get("best_time", "best_time_to_call").slice(0, 100) || undefined,
      preferredDate: get("preferred_date", "visit_date").slice(0, 50) || undefined,
      heardAbout: get("heard_about", "how_did_you_hear", "referral_source").slice(0, 100) || undefined,
      marketingConsent: /^(yes|on|true|1)$/i.test(get("marketing_consent")) ? "yes" : undefined,
    } satisfies Intake,
    attribution: {
      utmSource: get("utm_source") || undefined,
      utmMedium: get("utm_medium") || undefined,
      utmCampaign: get("utm_campaign") || undefined,
      utmTerm: get("utm_term") || undefined,
      utmContent: get("utm_content") || undefined,
      gclid: get("gclid") || undefined,
      fbclid: get("fbclid") || undefined,
      page: get("page_url", "page", "url", "landing_page").slice(0, 500) || undefined,
      referrer: get("referrer", "ref").slice(0, 500) || undefined,
      formName: get("form_name", "form").slice(0, 100) || undefined,
    } satisfies Attribution,
  };
}

export type IntakeData = ReturnType<typeof normalize>;

/** Pick a lead source from ad/UTM tags and the referring site. */
export function sourceFrom(a: Attribution): Source {
  const s = `${a.utmSource ?? ""} ${a.utmMedium ?? ""}`.toLowerCase();
  const ref = (a.referrer ?? "").toLowerCase();
  if (a.gclid || /google|adwords|gads/.test(s) || /google\./.test(ref)) return "google";
  if (a.fbclid || /facebook|\bfb\b|instagram|\big\b|meta/.test(s) || /facebook\.|instagram\.|fb\.com/.test(ref)) return "facebook";
  if (/angi|homeadvisor/.test(s) || /angi\.|homeadvisor\./.test(ref)) return "angi";
  if (/referral|friend/.test(s)) return "referral";
  return "website";
}

export function hostAllowed(business: Business, origin: string | null) {
  const list = (business.allowedDomains ?? "")
    .split(/[\s,]+/)
    .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, ""))
    .filter(Boolean);
  if (!list.length || !origin) return true; // no allowlist, or a server-to-server call (Zapier etc.)
  if (business.domain) list.push(business.domain); // the business's own website is always allowed
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return list.some((d) => host === d || host.endsWith("." + d));
}

export const hashIp = (ip: string) => createHash("sha256").update(`${process.env.AUTH_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 32);

export type IntakeResult = { ok: true; leadId: string | null } | { ok: false; status: number; error: string };

export async function createWebsiteLead(
  business: Business,
  data: IntakeData,
  meta: { ip: string; channel: Attribution["channel"] },
): Promise<IntakeResult> {
  // Bots fill the hidden field; pretend it worked so they don't retry.
  if (data.honeypot) return { ok: true, leadId: null };
  if (!data.firstName) return { ok: false, status: 422, error: "Please enter your name." };
  if (!data.email && !data.phone) return { ok: false, status: 422, error: "Please enter an email or phone number." };
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { ok: false, status: 422, error: "Please enter a valid email." };

  const ipHash = hashIp(meta.ip);
  const since = new Date(Date.now() - RATE_LIMIT.windowMinutes * 60e3);
  const [{ recent }] = await db
    .select({ recent: sql<number>`count(*)` })
    .from(leads)
    .where(and(eq(leads.businessId, business.id), gte(leads.createdAt, since), sql`${leads.attribution}->>'ipHash' = ${ipHash}`));
  if (Number(recent) >= RATE_LIMIT.max)
    return { ok: false, status: 429, error: "Too many requests. Please call us or try again later." };

  const attribution: Attribution = { ...stripEmpty(data.attribution), channel: meta.channel, ipHash };
  // Ad/UTM tags win; otherwise use the customer's answer to "How did you hear about us?"
  let source = sourceFrom(attribution);
  if (source === "website" && data.intake.heardAbout) source = sourceFromAnswer(data.intake.heardAbout) ?? source;
  const intake: Intake = stripEmpty({ ...data.intake, zip: data.zip || undefined });

  // Reuse an existing contact with the same email or phone instead of duplicating.
  const digits = data.phone.replace(/\D/g, "");
  const [existing] = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.businessId, business.id),
        sql`(${data.email ? sql`lower(${contacts.email}) = ${data.email}` : sql`false`}
          or ${digits.length >= 7 ? sql`regexp_replace(coalesce(${contacts.phone}, ''), '\\D', '', 'g') = ${digits}` : sql`false`})`,
      ),
    )
    .limit(1);

  const contact =
    existing ??
    (
      await db
        .insert(contacts)
        .values({
          businessId: business.id,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email || null,
          phone: data.phone || null,
          address: data.address || null,
          city: data.city || null,
          zip: data.zip || null,
          source,
        })
        .returning()
    )[0];

  // CASL: record express consent to marketing (offers, tips) when they ticked the box.
  if (data.intake.marketingConsent === "yes") await db.update(contacts).set({ marketingConsentAt: new Date() }).where(eq(contacts.id, contact.id));

  const budget = data.budget ? Number(data.budget.replace(/[^0-9.]/g, "")) : budgetFromRange(data.intake.budgetRange);
  const notes = data.message || null;
  const [lead] = await db
    .insert(leads)
    .values({
      businessId: business.id,
      contactId: contact.id,
      title: data.service || "Website quote request",
      source,
      estimatedValue: Number.isFinite(budget) && budget > 0 ? Math.round(budget * 100) : 0,
      notes,
      attribution,
      intake: Object.keys(intake).length ? intake : null,
    })
    .returning({ id: leads.id });
  // Chat leads get a booking or handoff alert instead (sent by the assistant).
  if (meta.channel !== "chat") {
    const who = `${data.firstName} ${data.lastName}`.trim();
    await notify(business, "newLead", {
      title: `New lead: ${who}`,
      detail: [data.service || "Quote request", data.phone, data.email, `via ${source === "website" ? "website" : source}`].filter(Boolean).join(" · "),
      path: `/b/${business.slug}/leads/${lead.id}`,
    });
  }
  return { ok: true, leadId: lead.id };
}

/** "How did you hear about us?" answer -> lead source. */
export function sourceFromAnswer(answer: string): Source | null {
  const a = answer.toLowerCase();
  if (/google|search/.test(a)) return "google";
  if (/facebook|instagram|social/.test(a)) return "facebook";
  if (/angi|homeadvisor|thumbtack|yelp/.test(a)) return "angi";
  if (/friend|neighbor|neighbour|family|referr|word of mouth/.test(a)) return "referral";
  if (/repeat|past customer|worked with you|before/.test(a)) return "repeat";
  if (/sign|truck|yard|drove|saw/.test(a)) return "walk_in";
  return null;
}

/** "$15,000–$30,000" -> midpoint in dollars (used as the lead's starting estimate). */
export function budgetFromRange(range?: string): number {
  if (!range) return 0;
  const nums = (range.replace(/,/g, "").match(/\d+(\.\d+)?\s*k?/gi) ?? []).map((n) => parseFloat(n) * (/k/i.test(n) ? 1000 : 1));
  if (!nums.length) return 0;
  if (nums.length === 1) return /under|less|below|</i.test(range) ? nums[0] / 2 : /\+|over|more|above/i.test(range) ? nums[0] * 1.25 : nums[0];
  return (nums[0] + nums[1]) / 2;
}

function stripEmpty<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;
}

/** First IP in x-forwarded-for (set by Vercel), falling back to x-real-ip. */
export function clientIp(h: Headers) {
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}
