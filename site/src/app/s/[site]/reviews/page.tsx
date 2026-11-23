import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CtaBand, PageHero, Reviews, Section } from "@/components/Sections";
import { getSite } from "@/lib/site";

export const revalidate = 60;
type Props = { params: Promise<{ site: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await getSite((await params).site);
  return { title: "Reviews", description: `What customers say about ${s.business.name}.`, alternates: { canonical: "/reviews" } };
}

export default async function ReviewsPage({ params }: Props) {
  const s = await getSite((await params).site);
  if (!s.content.reviews.length) notFound();
  return (
    <>
      <PageHero eyebrow="Reviews" title="What our customers say" />
      <Section title={`${s.content.reviews.length} customer review${s.content.reviews.length === 1 ? "" : "s"}`}
        action={s.content.social.google ? <a href={s.content.social.google} target="_blank" rel="noopener" className="btn-outline text-sm">Leave us a Google review</a> : undefined}>
        <Reviews site={s} />
      </Section>
      <CtaBand site={s} />
    </>
  );
}
