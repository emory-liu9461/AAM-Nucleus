/*
 * Social and review channels a business can link. Each gets a profile link (shown on
 * the website and given to Google as "sameAs"), and a tracked quote link so visits
 * and leads from that channel are credited to it on the dashboard.
 */
export type SocialChannel = {
  key: string; // also the utm_source used in tracked links
  name: string;
  hosts: RegExp; // which profile addresses are accepted
  placeholder: string;
  tip: string;
};

export const SOCIAL_CHANNELS: SocialChannel[] = [
  { key: "google", name: "Google Business Profile", hosts: /(^|\.)(google\.[a-z.]+|g\.page|goo\.gl|maps\.app\.goo\.gl)$/, placeholder: "https://g.page/r/…", tip: "Set your website to your site, and the Appointments / Quote link to the tracked link. This is where most local customers find you." },
  { key: "facebook", name: "Facebook", hosts: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/, placeholder: "https://facebook.com/yourbusiness", tip: "Add the tracked link to your Page's Website field and the 'Book now' / 'Get quote' button." },
  { key: "instagram", name: "Instagram", hosts: /(^|\.)instagram\.com$/, placeholder: "https://instagram.com/yourbusiness", tip: "Put the tracked link in your bio. Before-and-after posts work well for trades." },
  { key: "tiktok", name: "TikTok", hosts: /(^|\.)tiktok\.com$/, placeholder: "https://tiktok.com/@yourbusiness", tip: "Add the tracked link to your profile. Short job time-lapses get views." },
  { key: "youtube", name: "YouTube", hosts: /(^|\.)(youtube\.com|youtu\.be)$/, placeholder: "https://youtube.com/@yourbusiness", tip: "Put the tracked link in your channel links and video descriptions." },
  { key: "linkedin", name: "LinkedIn", hosts: /(^|\.)linkedin\.com$/, placeholder: "https://linkedin.com/company/yourbusiness", tip: "Useful for commercial and property-manager work." },
  { key: "x", name: "X (Twitter)", hosts: /(^|\.)(x\.com|twitter\.com)$/, placeholder: "https://x.com/yourbusiness", tip: "Add the tracked link to your profile." },
  { key: "nextdoor", name: "Nextdoor", hosts: /(^|\.)nextdoor\.(com|ca)$/, placeholder: "https://nextdoor.com/pages/yourbusiness", tip: "Neighbours recommend local trades here. Add the tracked link to your business page." },
  { key: "pinterest", name: "Pinterest", hosts: /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, placeholder: "https://pinterest.com/yourbusiness", tip: "Good for remodeling and painting inspiration boards." },
  { key: "houzz", name: "Houzz", hosts: /(^|\.)houzz\.[a-z.]+$/, placeholder: "https://houzz.com/pro/yourbusiness", tip: "Homeowners planning renovations browse pros and project photos here." },
  { key: "homestars", name: "HomeStars", hosts: /(^|\.)homestars\.com$/, placeholder: "https://homestars.com/companies/…", tip: "Canada's main review site for home services. Ask happy customers to review you here." },
  { key: "yelp", name: "Yelp", hosts: /(^|\.)yelp\.[a-z.]+$/, placeholder: "https://yelp.com/biz/yourbusiness", tip: "Keep your hours and service area up to date." },
  { key: "angi", name: "Angi", hosts: /(^|\.)(angi\.com|angieslist\.com|homeadvisor\.com)$/, placeholder: "https://angi.com/companylist/…", tip: "Leads from Angi are credited to Angi on the dashboard." },
];

export const socialChannel = (key: string) => SOCIAL_CHANNELS.find((c) => c.key === key);

/** Accepts "facebook.com/x" or full URLs; returns a clean https URL, or null if it doesn't belong to that channel. */
export function normalizeSocialUrl(key: string, input: string | null | undefined) {
  if (!input?.trim()) return null;
  const ch = socialChannel(key);
  try {
    const u = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (ch && !ch.hosts.test(host)) return null;
    u.protocol = "https:";
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** The tracked link to share on a channel: website quote page if linked, otherwise the hosted quote form. */
export function trackedLink(base: string, channelKey: string) {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}utm_source=${channelKey}&utm_medium=social`;
}
