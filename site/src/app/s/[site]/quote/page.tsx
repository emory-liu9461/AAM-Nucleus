import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { QuoteForm } from "@/components/QuoteForm";
import { PageHero, endpointFor } from "@/components/Sections";
import { getSite, telHref } from "@/lib/site";

export const revalidate = 60;
type Props = { params: Promise<{ site: string }>; searchParams: Promise<{ service?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await getSite((await params).site);
  return { title: "Get a free quote", description: `Request a free, no-obligation quote from ${s.business.name}.`, alternates: { canonical: "/quote" } };
}

export default async function Quote({ params, searchParams }: Props) {
  const [p, sp] = await Promise.all([params, searchParams]);
  const s = await getSite(p.site);
  const b = s.business;
  const svc = s.content.services.find((x) => x.slug === sp.service)?.name;
  return (
    <>
      <PageHero eyebrow="Free quote" title="Tell us about your project" intro="We'll get back to you within one business day, usually sooner." />
      <section className="py-14">
        <div className="wrap grid gap-10 lg:grid-cols-[1fr_340px]">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
            <QuoteForm endpoint={endpointFor(s)} services={s.content.services.map((x) => x.name)} defaultService={svc} />
          </div>
          <aside className="space-y-4">
            {b.phone && (
              <a href={telHref(b.phone)} className="flex items-center gap-3 rounded-xl border border-line p-5 hover:border-brand">
                <Icon name="phone" className="h-6 w-6 text-brand" />
                <div><div className="text-sm text-muted">Prefer to talk?</div><div className="text-lg font-bold">{b.phone}</div></div>
              </a>
            )}
            <div className="flex items-center gap-3 rounded-xl border border-line p-5">
              <Icon name="clock" className="h-6 w-6 text-brand" />
              <div><div className="text-sm text-muted">Hours</div><div className="font-semibold">{s.content.hours}</div></div>
            </div>
            {b.email && (
              <a href={`mailto:${b.email}`} className="flex items-center gap-3 rounded-xl border border-line p-5 hover:border-brand">
                <Icon name="doc" className="h-6 w-6 text-brand" />
                <div><div className="text-sm text-muted">Email</div><div className="font-semibold">{b.email}</div></div>
              </a>
            )}
          </aside>
        </div>
      </section>
    </>
  );
}
