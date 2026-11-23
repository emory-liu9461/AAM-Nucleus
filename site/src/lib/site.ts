import { cache } from "react";
import { notFound } from "next/navigation";

/*
 * Loads a business's public website content from Nucleus.
 * The middleware turns each request's domain into a "site key":
 *   "roofingco.com"       -> look up by domain
 *   "slug~business-one"   -> look up by slug (preview addresses)
 * Responses are cached for 60 seconds, so edits in Nucleus show up within a minute.
 */

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
    social: { facebook?: string; instagram?: string; google?: string };
    analytics: { ga4?: string; googleAds?: string; metaPixel?: string };
  };
};

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
