import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Areas, CtaBand, PageHero, Section } from "@/components/Sections";
import { getSite } from "@/lib/site";

export const revalidate = 60;
type Props = { params: Promise<{ site: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await getSite((await params).site);
  return { title: "Service areas", description: `${s.business.name} serves ${s.content.serviceAreas.map((a) => a.name).join(", ")}.`, alternates: { canonical: "/areas" } };
}

export default async function AreasPage({ params }: Props) {
  const s = await getSite((await params).site);
  if (!s.content.serviceAreas.length) notFound();
  return (
    <>
      <PageHero eyebrow="Service areas" title={`Where ${s.business.name} works`} intro="Proudly serving these communities. Don't see your town? Call us. We may still be able to help." />
      <Section title="Cities and towns we serve"><Areas site={s} /></Section>
      <CtaBand site={s} />
    </>
  );
}
