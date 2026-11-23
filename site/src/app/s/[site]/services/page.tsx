import type { Metadata } from "next";
import { CtaBand, PageHero, Section, ServicesGrid } from "@/components/Sections";
import { getSite } from "@/lib/site";

export const revalidate = 60;
type Props = { params: Promise<{ site: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await getSite((await params).site);
  return { title: "Services", description: `${s.business.trade} services from ${s.business.name}${s.content.primaryCity ? ` in ${s.content.primaryCity}` : ""}.`, alternates: { canonical: "/services" } };
}

export default async function Services({ params }: Props) {
  const s = await getSite((await params).site);
  return (
    <>
      <PageHero eyebrow="Services" title={`${s.business.trade} services${s.content.primaryCity ? ` in ${s.content.primaryCity}` : ""}`} intro={s.content.heroSubheadline} />
      <Section title="What we can help with"><ServicesGrid site={s} /></Section>
      <CtaBand site={s} />
    </>
  );
}
