import type { Business, SiteContent } from "@/db/schema";
import { slugify } from "./format";

/*
 * Default website content per trade, so a brand-new business gets a complete,
 * sensible site immediately. Anything filled in on the Social tab overrides it.
 */

type Preset = { services: { name: string; summary: string }[]; hero: string; sub: string; warranty: string };

const PRESETS: Record<string, Preset> = {
  roofing: {
    hero: "Roofing done right, the first time",
    sub: "Replacements, repairs and storm damage, with free inspections and honest quotes.",
    warranty: "Workmanship warranty on every roof we install",
    services: [
      { name: "Roof Replacement", summary: "Complete tear-off and new roof systems in asphalt, metal and more." },
      { name: "Roof Repair", summary: "Leaks, missing shingles and flashing fixed fast, before small problems grow." },
      { name: "Storm Damage", summary: "Free inspections after hail and wind, and help working with your insurance." },
      { name: "Gutters", summary: "Seamless gutters, guards and downspouts that protect your home." },
      { name: "Skylights", summary: "New skylights and leak-free replacements that bring in natural light." },
      { name: "Inspections", summary: "Detailed roof inspections for buyers, sellers and peace of mind." },
    ],
  },
  remodeling: {
    hero: "Remodels you'll love coming home to",
    sub: "Kitchens, bathrooms, basements and additions, designed around how you live.",
    warranty: "Workmanship warranty on every project",
    services: [
      { name: "Kitchen Remodeling", summary: "Layouts, cabinets, counters and lighting for a kitchen that works." },
      { name: "Bathroom Remodeling", summary: "From quick refreshes to full spa-style renovations." },
      { name: "Basement Finishing", summary: "Turn unused space into living rooms, offices or guest suites." },
      { name: "Home Additions", summary: "More room without moving, permitted and built to code." },
      { name: "Decks & Patios", summary: "Outdoor living spaces built to last through every season." },
      { name: "Flooring", summary: "Hardwood, tile, LVP and more, installed with care." },
    ],
  },
  painting: {
    hero: "Fresh paint, flawless finish",
    sub: "Interior and exterior painting with careful prep, clean lines and a spotless cleanup.",
    warranty: "Workmanship warranty on every paint job",
    services: [
      { name: "Interior Painting", summary: "Walls, ceilings, trim and doors, with furniture and floors fully protected." },
      { name: "Exterior Painting", summary: "Siding, trim and doors, with thorough prep so the finish lasts for years." },
      { name: "Cabinet Painting", summary: "A smooth, durable factory-style finish that makes kitchens look new for a fraction of replacement cost." },
      { name: "Deck & Fence Staining", summary: "Cleaning, repairs and stain that protect wood from sun and weather." },
      { name: "Drywall Repair", summary: "Holes, cracks and water damage patched and textured to match before painting." },
      { name: "Commercial Painting", summary: "Offices, retail and rentals, scheduled around your business hours." },
    ],
  },
  cleaning: {
    hero: "A spotless space, without the hassle",
    sub: "Reliable home and office cleaning by a vetted, insured team, on your schedule.",
    warranty: "100% satisfaction: if something's missed, we come back and fix it",
    services: [
      { name: "Regular House Cleaning", summary: "Weekly, bi-weekly or monthly cleaning so your home always feels fresh." },
      { name: "Deep Cleaning", summary: "Top-to-bottom cleaning of kitchens, bathrooms, baseboards and more." },
      { name: "Move-In / Move-Out Cleaning", summary: "Empty-home cleaning that gets deposits back and new homes ready." },
      { name: "Post-Construction Cleaning", summary: "Dust, debris and residue removed after renovations and new builds." },
      { name: "Office & Commercial Cleaning", summary: "After-hours cleaning for offices, retail and common areas." },
      { name: "Window Cleaning", summary: "Streak-free interior and exterior windows, frames and tracks." },
    ],
  },
  landscaping: {
    hero: "Outdoor spaces you'll want to spend time in",
    sub: "Lawn care, gardens, hardscaping and seasonal cleanups for homes and businesses.",
    warranty: "Workmanship warranty on all installations",
    services: [
      { name: "Lawn Care", summary: "Mowing, edging, aeration and fertilizing for a healthy lawn." },
      { name: "Garden Design & Planting", summary: "Beds, shrubs and trees chosen to thrive in your yard." },
      { name: "Patios & Walkways", summary: "Interlock, flagstone and pavers, built on a solid base." },
      { name: "Retaining Walls", summary: "Durable walls that hold back soil and add usable space." },
      { name: "Spring & Fall Cleanups", summary: "Leaves, debris and beds cleared and ready for the season." },
      { name: "Snow Removal", summary: "Reliable winter plowing and shovelling for driveways and walkways." },
    ],
  },
  concrete: {
    hero: "Concrete work built to last",
    sub: "Driveways, patios, foundations and flatwork, done on schedule.",
    warranty: "Workmanship warranty on all concrete work",
    services: [
      { name: "Driveways", summary: "New driveways and replacements that handle years of traffic." },
      { name: "Patios", summary: "Plain, stamped and decorative patios for outdoor living." },
      { name: "Foundations", summary: "Footings, slabs and foundation walls for new builds and additions." },
      { name: "Sidewalks & Steps", summary: "Safe, level walkways and steps." },
      { name: "Concrete Repair", summary: "Crack repair, leveling and resurfacing." },
    ],
  },
  general: {
    hero: "Quality construction you can count on",
    sub: "Licensed, insured and local, with clear quotes and clean job sites.",
    warranty: "Workmanship warranty on every job",
    services: [
      { name: "Remodeling", summary: "Interior renovations from single rooms to whole homes." },
      { name: "Additions", summary: "More space, permitted and built to code." },
      { name: "Repairs", summary: "Reliable fixes, big and small." },
      { name: "Exterior Work", summary: "Siding, windows, doors, decks and more." },
    ],
  },
};

function presetFor(trade: string): Preset {
  const t = trade.toLowerCase();
  if (t.includes("roof")) return PRESETS.roofing;
  if (t.includes("remodel") || t.includes("renovat") || t.includes("kitchen") || t.includes("bath")) return PRESETS.remodeling;
  if (t.includes("paint") || t.includes("stain") || t.includes("coating")) return PRESETS.painting;
  if (t.includes("clean") || t.includes("janitor") || t.includes("maid")) return PRESETS.cleaning;
  if (t.includes("landscap") || t.includes("lawn") || t.includes("garden")) return PRESETS.landscaping;
  if (t.includes("concrete") || t.includes("paving") || t.includes("masonry")) return PRESETS.concrete;
  return PRESETS.general;
}

export type PublicSite = ReturnType<typeof publicSite>;

/** The Credence logo family (files in public/brand/credence and site/public/brand/credence). */
export const BRAND_LOGOS: { key: string; name: string; accent: string; trade: RegExp }[] = [
  { key: "credence-painting", name: "Credence Painting", accent: "#0F8B8D", trade: /paint|stain|coating/i },
  { key: "credence-cleaning", name: "Credence Cleaning", accent: "#2E9E5B", trade: /clean|janitor|maid/i },
  { key: "credence-roofing", name: "Credence Roofing", accent: "#B5452F", trade: /roof/i },
  { key: "credence-renovations", name: "Credence Renovations", accent: "#B8730A", trade: /remodel|renovat|kitchen|bath/i },
  { key: "credence-concrete", name: "Credence Concrete", accent: "#5B6B7F", trade: /concrete|paving|masonry/i },
  { key: "credence-landscaping", name: "Credence Landscaping", accent: "#4C8C2B", trade: /landscap|lawn|garden/i },
  { key: "credence", name: "Credence (parent brand)", accent: "#14213D", trade: /$^/ },
];

/** Chosen logo, or automatic: a business named "Credence…" gets the logo matching its trade. */
export function logoFor(b: Pick<Business, "name" | "trade" | "site">) {
  const chosen = b.site?.logo;
  if (chosen === "none") return null;
  if (chosen && BRAND_LOGOS.some((l) => l.key === chosen)) return chosen;
  if (!/^credence\b/i.test(b.name.trim())) return null;
  return BRAND_LOGOS.find((l) => l.trade.test(b.trade) || l.trade.test(b.name))?.key ?? "credence";
}

/** Everything the public website needs, and nothing private. */
export function publicSite(b: Business) {
  const p = presetFor(b.trade);
  const c: SiteContent = b.site ?? {};
  const fromForm = (b.formServices ?? "").split("\n").map((n) => n.trim()).filter(Boolean).map((name) => ({ name, summary: "" }));
  const services = c.services?.length ? c.services : fromForm.length ? fromForm : p.services;
  const primaryCity = c.primaryCity || c.serviceAreas?.[0] || "";
  const presetSummary = (name: string) => p.services.find((s) => s.name.toLowerCase() === name.toLowerCase())?.summary;
  return {
    business: {
      name: b.name,
      slug: b.slug,
      trade: b.trade,
      color: b.color,
      phone: b.phone,
      email: b.email,
      domain: b.domain,
      formKey: b.formEnabled ? b.formKey : null,
      logo: logoFor(b),
      // Show the AI chat on the website only when it's switched on and an API key is set.
      assistant: Boolean(b.assistant?.enabled && b.formEnabled && process.env.ANTHROPIC_API_KEY),
    },
    content: {
      tagline: c.tagline || `${b.trade}${primaryCity ? ` in ${primaryCity}` : ""}`,
      heroHeadline: c.heroHeadline || p.hero,
      heroSubheadline: c.heroSubheadline || p.sub,
      about:
        c.about ||
        `${b.name} is a locally owned ${b.trade.toLowerCase()} company${primaryCity ? ` serving ${primaryCity} and the surrounding area` : ""}. We show up when we say we will, give clear written quotes, keep job sites clean, and stand behind our work.`,
      yearsInBusiness: c.yearsInBusiness ?? null,
      license: c.license || null,
      insured: c.insured ?? true,
      warranty: c.warranty || p.warranty,
      hours: c.hours || "Mon–Fri 7am–6pm · Sat 8am–2pm",
      primaryCity,
      serviceAreas: (c.serviceAreas ?? []).filter(Boolean).map((name) => ({ name, slug: slugify(name) })),
      services: services.map((s) => ({ name: s.name, slug: slugify(s.name), summary: s.summary || presetSummary(s.name) || "" })),
      reviews: (c.reviews ?? []).filter((r) => r.name && r.text).map((r) => ({ ...r, rating: Math.min(5, Math.max(1, r.rating ?? 5)) })),
      financing: c.financing || null,
      social: c.social ?? {},
      analytics: c.analytics ?? {},
    },
  };
}

/** "https://www.Foo.com/path" -> "foo.com" */
export function normalizeDomain(input: string | null | undefined) {
  if (!input) return null;
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/^www\./, "");
  return /^[a-z0-9.-]+\.[a-z0-9-]{2,}$/.test(d) ? d : null;
}
