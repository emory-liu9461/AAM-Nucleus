import Link from "next/link";
import { Areas, CtaBand, Hero, Priorities, Process, Reviews, Section, ServicesGrid, TrustBar } from "@/components/Sections";
import { Icon } from "@/components/Icon";
import { ProjectGrid } from "@/components/Projects";
import { getSite, section } from "@/lib/site";

export const revalidate = 60;

export default async function Home({ params }: { params: Promise<{ site: string }> }) {
  const s = await getSite((await params).site);
  const c = s.content;
  const services = section(s, "services", { eyebrow: "What we do", title: `${s.business.trade} services`, intro: "Every job gets a clear written quote, a clean job site and work we stand behind." });
  const projects = section(s, "projects", { eyebrow: "Our work", title: "Recent projects", intro: "" });
  const reviews = section(s, "reviews", { eyebrow: "Reviews", title: "What our customers say", intro: "" });
  const about = section(s, "about", { eyebrow: "About us", title: "Local, licensed and accountable", intro: "" });
  return (
    <>
      <Hero site={s} />
      <TrustBar site={s} />
      {services.show && (
        <Section eyebrow={services.eyebrow} title={services.title} intro={services.intro || undefined}
          action={<Link href="/services" className="btn-outline text-sm">All services</Link>}>
          <ServicesGrid site={s} limit={6} />
        </Section>
      )}
      {projects.show && (s.photos?.length ?? 0) > 0 && (
        <Section eyebrow={projects.eyebrow} title={projects.title} intro={projects.intro || undefined} action={(s.photos?.length ?? 0) > 6 ? <Link href="/projects" className="btn-outline text-sm">All projects</Link> : undefined}>
          <ProjectGrid site={s} limit={6} />
        </Section>
      )}
      <Process site={s} />
      {reviews.show && c.reviews.length > 0 && (
        <Section eyebrow={reviews.eyebrow} title={reviews.title} intro={reviews.intro || undefined} action={c.reviews.length > 3 ? <Link href="/reviews" className="btn-outline text-sm">All reviews</Link> : undefined}>
          <Reviews site={s} limit={3} />
        </Section>
      )}
      <section className="py-16 sm:py-20">
        <div className="wrap grid gap-10 lg:grid-cols-2">
          {about.show ? (
            <div>
              {about.eyebrow && <p className="eyebrow">{about.eyebrow}</p>}
              <h2 className="h2 mt-2">{about.title}</h2>
              <div className="prose-site mt-4"><p>{c.about}</p></div>
              <Link href="/about" className="inline-flex items-center gap-1 font-semibold text-brand">More about {s.business.name} <Icon name="arrow" className="h-4 w-4" /></Link>
            </div>
          ) : <Priorities site={s} />}
          <div className="space-y-6">
            {about.show && <Priorities site={s} />}
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
