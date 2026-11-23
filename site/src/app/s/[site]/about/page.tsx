import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { Areas, CtaBand, PageHero, Process, trustPoints } from "@/components/Sections";
import { getSite } from "@/lib/site";

export const revalidate = 60;
type Props = { params: Promise<{ site: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await getSite((await params).site);
  return { title: "About us", description: s.content.about.slice(0, 155), alternates: { canonical: "/about" } };
}

export default async function About({ params }: Props) {
  const s = await getSite((await params).site);
  const c = s.content;
  return (
    <>
      <PageHero eyebrow="About us" title={`About ${s.business.name}`} />
      <section className="py-14">
        <div className="wrap grid gap-10 lg:grid-cols-[1fr_380px]">
          <div className="prose-site text-lg">{c.about.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}</div>
          <ul className="space-y-3">
            {trustPoints(s).map((t) => (
              <li key={t.label} className="flex gap-3 rounded-lg border border-line p-4">
                <Icon name={t.icon} className="h-5 w-5 shrink-0 text-brand" />
                <div><div className="font-semibold">{t.label}</div><div className="text-sm text-muted">{t.detail}</div></div>
              </li>
            ))}
            <li className="flex gap-3 rounded-lg border border-line p-4">
              <Icon name="clock" className="h-5 w-5 shrink-0 text-brand" />
              <div><div className="font-semibold">Hours</div><div className="text-sm text-muted">{c.hours}</div></div>
            </li>
          </ul>
        </div>
        {c.serviceAreas.length > 0 && <div className="wrap mt-12"><h2 className="text-xl font-bold">Areas we serve</h2><div className="mt-4"><Areas site={s} /></div></div>}
      </section>
      <Process />
      <CtaBand site={s} />
    </>
  );
}
