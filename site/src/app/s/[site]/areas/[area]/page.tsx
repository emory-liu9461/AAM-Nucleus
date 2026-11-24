import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { QuoteForm } from "@/components/QuoteForm";
import { ProjectGrid } from "@/components/Projects";
import { CtaBand, PageHero, Reviews, endpointFor } from "@/components/Sections";
import { getSite } from "@/lib/site";

export const revalidate = 60;
type Props = { params: Promise<{ site: string; area: string }> };

async function load(params: Props["params"]) {
  const p = await params;
  const s = await getSite(p.site);
  const area = s.content.serviceAreas.find((a) => a.slug === p.area);
  if (!area) notFound();
  return { s, area };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { s, area } = await load(params);
  return { title: `${s.business.trade} in ${area.name}`, description: `${s.business.trade} services in ${area.name} from ${s.business.name}. Free quotes.`, alternates: { canonical: `/areas/${area.slug}` } };
}

export default async function AreaPage({ params }: Props) {
  const { s, area } = await load(params);
  const c = s.content;
  const local = c.reviews.filter((r) => r.city && area.name.toLowerCase().startsWith(r.city.toLowerCase()));
  return (
    <>
      <PageHero eyebrow={area.name} title={`${s.business.trade} in ${area.name}`} intro={`${s.business.name} helps homeowners in ${area.name} with ${c.services.slice(0, 3).map((x) => x.name.toLowerCase()).join(", ")} and more.`} />
      <section className="py-14">
        <div className="wrap grid gap-10 lg:grid-cols-[1fr_420px]">
          <div>
            <h2 className="text-xl font-bold">Our services in {area.name}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {c.services.map((x) => (
                <li key={x.slug}>
                  <Link href={`/services/${x.slug}`} className="flex items-center justify-between gap-2 rounded-lg border border-line p-4 font-medium hover:border-brand hover:text-brand">
                    {x.name}<Icon name="arrow" className="h-4 w-4" />
                  </Link>
                </li>
              ))}
            </ul>
            {(local.length ? local : c.reviews).length > 0 && (
              <>
                <h2 className="mt-10 text-xl font-bold">{local.length ? `Reviews from ${area.name}` : "Customer reviews"}</h2>
                <div className="mt-4"><Reviews site={{ ...s, content: { ...c, reviews: local.length ? local : c.reviews } }} limit={2} /></div>
              </>
            )}
            {(s.photos ?? []).some((p) => p.area === area.slug) && (
              <><h2 className="mt-10 text-xl font-bold">Projects in {area.name}</h2><div className="mt-4"><ProjectGrid site={s} photos={(s.photos ?? []).filter((p) => p.area === area.slug)} limit={6} /></div></>
            )}
            <h2 className="mt-10 text-xl font-bold">Also serving</h2>
            <p className="mt-2 text-muted">
              {c.serviceAreas.filter((a) => a.slug !== area.slug).map((a, i, arr) => (
                <span key={a.slug}><Link className="text-brand hover:underline" href={`/areas/${a.slug}`}>{a.name}</Link>{i < arr.length - 1 ? ", " : ""}</span>
              ))}
            </p>
          </div>
          <aside className="h-fit rounded-2xl border border-line bg-white p-6 shadow-xl shadow-slate-900/5 lg:sticky lg:top-24">
            <QuoteForm businessName={s.business.name} endpoint={endpointFor(s)} services={c.services.map((x) => x.name)} compact heading={`Free quote in ${area.name}`} />
          </aside>
        </div>
      </section>
      <CtaBand site={s} title={`Need ${s.business.trade.toLowerCase()} help in ${area.name}?`} />
    </>
  );
}
