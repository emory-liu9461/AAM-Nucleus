import Link from "next/link";
import { Areas, CtaBand, Hero, Process, Reviews, Section, ServicesGrid, TrustBar } from "@/components/Sections";
import { Icon } from "@/components/Icon";
import { getSite } from "@/lib/site";

export const revalidate = 60;

export default async function Home({ params }: { params: Promise<{ site: string }> }) {
  const s = await getSite((await params).site);
  const c = s.content;
  return (
    <>
      <Hero site={s} />
      <TrustBar site={s} />
      <Section eyebrow="What we do" title={`${s.business.trade} services`} intro="Every job gets a clear written quote, a clean job site and work we stand behind."
        action={<Link href="/services" className="btn-outline text-sm">All services</Link>}>
        <ServicesGrid site={s} limit={6} />
      </Section>
      <Process />
      {c.reviews.length > 0 && (
        <Section eyebrow="Reviews" title="What our customers say" action={c.reviews.length > 3 ? <Link href="/reviews" className="btn-outline text-sm">All reviews</Link> : undefined}>
          <Reviews site={s} limit={3} />
        </Section>
      )}
      <section className="py-16 sm:py-20">
        <div className="wrap grid gap-10 lg:grid-cols-2">
          <div>
            <p className="eyebrow">About us</p>
            <h2 className="h2 mt-2">Local, licensed and accountable</h2>
            <div className="prose-site mt-4"><p>{c.about}</p></div>
            <Link href="/about" className="inline-flex items-center gap-1 font-semibold text-brand">More about {s.business.name} <Icon name="arrow" className="h-4 w-4" /></Link>
          </div>
          <div className="space-y-6">
            {c.serviceAreas.length > 0 && (
              <div className="rounded-xl border border-line p-6">
                <h3 className="font-bold">Areas we serve</h3>
                <div className="mt-4"><Areas site={s} /></div>
              </div>
            )}
            {c.financing && (
              <div className="rounded-xl border border-line bg-brand-soft p-6">
                <h3 className="flex items-center gap-2 font-bold"><Icon name="dollar" className="h-5 w-5 text-brand" />Financing available</h3>
                <p className="mt-2 text-sm text-muted">{c.financing}</p>
              </div>
            )}
          </div>
        </div>
      </section>
      <CtaBand site={s} />
    </>
  );
}
