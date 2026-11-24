import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectGrid } from "@/components/Projects";
import { CtaBand, PageHero, Section } from "@/components/Sections";
import { getSite } from "@/lib/site";

export const revalidate = 60;
type Props = { params: Promise<{ site: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await getSite((await params).site);
  return { title: "Projects", description: `Recent ${s.business.trade.toLowerCase()} projects by ${s.business.name}.`, alternates: { canonical: "/projects" } };
}

export default async function Projects({ params }: Props) {
  const s = await getSite((await params).site);
  if (!s.photos?.length) notFound();
  return (
    <>
      <PageHero eyebrow="Our work" title="Recent projects" intro={`A look at ${s.business.trade.toLowerCase()} work we've done for homeowners${s.content.primaryCity ? ` around ${s.content.primaryCity}` : ""}.`} />
      <Section title={`${s.photos.length} photo${s.photos.length === 1 ? "" : "s"}`}><ProjectGrid site={s} /></Section>
      <CtaBand site={s} title="Want results like these?" />
    </>
  );
}
