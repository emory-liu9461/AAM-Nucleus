import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { QuoteForm } from "@/components/QuoteForm";
import { CtaBand, PageHero, Reviews, endpointFor, trustPoints } from "@/components/Sections";
import { getSite } from "@/lib/site";

export const revalidate = 60;
type Props = { params: Promise<{ site: string; service: string }> };

async function load(params: Props["params"]) {
  const p = await params;
  const s = await getSite(p.site);
  const svc = s.content.services.find((x) => x.slug === p.service);
  if (!svc) notFound();
  return { s, svc };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { s, svc } = await load(params);
  const where = s.content.primaryCity ? ` in ${s.content.primaryCity}` : "";
  return { title: `${svc.name}${where}`, description: svc.summary || `${svc.name}${where} from ${s.business.name}. Free quotes.`, alternates: { canonical: `/services/${svc.slug}` } };
}

export default async function ServicePage({ params }: Props) {
  const { s, svc } = await load(params);
  const c = s.content;
  const where = c.primaryCity ? ` in ${c.primaryCity}` : "";
  return (
    <>
      <PageHero eyebrow={s.business.trade} title={`${svc.name}${where}`} intro={svc.summary} />
      <section className="py-14">
        <div className="wrap grid gap-10 lg:grid-cols-[1fr_420px]">
          <div>
            <div className="prose-site">
              <p>
                Looking for {svc.name.toLowerCase()}{where}? {s.business.name} handles every step, from the first visit and a clear written quote to
                the finished job and the cleanup.
              </p>
              <p>We&apos;ll explain your options in plain language, give you an honest price, and schedule the work around you.</p>
            </div>
            <h2 className="mt-8 text-xl font-bold">Why homeowners choose us</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {trustPoints(s).map((t) => (
                <li key={t.label} className="flex gap-3 rounded-lg border border-line p-4">
                  <Icon name={t.icon} className="h-5 w-5 shrink-0 text-brand" />
                  <div><div className="font-semibold">{t.label}</div><div className="text-sm text-muted">{t.detail}</div></div>
                </li>
              ))}
            </ul>
            {c.reviews.length > 0 && (<><h2 className="mt-10 text-xl font-bold">Customer reviews</h2><div className="mt-4"><Reviews site={s} limit={2} /></div></>)}
            <h2 className="mt-10 text-xl font-bold">Other services</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {c.services.filter((x) => x.slug !== svc.slug).map((x) => (
                <li key={x.slug}><Link href={`/services/${x.slug}`} className="inline-block rounded-full border border-line px-4 py-2 text-sm hover:border-brand hover:text-brand">{x.name}</Link></li>
              ))}
            </ul>
          </div>
          <aside className="h-fit rounded-2xl border border-line bg-white p-6 shadow-xl shadow-slate-900/5 lg:sticky lg:top-24">
            <QuoteForm endpoint={endpointFor(s)} services={c.services.map((x) => x.name)} defaultService={svc.name} compact heading={`Get a ${svc.name.toLowerCase()} quote`} />
          </aside>
        </div>
      </section>
      <CtaBand site={s} />
    </>
  );
}
