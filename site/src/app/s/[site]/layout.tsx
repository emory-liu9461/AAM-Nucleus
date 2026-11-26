import type { Metadata } from "next";
import { Analytics, TrackAttribution, TrackVisit } from "@/components/Tracking";
import { Footer, MobileBar } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ChatWidget } from "@/components/ChatWidget";
import { getSite, logoSrc, nucleusUrl, schemaType, siteUrl } from "@/lib/site";

type Props = { params: Promise<{ site: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await getSite((await params).site);
  const base = siteUrl(s);
  return {
    metadataBase: base ? new URL(base) : undefined,
    title: { default: `${s.business.name} | ${s.content.tagline}`, template: `%s | ${s.business.name}` },
    description: s.content.heroSubheadline,
    openGraph: { siteName: s.business.name, type: "website" },
    // Preview addresses (no domain yet) shouldn't appear in Google.
    robots: base ? undefined : { index: false, follow: false },
    icons: s.business.logo ? { icon: logoSrc(s.business.logo, "-mark"), apple: logoSrc(s.business.logo, "-mark") } : undefined,
  };
}

export default async function SiteLayout({ children, params }: Props & { children: React.ReactNode }) {
  const s = await getSite((await params).site);
  const base = siteUrl(s);
  const ld = {
    "@context": "https://schema.org",
    "@type": schemaType(s.business.trade),
    name: s.business.name,
    description: s.content.heroSubheadline,
    url: base || undefined,
    telephone: s.business.phone || undefined,
    email: s.business.email || undefined,
    areaServed: s.content.serviceAreas.length ? s.content.serviceAreas.map((a) => ({ "@type": "City", name: a.name })) : s.content.primaryCity || undefined,
    openingHours: undefined,
    sameAs: Object.values(s.content.social).filter(Boolean),
    logo: s.business.logo && base ? `${base}${logoSrc(s.business.logo)}` : undefined,
  };
  return (
    <div style={{ ["--brand" as string]: s.business.color }} className={`site-theme theme-${s.content.theme ?? "classic"} flex min-h-screen flex-col`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <Header site={s} />
      <main className="flex-1">{children}</main>
      <Footer site={s} />
      <MobileBar site={s} />
      {s.business.assistant && s.business.formKey && (
        <ChatWidget endpoint={`${nucleusUrl()}/api/public/chat/${s.business.formKey}`} businessName={s.business.name} phone={s.business.phone} />
      )}
      <TrackAttribution />
      {s.business.formKey && <TrackVisit endpoint={`${nucleusUrl()}/api/public/track/${s.business.formKey}`} />}
      <Analytics {...s.content.analytics} />
    </div>
  );
}
