import { cache } from "react";
import { notFound } from "next/navigation";

/*
 * Loads a business's public website content from Nucleus.
 * The middleware turns each request's domain into a "site key":
 *   "roofingco.com"       -> look up by domain
 *   "slug~business-one"   -> look up by slug (preview addresses)
 * Responses are cached for 60 seconds, so edits in Nucleus show up within a minute.
 */

export type Photo = { id: string; caption: string | null; kind: "before" | "after" | "photo"; service: string | null; area: string | null; width: number | null; height: number | null };

export type SectionKey = "trust" | "services" | "projects" | "process" | "reviews" | "about" | "priorities" | "cta";
export type SectionText = { show: boolean; eyebrow: string; title: string; intro: string };

/** A page section's wording and whether it's shown, with a fallback for an older Nucleus. */
export function section(s: Site, key: SectionKey, fallback: Omit<SectionText, "show">): SectionText {
  return s.content.sections?.[key] ?? { show: true, ...fallback };
}

export type Site = {
  business: {
    name: string;
    slug: string;
    trade: string;
    color: string;
    phone: string | null;
    email: string | null;
    domain: string | null;
    formKey: string | null;
    assistant?: boolean;
    logo?: string | null; // "auto" = drawn from the business name (/logo/<variant>), or e.g. "arcus-painting" -> /brand/arcus/arcus-painting.svg
    logoAccent?: string;
    logoVersion?: string;
  };
  content: {
    tagline: string;
    heroHeadline: string;
    heroSubheadline: string;
    about: string;
    yearsInBusiness: number | null;
    license: string | null;
    insured: boolean;
    warranty: string;
    hours: string;
    primaryCity: string;
    serviceAreas: { name: string; slug: string }[];
    services: { name: string; slug: string; summary: string }[];
    reviews: { name: string; city?: string; text: string; rating: number }[];
    financing: string | null;
    theme?: "classic" | "bold" | "fresh" | "elegant" | "modern";
    // Editable in Nucleus (Social → Website content → Page sections). Optional so an older Nucleus still works.
    trustPoints?: { label: string; detail: string }[];
    priorities?: { title: string; text: string }[];
    process?: { title: string; text: string }[];
    sections?: Partial<Record<SectionKey, SectionText>>;
    social: Record<string, string>; // channel key -> profile URL (google, facebook, instagram, tiktok, …)
    analytics: { ga4?: string; googleAds?: string; metaPixel?: string };
  };
  photos?: Photo[];
};

export const photoUrl = (id: string) => `${nucleusUrl()}/api/public/photos/${id}`;

export const nucleusUrl = () => (process.env.NUCLEUS_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const getSite = cache(async (key: string): Promise<Site> => {
  const decoded = decodeURIComponent(key);
  const query = decoded.startsWith("slug~") ? `slug=${encodeURIComponent(decoded.slice(5))}` : `domain=${encodeURIComponent(decoded)}`;
  let res: Response;
  try {
    res = await fetch(`${nucleusUrl()}/api/public/site?${query}`, { next: { revalidate: 60, tags: [`site:${decoded}`] } });
  } catch {
    throw new Error("Could not reach Nucleus. Check NUCLEUS_URL.");
  }
  if (res.status === 404 || res.status === 400) notFound();
  if (!res.ok) throw new Error(`Nucleus returned ${res.status}`);
  return res.json();
});

/** Absolute base URL for canonical links, sitemaps and structured data. */
export const siteUrl = (s: Site) => (s.business.domain ? `https://${s.business.domain}` : "");

export const telHref = (phone: string | null) => (phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : undefined);

export const schemaType = (trade: string) => (/roof/i.test(trade) ? "RoofingContractor" : /plumb/i.test(trade) ? "Plumber" : /electric/i.test(trade) ? "Electrician" : "GeneralContractor");

/** Display names for social profile links in the footer, in display order. */
export const SOCIAL_NAMES: [string, string][] = [
  ["google", "Google"], ["facebook", "Facebook"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["youtube", "YouTube"],
  ["linkedin", "LinkedIn"], ["x", "X"], ["nextdoor", "Nextdoor"], ["pinterest", "Pinterest"], ["houzz", "Houzz"],
  ["homestars", "HomeStars"], ["yelp", "Yelp"], ["angi", "Angi"],
];

/** A business's logo image: generated from its name ("auto"), or a ready-made Arcus file. Logos saved under earlier brand names map to Arcus. */
export function logoSrc(b: Pick<Site["business"], "logo" | "logoVersion">, variant: "" | "-white" | "-stacked" | "-mark" = "") {
  if (!b.logo) return "";
  if (b.logo === "auto") return `/logo/${variant ? variant.slice(1) : "horizontal"}?v=${b.logoVersion ?? ""}`;
  return `/brand/arcus/${b.logo.replace(/^(credence|astra|archen)/, "arcus")}${variant}.svg`;
}
