import Link from "next/link";
import type { Photo, Site } from "@/lib/site";
import { photoUrl, section, telHref } from "@/lib/site";
import { Icon, Stars } from "./Icon";
import { ProjectGrid } from "./Projects";
import { QuoteForm } from "./QuoteForm";
import {
  Areas, CtaBand, DEFAULT_PRIORITIES, DEFAULT_PROCESS, Hero, Priorities, Process, Reviews, STEP_ICONS, Section, ServicesGrid, TrustBar,
  endpointFor, serviceIcon, trustPoints,
} from "./Sections";

/*
 * One homepage layout per theme. They share the same content (edited in Nucleus) and section
 * on/off switches, but each arranges it differently so the five sites don't look alike:
 *   classic  split hero with the form beside it, card grids
 *   bold     dark full-bleed hero, numbered service rows, edge-to-edge photos, form at the bottom
 *   fresh    centred hero with the form under it, soft round tiles, speech-bubble reviews
 *   elegant  editorial: photo-led hero, roman numerals, one big quote, consultation section
 *   modern   gradient hero with a floating form card, bento services, stats, masonry reviews
 */

function texts(s: Site) {
  return {
    services: section(s, "services", { eyebrow: "What we do", title: `${s.business.trade} services`, intro: "Every job gets a clear written quote, a clean job site and work we stand behind." }),
    projects: section(s, "projects", { eyebrow: "Our work", title: "Recent projects", intro: "" }),
    reviews: section(s, "reviews", { eyebrow: "Reviews", title: "What our customers say", intro: "" }),
    about: section(s, "about", { eyebrow: "About us", title: "Local, licensed and accountable", intro: "" }),
    process: section(s, "process", { eyebrow: "How it works", title: "Simple from first call to final walkthrough", intro: "" }),
    priorities: section(s, "priorities", { eyebrow: "", title: "What we stand for", intro: `At ${s.business.name.replace(/\.+$/, "")}, we pride ourselves on these, in this order:` }),
    cta: section(s, "cta", { eyebrow: "", title: "Ready to get started?", intro: `Free, no-obligation quotes. ${s.content.hours}.` }),
    trust: section(s, "trust", { eyebrow: "", title: "", intro: "" }).show,
  };
}

const steps = (s: Site) => s.content.process ?? DEFAULT_PROCESS;
const priorities = (s: Site) => s.content.priorities ?? DEFAULT_PRIORITIES;
const photos = (s: Site) => s.photos ?? [];
const pad = (n: number) => String(n).padStart(2, "0");
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const photoAlt = (s: Site, p: Photo) => p.caption ?? `${s.content.services.find((x) => x.slug === p.service)?.name ?? s.business.trade} project by ${s.business.name}`;

function Form({ site, heading }: { site: Site; heading: string }) {
  return <QuoteForm businessName={site.business.name} endpoint={endpointFor(site)} services={site.content.services.map((s) => s.name)} compact heading={heading} />;
}

function Head({ eyebrow, title, intro, center, light }: { eyebrow?: string; title: string; intro?: string; center?: boolean; light?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : ""}>
      {eyebrow && <p className="eyebrow" style={light ? { color: "color-mix(in oklab, var(--brand) 50%, white)" } : undefined}>{eyebrow}</p>}
      <h2 className={`h2 mt-2 ${light ? "text-white" : ""}`}>{title}</h2>
      {intro && <p className={`mt-3 text-lg ${light ? "text-white/75" : "text-muted"} ${center ? "mx-auto" : "max-w-2xl"}`}>{intro}</p>}
    </div>
  );
}

/* ================================ Classic ================================ */

export function HomeClassic({ site: s }: { site: Site }) {
  const t = texts(s);
  const c = s.content;
  return (
    <>
      <Hero site={s} />
      <TrustBar site={s} />
      {t.services.show && (
        <Section eyebrow={t.services.eyebrow} title={t.services.title} intro={t.services.intro || undefined} action={<Link href="/services" className="btn-outline text-sm">All services</Link>}>
          <ServicesGrid site={s} limit={6} />
        </Section>
      )}
      {t.projects.show && photos(s).length > 0 && (
        <Section eyebrow={t.projects.eyebrow} title={t.projects.title} intro={t.projects.intro || undefined} action={photos(s).length > 6 ? <Link href="/projects" className="btn-outline text-sm">All projects</Link> : undefined}>
          <ProjectGrid site={s} limit={6} />
        </Section>
      )}
      <Process site={s} />
      {t.reviews.show && c.reviews.length > 0 && (
        <Section eyebrow={t.reviews.eyebrow} title={t.reviews.title} intro={t.reviews.intro || undefined} action={c.reviews.length > 3 ? <Link href="/reviews" className="btn-outline text-sm">All reviews</Link> : undefined}>
          <Reviews site={s} limit={3} />
        </Section>
      )}
      <section className="py-16 sm:py-20">
        <div className="wrap grid gap-10 lg:grid-cols-2">
          {t.about.show ? (
            <div>
              {t.about.eyebrow && <p className="eyebrow">{t.about.eyebrow}</p>}
              <h2 className="h2 mt-2">{t.about.title}</h2>
              <div className="prose-site mt-4"><p>{c.about}</p></div>
              <Link href="/about" className="inline-flex items-center gap-1 font-semibold text-brand">More about {s.business.name} <Icon name="arrow" className="h-4 w-4" /></Link>
            </div>
          ) : <Priorities site={s} />}
          <div className="space-y-6">
            {t.about.show && <Priorities site={s} />}
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

/* ================================= Bold ================================== */

const STRIPES = { backgroundImage: "repeating-linear-gradient(-45deg, #fff 0 2px, transparent 2px 18px)" };
const BRAND_ON_DARK = { color: "color-mix(in oklab, var(--brand) 55%, white)" };

export function HomeBold({ site: s }: { site: Site }) {
  const t = texts(s);
  const { business: b, content: c } = s;
  const ph = photos(s);
  return (
    <>
      {/* Full-bleed dark hero, no form: one loud call to action */}
      <section className="relative overflow-hidden bg-[#0f1115] text-white">
        {ph[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl(ph[0].id)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
        ) : <div aria-hidden className="absolute inset-y-0 right-0 hidden w-1/2 opacity-[0.06] lg:block" style={STRIPES} />}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#0f1115] via-[#0f1115]/85 to-transparent" />
        <div className="wrap relative py-16 sm:py-24 lg:py-32">
          {c.primaryCity && <p className="eyebrow flex items-center gap-2" style={BRAND_ON_DARK}><span className="h-0.5 w-8 bg-brand" />{c.primaryCity}</p>}
          <h1 className="mt-5 max-w-4xl text-white">{c.heroHeadline}</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/75">{c.heroSubheadline}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href="#quote" className="btn-primary text-base">Get a free quote <Icon name="arrow" className="h-4 w-4" /></a>
            {b.phone && <a href={telHref(b.phone)} className="btn-outline !border-white/30 !bg-transparent text-base !text-white hover:!border-white"><Icon name="phone" className="h-4 w-4" />{b.phone}</a>}
          </div>
        </div>
        {t.trust && (
          <div className="relative border-t border-white/10 bg-black/50">
            <div className="wrap grid grid-cols-2 lg:auto-cols-fr lg:grid-flow-col">
              {trustPoints(s).map((p) => (
                <div key={p.label} className="border-l-4 border-brand px-4 py-5 sm:px-6">
                  <div className="font-head text-xl font-bold uppercase tracking-wide sm:text-2xl">{p.label}</div>
                  <div className="text-sm text-white/60">{p.detail}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Services as big numbered rows */}
      {t.services.show && (
        <section className="py-16 sm:py-24">
          <div className="wrap grid gap-10 lg:grid-cols-[1fr_2fr]">
            <div className="lg:sticky lg:top-32 lg:self-start">
              <Head eyebrow={t.services.eyebrow} title={t.services.title} intro={t.services.intro || undefined} />
              <Link href="/services" className="btn-outline mt-6 text-sm">All services</Link>
            </div>
            <ol className="border-t-4 border-ink">
              {c.services.slice(0, 8).map((sv, i) => (
                <li key={sv.slug} className="border-b border-line">
                  <Link href={`/services/${sv.slug}`} className="group flex items-start gap-5 py-6 sm:gap-8">
                    <span className="font-head text-4xl font-bold tabular-nums text-brand sm:text-5xl">{pad(i + 1)}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-head text-2xl font-bold uppercase sm:text-3xl">{sv.name}</h3>
                      {sv.summary && <p className="mt-1 text-muted">{sv.summary}</p>}
                    </div>
                    <Icon name="arrow" className="mt-2 h-6 w-6 shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-brand" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* Edge-to-edge photos */}
      {t.projects.show && ph.length > 0 && (
        <section className="bg-[#0f1115] py-16 text-white sm:py-20">
          <div className="wrap flex flex-wrap items-end justify-between gap-4">
            <Head eyebrow={t.projects.eyebrow} title={t.projects.title} intro={t.projects.intro || undefined} light />
            {ph.length > 6 && <Link href="/projects" className="btn-outline !border-white/30 !bg-transparent text-sm !text-white">All projects</Link>}
          </div>
          <ul className="mt-10 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {ph.slice(0, 6).map((p, i) => (
              <li key={p.id} className={`relative overflow-hidden ${ph.length === 1 ? "sm:col-span-2 lg:col-span-3" : i === 0 && ph.length >= 4 ? "lg:col-span-2 lg:row-span-2" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(p.id)} alt={photoAlt(s, p)} loading="lazy" className={`w-full object-cover ${ph.length === 1 ? "aspect-[21/9]" : "aspect-[4/3] h-full"}`} />
                {(p.caption || p.kind !== "photo") && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
                    {p.kind !== "photo" && <span className="mr-2 bg-brand px-2 py-0.5 text-xs font-bold uppercase">{p.kind}</span>}
                    <span className="font-head text-lg font-semibold uppercase">{p.caption}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Process on a solid brand band */}
      {t.process.show && steps(s).length > 0 && (
        <section className="relative overflow-hidden bg-brand py-16 text-white sm:py-20">
          <div aria-hidden className="absolute inset-0 opacity-[0.07]" style={STRIPES} />
          <div className="wrap relative">
            <p className="eyebrow !text-white/80">{t.process.eyebrow}</p>
            <h2 className="h2 mt-2 text-white">{t.process.title}</h2>
            {t.process.intro && <p className="mt-3 max-w-2xl text-lg text-white/80">{t.process.intro}</p>}
            <ol className="mt-10 grid gap-px overflow-hidden bg-white/20 sm:grid-cols-2 lg:auto-cols-fr lg:grid-flow-col">
              {steps(s).map((st, i) => (
                <li key={i} className="bg-brand p-6">
                  <div className="font-head text-6xl font-bold leading-none text-white/35">{pad(i + 1)}</div>
                  <h3 className="mt-4 font-head text-2xl font-bold uppercase">{st.title}</h3>
                  {st.text && <p className="mt-1 text-white/80">{st.text}</p>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* One featured review, the rest stacked */}
      {t.reviews.show && c.reviews.length > 0 && (
        <section className="bg-surface py-16 sm:py-24">
          <div className="wrap">
            <Head eyebrow={t.reviews.eyebrow} title={t.reviews.title} intro={t.reviews.intro || undefined} />
            <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
              <figure className="border-l-8 border-brand bg-white p-8 sm:p-10">
                <div className="font-head text-7xl leading-none text-brand">&ldquo;</div>
                <blockquote className="-mt-4 text-2xl font-semibold leading-snug">{c.reviews[0].text}</blockquote>
                <figcaption className="mt-6 flex flex-wrap items-center gap-3 font-head text-lg font-bold uppercase">
                  <Stars n={c.reviews[0].rating} />{c.reviews[0].name}{c.reviews[0].city && <span className="font-normal text-muted">· {c.reviews[0].city}</span>}
                </figcaption>
              </figure>
              <div className="space-y-4">
                {c.reviews.slice(1, 4).map((r, i) => (
                  <figure key={i} className="border-l-4 border-ink/80 bg-white p-5">
                    <Stars n={r.rating} />
                    <blockquote className="mt-2 text-sm">&ldquo;{r.text}&rdquo;</blockquote>
                    <figcaption className="mt-2 text-sm font-bold uppercase tracking-wide">{r.name}</figcaption>
                  </figure>
                ))}
                {c.reviews.length > 4 && <Link href="/reviews" className="inline-flex items-center gap-1 font-bold uppercase tracking-wide text-brand">All reviews <Icon name="arrow" className="h-4 w-4" /></Link>}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Dark quote section: phone, promises and the form */}
      <section id="quote" className="scroll-mt-28 bg-[#0f1115] py-16 text-white sm:py-24">
        <div className="wrap grid gap-12 lg:grid-cols-2">
          <div>
            <p className="eyebrow" style={BRAND_ON_DARK}>Free estimates</p>
            <h2 className="h2 mt-2 text-white">{t.cta.title}</h2>
            {t.cta.intro && <p className="mt-3 text-lg text-white/70">{t.cta.intro}</p>}
            {b.phone && (
              <a href={telHref(b.phone)} className="mt-6 inline-flex items-center gap-3 font-head text-4xl font-bold hover:text-brand sm:text-5xl">
                <Icon name="phone" className="h-8 w-8 text-brand" />{b.phone}
              </a>
            )}
            {t.about.show && <p className="mt-8 max-w-xl text-white/70">{c.about}</p>}
            {t.priorities.show && (
              <ul className="mt-8 space-y-3">
                {priorities(s).map((p, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-brand font-head font-bold">{i + 1}</span>
                    <div><span className="font-head text-lg font-bold uppercase">{p.title}</span>{p.text && <span className="block text-sm text-white/60">{p.text}</span>}</div>
                  </li>
                ))}
              </ul>
            )}
            {c.serviceAreas.length > 0 && (
              <p className="mt-8 text-sm text-white/60">
                <span className="font-bold uppercase tracking-wider text-white">Serving: </span>
                {c.serviceAreas.map((a, i) => <span key={a.slug}>{i ? ", " : ""}<Link className="hover:text-white" href={`/areas/${a.slug}`}>{a.name}</Link></span>)}
              </p>
            )}
          </div>
          <div className="self-start border-t-8 border-brand bg-white p-6 text-ink sm:p-8">
            <Form site={s} heading="Request your free quote" />
          </div>
        </div>
      </section>
    </>
  );
}

/* ================================= Fresh ================================= */

export function HomeFresh({ site: s }: { site: Site }) {
  const t = texts(s);
  const { business: b, content: c } = s;
  const ph = photos(s);
  return (
    <>
      {/* Centred hero, trust as pills, the form right under it */}
      <section className="relative overflow-hidden bg-brand-soft lg:-mt-[5.5rem] lg:pt-[5.5rem]">
        <div aria-hidden className="absolute -right-24 -top-10 h-96 w-96 rounded-full opacity-50" style={{ background: "color-mix(in oklab, var(--brand) 20%, white)" }} />
        <div aria-hidden className="absolute -left-28 top-1/3 h-80 w-80 rounded-full opacity-40" style={{ background: "color-mix(in oklab, var(--brand) 28%, white)" }} />
        <div className="wrap relative pb-6 pt-12 text-center sm:pt-16">
          {c.primaryCity && <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-brand shadow-sm"><Icon name="pin" className="h-4 w-4" />Serving {c.primaryCity}</span>}
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl sm:text-5xl lg:text-6xl">{c.heroHeadline}</h1>
          <p className="lead mx-auto mt-5 max-w-2xl">{c.heroSubheadline}</p>
          {t.trust && (
            <ul className="mt-7 flex flex-wrap justify-center gap-2">
              {trustPoints(s).map((p) => (
                <li key={p.label} className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium shadow-sm"><Icon name={p.icon} className="h-4 w-4 text-brand" />{p.label}</li>
              ))}
            </ul>
          )}
          <div id="quote" className="mx-auto mt-10 max-w-3xl scroll-mt-28 rounded-[2rem] bg-white p-6 text-left shadow-xl shadow-slate-900/10 sm:p-8">
            <Form site={s} heading="Get your free quote in a minute" />
          </div>
          {b.phone && <p className="mt-5 text-sm text-muted">Rather talk? Call <a href={telHref(b.phone)} className="font-semibold text-brand">{b.phone}</a></p>}
        </div>
        <svg aria-hidden viewBox="0 0 1440 70" preserveAspectRatio="none" className="relative block h-12 w-full text-white sm:h-16"><path fill="currentColor" d="M0 40 C 320 90 760 -10 1100 30 C 1260 48 1360 50 1440 40 V70 H0Z" /></svg>
      </section>

      {/* Round icon tiles */}
      {t.services.show && (
        <section className="py-16 sm:py-20">
          <div className="wrap">
            <Head eyebrow={t.services.eyebrow} title={t.services.title} intro={t.services.intro || undefined} center />
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {c.services.slice(0, 6).map((sv) => (
                <Link key={sv.slug} href={`/services/${sv.slug}`} className="group rounded-[1.75rem] bg-surface p-7 text-center transition hover:-translate-y-1 hover:bg-brand-soft">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-brand shadow-md shadow-slate-900/5 transition group-hover:bg-brand group-hover:text-white"><Icon name={serviceIcon(sv.name, b.trade)} className="h-7 w-7" /></span>
                  <h3 className="mt-5 text-lg font-bold">{sv.name}</h3>
                  {sv.summary && <p className="mt-2 text-sm text-muted">{sv.summary}</p>}
                </Link>
              ))}
            </div>
            {c.services.length > 6 && <div className="mt-8 text-center"><Link href="/services" className="btn-outline text-sm">See all services</Link></div>}
          </div>
        </section>
      )}

      {/* Steps joined by a dotted line */}
      {t.process.show && steps(s).length > 0 && (
        <section className="bg-surface py-16 sm:py-20">
          <div className="wrap">
            <Head eyebrow={t.process.eyebrow} title={t.process.title} intro={t.process.intro || undefined} center />
            <ol className="relative mt-12 grid gap-10 sm:grid-cols-2 lg:auto-cols-fr lg:grid-flow-col">
              <div aria-hidden className="absolute left-[12%] right-[12%] top-8 hidden border-t-2 border-dashed lg:block" style={{ borderColor: "color-mix(in oklab, var(--brand) 35%, white)" }} />
              {steps(s).map((st, i) => (
                <li key={i} className="relative text-center">
                  <span className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white shadow-lg ring-8 ring-[var(--surface)]"><Icon name={STEP_ICONS[i % STEP_ICONS.length]} className="h-7 w-7" /></span>
                  <div className="mt-4 text-xs font-bold uppercase tracking-wider text-brand">Step {i + 1}</div>
                  <h3 className="mt-1 text-lg font-bold">{st.title}</h3>
                  {st.text && <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{st.text}</p>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {t.projects.show && ph.length > 0 && (
        <section className="py-16 sm:py-20">
          <div className="wrap">
            <Head eyebrow={t.projects.eyebrow} title={t.projects.title} intro={t.projects.intro || undefined} center />
            <ul className={`mt-10 grid gap-5 ${ph.length === 1 ? "mx-auto max-w-3xl" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
              {ph.slice(0, 6).map((p) => (
                <li key={p.id} className="text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(p.id)} alt={photoAlt(s, p)} loading="lazy" className="aspect-[4/3] w-full rounded-[1.75rem] object-cover" />
                  {p.caption && <p className="mt-3 text-sm font-medium">{p.caption}</p>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Speech-bubble reviews */}
      {t.reviews.show && c.reviews.length > 0 && (
        <section className="bg-brand-soft py-16 sm:py-20">
          <div className="wrap">
            <Head eyebrow={t.reviews.eyebrow} title={t.reviews.title} intro={t.reviews.intro || undefined} center />
            <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {c.reviews.slice(0, 3).map((r, i) => (
                <figure key={i}>
                  <div className="relative rounded-[1.75rem] bg-white p-6 shadow-sm">
                    <Stars n={r.rating} />
                    <blockquote className="mt-3">&ldquo;{r.text}&rdquo;</blockquote>
                    <span aria-hidden className="absolute -bottom-2 left-10 h-5 w-5 rotate-45 bg-white" />
                  </div>
                  <figcaption className="mt-5 flex items-center gap-3 pl-6">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{initials(r.name)}</span>
                    <span className="text-sm"><span className="block font-semibold">{r.name}</span>{r.city && <span className="text-muted">{r.city}</span>}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* About + promises + areas */}
      {(t.about.show || t.priorities.show) && (
        <section className="py-16 sm:py-20">
          <div className="wrap grid items-start gap-10 lg:grid-cols-2">
            {t.about.show && (
              <div>
                <Head eyebrow={t.about.eyebrow} title={t.about.title} />
                <div className="prose-site mt-4"><p>{c.about}</p></div>
                {c.serviceAreas.length > 0 && <div className="mt-6"><Areas site={s} /></div>}
              </div>
            )}
            {t.priorities.show && (
              <div className="rounded-[2rem] bg-surface p-6 sm:p-8">
                <h3 className="text-xl font-bold">{t.priorities.title}</h3>
                {t.priorities.intro && <p className="mt-1 text-sm text-muted">{t.priorities.intro}</p>}
                <ul className="mt-5 space-y-3">
                  {priorities(s).map((p, i) => (
                    <li key={i} className="flex gap-3 rounded-2xl bg-white p-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><Icon name="check" className="h-5 w-5" /></span>
                      <div><div className="font-semibold">{p.title}</div>{p.text && <div className="text-sm text-muted">{p.text}</div>}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {t.cta.show && (
        <section className="pb-16 sm:pb-20">
          <div className="wrap">
            <div className="relative overflow-hidden rounded-[2rem] bg-brand px-6 py-12 text-center text-white sm:px-12">
              <div aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
              <div aria-hidden className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/10" />
              <h2 className="relative text-3xl font-bold sm:text-4xl">{t.cta.title}</h2>
              {t.cta.intro && <p className="relative mt-2 text-white/85">{t.cta.intro}</p>}
              <div className="relative mt-6 flex flex-wrap justify-center gap-3">
                <a href="#quote" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-brand-dark hover:bg-white/90">Get a free quote</a>
                {b.phone && <a href={telHref(b.phone)} className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 font-semibold hover:bg-white/10"><Icon name="phone" className="h-4 w-4" />{b.phone}</a>}
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/* ================================ Elegant ================================ */

export function HomeElegant({ site: s }: { site: Site }) {
  const t = texts(s);
  const { business: b, content: c } = s;
  const ph = photos(s);
  const promise = t.priorities.show && priorities(s).length > 0;
  return (
    <>
      {/* Editorial hero: words on the left, a framed photo (or the promise) on the right */}
      <section className="bg-surface">
        <div className="wrap grid items-center gap-12 py-16 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div>
            {c.primaryCity && <p className="eyebrow">{c.primaryCity}</p>}
            <div aria-hidden className="mt-5 h-px w-16 bg-brand" />
            <h1 className="mt-6 text-5xl sm:text-6xl lg:text-7xl">{c.heroHeadline}</h1>
            <p className="lead mt-6 max-w-xl">{c.heroSubheadline}</p>
            <div className="mt-9 flex flex-wrap items-center gap-6">
              <a href="#quote" className="btn-primary">Book a consultation</a>
              {b.phone && <a href={telHref(b.phone)} className="border-b border-ink/40 pb-0.5 tracking-wide hover:border-brand hover:text-brand">{b.phone}</a>}
            </div>
          </div>
          {ph[0] ? (
            <div className="relative mr-4 mt-4">
              <div aria-hidden className="absolute -right-4 -top-4 h-full w-full border border-brand/50" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(ph[0].id)} alt={photoAlt(s, ph[0])} className="relative aspect-[4/5] w-full object-cover" />
            </div>
          ) : promise ? (
            <div className="relative mr-4 mt-4">
              <div aria-hidden className="absolute -right-4 -top-4 h-full w-full border border-brand/50" />
              <div className="relative bg-white p-8 sm:p-10">
                <p className="eyebrow">Our promise</p>
                <ol className="mt-6 space-y-6">
                  {priorities(s).map((p, i) => (
                    <li key={i} className="flex gap-5">
                      <span className="font-head w-8 shrink-0 text-2xl text-brand">{ROMAN[i]}</span>
                      <div><div className="font-head text-xl">{p.title}</div>{p.text && <div className="mt-1 text-sm text-muted">{p.text}</div>}</div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}
        </div>
        {t.trust && (
          <div className="border-t border-line">
            <ul className="wrap flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-5 text-xs uppercase tracking-[0.2em] text-muted">
              {trustPoints(s).map((p, i) => (
                <li key={p.label} className="flex items-center gap-6">{i > 0 && <span aria-hidden className="h-1 w-1 rotate-45 bg-brand" />}{p.label}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* About as a centred essay */}
      {t.about.show && (
        <section className="py-20 sm:py-28">
          <div className="wrap max-w-3xl text-center">
            {t.about.eyebrow && <p className="eyebrow">{t.about.eyebrow}</p>}
            <h2 className="h2 mt-3">{t.about.title}</h2>
            <p className="mt-6 text-xl leading-relaxed text-muted">{c.about}</p>
            <p className="font-head mt-6 text-lg text-brand">The {b.name.replace(/\.+$/, "")} team</p>
            <Link href="/about" className="mt-6 inline-block text-xs uppercase tracking-[0.2em] text-muted hover:text-brand">Our story →</Link>
          </div>
          {ph[0] && promise && (
            <ol className="wrap mt-16 grid gap-10 border-t border-line pt-12 md:grid-cols-3">
              {priorities(s).map((p, i) => (
                <li key={i}>
                  <span className="font-head text-3xl text-brand">{ROMAN[i]}</span>
                  <div className="font-head mt-2 text-xl">{p.title}</div>
                  {p.text && <p className="mt-2 text-sm text-muted">{p.text}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* Services as an index */}
      {t.services.show && (
        <section className="border-t border-line py-20 sm:py-24">
          <div className="wrap">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <Head eyebrow={t.services.eyebrow} title={t.services.title} intro={t.services.intro || undefined} />
              <Link href="/services" className="text-xs uppercase tracking-[0.2em] text-muted hover:text-brand">All services →</Link>
            </div>
            <ol className="mt-12 grid gap-x-16 md:grid-cols-2">
              {c.services.slice(0, 8).map((sv, i) => (
                <li key={sv.slug} className="border-t border-line">
                  <Link href={`/services/${sv.slug}`} className="group flex gap-6 py-7">
                    <span className="font-head w-10 shrink-0 text-2xl text-brand">{ROMAN[i]}</span>
                    <div>
                      <h3 className="font-head text-2xl group-hover:text-brand">{sv.name}</h3>
                      {sv.summary && <p className="mt-2 text-muted">{sv.summary}</p>}
                      <span className="mt-3 inline-block text-xs uppercase tracking-[0.2em] text-muted group-hover:text-brand">Discover →</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* Portfolio: one large photo, the rest around it */}
      {t.projects.show && ph.length > 1 && (
        <section className="bg-surface py-20 sm:py-24">
          <div className="wrap">
            <Head eyebrow={t.projects.eyebrow} title={t.projects.title} intro={t.projects.intro || undefined} center />
            <ul className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {ph.slice(0, 5).map((p, i) => (
                <li key={p.id} className={i === 0 ? "col-span-2 row-span-2" : ""}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(p.id)} alt={photoAlt(s, p)} loading="lazy" className="aspect-square h-full w-full object-cover" />
                </li>
              ))}
            </ul>
            {ph.length > 5 && <div className="mt-10 text-center"><Link href="/projects" className="btn-outline">View the portfolio</Link></div>}
          </div>
        </section>
      )}

      {t.process.show && steps(s).length > 0 && (
        <section className="py-20 sm:py-24">
          <div className="wrap">
            <Head eyebrow={t.process.eyebrow} title={t.process.title} intro={t.process.intro || undefined} />
            <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:auto-cols-fr lg:grid-flow-col">
              {steps(s).map((st, i) => (
                <li key={i} className="border-t border-ink pt-6">
                  <span className="text-xs uppercase tracking-[0.2em] text-brand">Step {ROMAN[i]}</span>
                  <h3 className="font-head mt-3 text-2xl">{st.title}</h3>
                  {st.text && <p className="mt-2 text-sm text-muted">{st.text}</p>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* One large testimonial */}
      {t.reviews.show && c.reviews.length > 0 && (
        <section className="border-y border-line bg-surface py-20 sm:py-28">
          <div className="wrap max-w-4xl text-center">
            {t.reviews.eyebrow && <p className="eyebrow">{t.reviews.eyebrow}</p>}
            <div aria-hidden className="font-head mt-4 text-7xl leading-none text-brand">&ldquo;</div>
            <blockquote className="font-head text-2xl leading-snug sm:text-4xl">{c.reviews[0].text}</blockquote>
            <p className="mt-8 text-xs uppercase tracking-[0.25em] text-muted">{c.reviews[0].name}{c.reviews[0].city ? `, ${c.reviews[0].city}` : ""}</p>
            {c.reviews.length > 1 && (
              <div className="mt-14 grid gap-10 border-t border-line pt-10 text-left md:grid-cols-2">
                {c.reviews.slice(1, 3).map((r, i) => (
                  <figure key={i}>
                    <blockquote className="text-muted">&ldquo;{r.text}&rdquo;</blockquote>
                    <figcaption className="mt-3 text-xs uppercase tracking-[0.2em]">{r.name}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Consultation */}
      <section id="quote" className="scroll-mt-32 py-20 sm:py-24">
        <div className="wrap grid gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="eyebrow">Consultation</p>
            <h2 className="h2 mt-3">{t.cta.show ? t.cta.title : "Book a consultation"}</h2>
            {t.cta.intro && <p className="lead mt-4">{t.cta.intro}</p>}
            <dl className="mt-10 space-y-5 border-t border-line pt-8 text-sm">
              {b.phone && <div><dt className="text-xs uppercase tracking-[0.2em] text-muted">Telephone</dt><dd className="font-head mt-1 text-2xl"><a href={telHref(b.phone)} className="hover:text-brand">{b.phone}</a></dd></div>}
              {b.email && <div><dt className="text-xs uppercase tracking-[0.2em] text-muted">Email</dt><dd className="mt-1"><a href={`mailto:${b.email}`} className="hover:text-brand">{b.email}</a></dd></div>}
              <div><dt className="text-xs uppercase tracking-[0.2em] text-muted">Hours</dt><dd className="mt-1">{c.hours}</dd></div>
              {c.serviceAreas.length > 0 && <div><dt className="text-xs uppercase tracking-[0.2em] text-muted">Serving</dt><dd className="mt-1">{c.serviceAreas.map((a) => a.name).join(" · ")}</dd></div>}
            </dl>
          </div>
          <div className="border border-line bg-surface p-6 sm:p-10">
            <Form site={s} heading="Tell us about your project" />
          </div>
        </div>
      </section>
    </>
  );
}

/* ================================= Modern ================================ */

const GRADIENT = { background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 55%, #0b1220 100%)" };

export function HomeModern({ site: s }: { site: Site }) {
  const t = texts(s);
  const { business: b, content: c } = s;
  const ph = photos(s);
  const avg = c.reviews.length ? c.reviews.reduce((n, r) => n + r.rating, 0) / c.reviews.length : 0;
  const stats = [
    c.yearsInBusiness ? { n: `${c.yearsInBusiness}+`, l: "Years in business" } : null,
    c.reviews.length ? { n: avg.toFixed(1), l: `Average from ${c.reviews.length} review${c.reviews.length === 1 ? "" : "s"}` } : null,
    { n: String(c.services.length), l: "Services offered" },
    c.serviceAreas.length ? { n: String(c.serviceAreas.length), l: "Communities served" } : { n: "Free", l: "Written quotes" },
  ].filter((x): x is { n: string; l: string } => Boolean(x));
  const [first, ...rest] = c.services.slice(0, 7);
  return (
    <>
      {/* Gradient hero, centred */}
      <section className="relative overflow-hidden text-white" style={GRADIENT}>
        <div aria-hidden className="absolute -left-32 top-10 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="absolute -right-20 bottom-0 h-80 w-80 rounded-full blur-3xl" style={{ background: "color-mix(in oklab, var(--brand) 60%, white)", opacity: 0.25 }} />
        <div className="wrap relative pb-40 pt-16 text-center sm:pt-20 lg:pb-44 lg:pt-24">
          {c.primaryCity && <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm backdrop-blur"><span className="h-2 w-2 rounded-full bg-emerald-400" />Now booking in {c.primaryCity}</span>}
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl text-white sm:text-6xl lg:text-7xl">{c.heroHeadline}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80">{c.heroSubheadline}</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <a href="#quote" className="btn-primary !rounded-full !bg-white text-base !text-brand-dark hover:!bg-white/90">Get a free quote <Icon name="arrow" className="h-4 w-4" /></a>
            {b.phone && <a href={telHref(b.phone)} className="btn-outline !rounded-full !border-white/30 !bg-white/5 text-base !text-white hover:!border-white"><Icon name="phone" className="h-4 w-4" />{b.phone}</a>}
          </div>
        </div>
      </section>

      {/* Form card floating over the hero edge, with trust cards beside it */}
      <section className="relative z-10 -mt-28">
        <div className={`wrap grid gap-5 ${t.trust ? "lg:grid-cols-[1.35fr_1fr]" : "max-w-3xl"}`}>
          <div id="quote" className="scroll-mt-24 rounded-3xl bg-white p-6 shadow-2xl shadow-slate-900/20 sm:p-8">
            <Form site={s} heading="Request your free quote" />
          </div>
          {t.trust && (
            <ul className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:pt-36">
              {trustPoints(s).map((p) => (
                <li key={p.label} className="flex items-start gap-4 rounded-2xl bg-white p-5 shadow-xl shadow-slate-900/10">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white" style={GRADIENT}><Icon name={p.icon} className="h-5 w-5" /></span>
                  <div><div className="font-bold">{p.label}</div><div className="text-sm text-muted">{p.detail}</div></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Bento services */}
      {t.services.show && first && (
        <section className="py-16 sm:py-24">
          <div className="wrap">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <Head eyebrow={t.services.eyebrow} title={t.services.title} intro={t.services.intro || undefined} />
              <Link href="/services" className="btn-outline !rounded-full text-sm">All services</Link>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link href={`/services/${first.slug}`} className="group relative flex min-h-64 flex-col justify-end overflow-hidden rounded-3xl p-8 text-white sm:col-span-2 lg:row-span-2" style={GRADIENT}>
                <Icon name={serviceIcon(first.name, b.trade)} className="absolute right-6 top-6 h-24 w-24 text-white/15" />
                <span className="text-xs font-semibold uppercase tracking-wider text-white/70">Most requested</span>
                <h3 className="mt-2 text-3xl font-extrabold">{first.name}</h3>
                {first.summary && <p className="mt-2 max-w-md text-white/80">{first.summary}</p>}
                <span className="mt-5 inline-flex items-center gap-1 font-semibold">Learn more <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" /></span>
              </Link>
              {rest.map((sv) => (
                <Link key={sv.slug} href={`/services/${sv.slug}`} className="group rounded-3xl bg-surface p-6 transition hover:bg-white hover:shadow-xl hover:shadow-slate-900/10">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand shadow-sm"><Icon name={serviceIcon(sv.name, b.trade)} className="h-5 w-5" /></span>
                  <h3 className="mt-4 font-bold">{sv.name}</h3>
                  {sv.summary && <p className="mt-1 line-clamp-3 text-sm text-muted">{sv.summary}</p>}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* About with big numbers */}
      {t.about.show && (
        <section className="bg-surface py-16 sm:py-24">
          <div className="wrap grid items-center gap-12 lg:grid-cols-2">
            <div>
              <Head eyebrow={t.about.eyebrow} title={t.about.title} />
              <p className="mt-4 text-lg text-muted">{c.about}</p>
              <Link href="/about" className="mt-6 inline-flex items-center gap-1 font-semibold text-brand">More about us <Icon name="arrow" className="h-4 w-4" /></Link>
            </div>
            <dl className="grid grid-cols-2 gap-4">
              {stats.map((x) => (
                <div key={x.l} className="rounded-3xl bg-white p-6 shadow-sm">
                  <dt className="sr-only">{x.l}</dt>
                  <dd className="bg-clip-text text-5xl font-extrabold text-transparent" style={{ backgroundImage: GRADIENT.background }}>{x.n}</dd>
                  <div className="mt-2 text-sm text-muted">{x.l}</div>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      {/* Photos you swipe through */}
      {t.projects.show && ph.length > 0 && (
        <section className="py-16 sm:py-24">
          <div className="wrap">
            <Head eyebrow={t.projects.eyebrow} title={t.projects.title} intro={t.projects.intro || undefined} />
          </div>
          <ul className="wrap mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
            {ph.slice(0, 10).map((p) => (
              <li key={p.id} className={`shrink-0 snap-start ${ph.length === 1 ? "w-full" : "w-[85%] sm:w-[48%] lg:w-[32%]"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(p.id)} alt={photoAlt(s, p)} loading="lazy" className={`w-full rounded-3xl object-cover ${ph.length === 1 ? "aspect-[21/9]" : "aspect-[4/3]"}`} />
                {p.caption && <p className="mt-3 text-sm font-semibold">{p.caption}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Timeline */}
      {t.process.show && steps(s).length > 0 && (
        <section className="py-16 sm:py-24">
          <div className="wrap">
            <Head eyebrow={t.process.eyebrow} title={t.process.title} intro={t.process.intro || undefined} center />
            <ol className="relative mt-12 grid gap-8 sm:grid-cols-2 lg:auto-cols-fr lg:grid-flow-col">
              <div aria-hidden className="absolute left-[10%] right-[10%] top-6 hidden h-0.5 lg:block" style={GRADIENT} />
              {steps(s).map((st, i) => (
                <li key={i} className="relative rounded-3xl bg-white p-6 text-center lg:bg-transparent lg:p-0">
                  <span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full text-lg font-extrabold text-white ring-8 ring-white" style={GRADIENT}>{i + 1}</span>
                  <h3 className="mt-4 text-lg font-bold">{st.title}</h3>
                  {st.text && <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{st.text}</p>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* Masonry reviews */}
      {t.reviews.show && c.reviews.length > 0 && (
        <section className="bg-surface py-16 sm:py-24">
          <div className="wrap">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <Head eyebrow={t.reviews.eyebrow} title={t.reviews.title} intro={t.reviews.intro || undefined} />
              {avg > 0 && <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm"><Stars n={Math.round(avg)} /> {avg.toFixed(1)} / 5</div>}
            </div>
            <div className="mt-10 gap-4 md:columns-2 lg:columns-3">
              {c.reviews.slice(0, 6).map((r, i) => (
                <figure key={i} className="mb-4 break-inside-avoid rounded-3xl bg-white p-6 shadow-sm">
                  <Stars n={r.rating} />
                  <blockquote className="mt-3">&ldquo;{r.text}&rdquo;</blockquote>
                  <figcaption className="mt-4 flex items-center gap-3 text-sm">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white" style={GRADIENT}>{initials(r.name)}</span>
                    <span><span className="block font-semibold">{r.name}</span>{r.city && <span className="text-muted">{r.city}</span>}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {t.cta.show && (
        <section className="py-16 sm:py-20">
          <div className="wrap">
            <div className="flex flex-col items-start justify-between gap-6 rounded-3xl px-8 py-12 text-white sm:px-12 md:flex-row md:items-center" style={GRADIENT}>
              <div>
                <h2 className="text-3xl font-extrabold sm:text-4xl">{t.cta.title}</h2>
                {t.cta.intro && <p className="mt-2 text-white/80">{t.cta.intro}</p>}
                {c.serviceAreas.length > 0 && <p className="mt-3 text-sm text-white/60">Serving {c.serviceAreas.map((a) => a.name).join(", ")}</p>}
              </div>
              <div className="flex flex-wrap gap-3">
                <a href="#quote" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-brand-dark hover:bg-white/90">Get a free quote</a>
                {b.phone && <a href={telHref(b.phone)} className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 font-semibold hover:bg-white/10"><Icon name="phone" className="h-4 w-4" />{b.phone}</a>}
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

export const HOME_LAYOUTS = { classic: HomeClassic, bold: HomeBold, fresh: HomeFresh, elegant: HomeElegant, modern: HomeModern };
