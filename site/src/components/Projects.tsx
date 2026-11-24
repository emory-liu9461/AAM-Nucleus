import type { Photo, Site } from "@/lib/site";
import { photoUrl } from "@/lib/site";

const BADGE: Record<string, string> = { before: "Before", after: "After" };

/** Grid of project photos (newest first, as ordered in Nucleus). */
export function ProjectGrid({ site, photos, limit }: { site: Site; photos?: Photo[]; limit?: number }) {
  const list = (photos ?? site.photos ?? []).slice(0, limit ?? 60);
  if (!list.length) return null;
  const serviceName = (slug: string | null) => site.content.services.find((s) => s.slug === slug)?.name;
  const areaName = (slug: string | null) => site.content.serviceAreas.find((a) => a.slug === slug)?.name;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((p) => {
        const meta = [serviceName(p.service), areaName(p.area)].filter(Boolean).join(" · ");
        return (
          <li key={p.id} className="overflow-hidden rounded-xl border border-line bg-white">
            <figure>
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(p.id)} alt={p.caption ?? `${serviceName(p.service) ?? site.business.trade} project by ${site.business.name}`}
                  width={p.width ?? undefined} height={p.height ?? undefined} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                {BADGE[p.kind] && <span className="absolute left-3 top-3 rounded-full bg-ink/80 px-2.5 py-0.5 text-xs font-semibold text-white">{BADGE[p.kind]}</span>}
              </div>
              {(p.caption || meta) && (
                <figcaption className="p-3 text-sm">
                  {p.caption && <div className="font-medium">{p.caption}</div>}
                  {meta && <div className="text-muted">{meta}</div>}
                </figcaption>
              )}
            </figure>
          </li>
        );
      })}
    </ul>
  );
}
