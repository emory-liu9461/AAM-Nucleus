import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { deletePhoto, movePhoto, updatePhoto } from "@/app/actions";
import { PhotoUploader } from "@/components/PhotoUploader";
import { requireBusinessPage } from "@/lib/session";
import { publicSite } from "@/lib/site-defaults";

export default async function PhotosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { business: b } = await requireBusinessPage(slug, "manage_business");
  const { content } = publicSite(b);
  const photos = await db
    .select({ id: schema.projectPhotos.id, caption: schema.projectPhotos.caption, kind: schema.projectPhotos.kind, serviceSlug: schema.projectPhotos.serviceSlug, areaSlug: schema.projectPhotos.areaSlug, bytes: schema.projectPhotos.bytes })
    .from(schema.projectPhotos)
    .where(eq(schema.projectPhotos.businessId, b.id))
    .orderBy(desc(schema.projectPhotos.sortOrder));
  const services = content.services.map((s) => ({ slug: s.slug, name: s.name }));
  const areas = content.serviceAreas;

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <Link href={`/b/${b.slug}/social`} className="text-sm text-muted hover:text-ink">← Social</Link>
        <h1 className="text-xl font-semibold">Project photos</h1>
        <p className="text-sm text-muted">
          Photos of your work, shown on your website: a &ldquo;Recent projects&rdquo; section on the home page, a Projects page, and on the matching service page.
          Real before-and-after photos win far more quotes than text.
        </p>
      </div>
      <PhotoUploader slug={b.slug} services={services} areas={areas} />
      {photos.length === 0 ? (
        <p className="card text-sm text-muted">No photos yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((p, i) => (
            <div key={p.id} className="card space-y-2 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/public/photos/${p.id}`} alt={p.caption ?? "Project photo"} className="aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" />
              <form action={updatePhoto.bind(null, b.slug, p.id)} className="space-y-2 text-sm">
                <input className="input" name="caption" defaultValue={p.caption ?? ""} placeholder="Caption" maxLength={200} />
                <div className="grid grid-cols-3 gap-2">
                  <select className="input px-1" name="kind" defaultValue={p.kind}><option value="photo">Finished</option><option value="before">Before</option><option value="after">After</option></select>
                  <select className="input px-1" name="service" defaultValue={p.serviceSlug ?? ""}><option value="">Service</option>{services.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}</select>
                  <select className="input px-1" name="area" defaultValue={p.areaSlug ?? ""}><option value="">Area</option>{areas.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-ghost py-1 text-xs">Save</button>
                  <span className="ml-auto text-xs text-muted">{Math.round(p.bytes / 1024)} KB</span>
                </div>
              </form>
              <div className="flex items-center gap-2 text-xs">
                <form action={movePhoto.bind(null, b.slug, p.id, "up")}><button className="btn-ghost px-2 py-0.5" disabled={i === 0} aria-label="Move earlier">←</button></form>
                <form action={movePhoto.bind(null, b.slug, p.id, "down")}><button className="btn-ghost px-2 py-0.5" disabled={i === photos.length - 1} aria-label="Move later">→</button></form>
                <form action={deletePhoto.bind(null, b.slug, p.id)} className="ml-auto"><button className="text-muted hover:text-bad">Delete</button></form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
