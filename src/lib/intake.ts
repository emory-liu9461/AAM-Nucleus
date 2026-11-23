import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Attribution, Business } from "@/db/schema";

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

export type Intake = ReturnType<typeof normalize>;

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
  data: Intake,
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
  const source = sourceFrom(attribution);

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

  const budget = Number(data.budget.replace(/[^0-9.]/g, ""));
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
    })
    .returning({ id: leads.id });
  return { ok: true, leadId: lead.id };
}

function stripEmpty<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;
}

/** First IP in x-forwarded-for (set by Vercel), falling back to x-real-ip. */
export function clientIp(h: Headers) {
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}
