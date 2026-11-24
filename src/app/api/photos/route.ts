import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/session";

/* Upload one project photo (already resized in the browser). Owner only. */
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 3 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const slug = String(form.get("b") ?? "");
  const { business: b } = await requireBusiness(slug, "manage_business");
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No photo received" }, { status: 400 });
  if (!TYPES.includes(file.type)) return Response.json({ error: "Use a JPG, PNG or WebP photo" }, { status: 415 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Photo is too large (max 3 MB after resizing)" }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const num = (k: string) => (Number(form.get(k)) > 0 ? Math.round(Number(form.get(k))) : null);
  const kind = ["before", "after", "photo"].includes(String(form.get("kind"))) ? (String(form.get("kind")) as "before" | "after" | "photo") : "photo";
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${schema.projectPhotos.sortOrder}), 0)` }).from(schema.projectPhotos).where(eq(schema.projectPhotos.businessId, b.id));
  const [row] = await db
    .insert(schema.projectPhotos)
    .values({
      businessId: b.id, mime: file.type, bytes: buf.length, data: buf, width: num("width"), height: num("height"), kind,
      caption: String(form.get("caption") ?? "").slice(0, 200) || null,
      serviceSlug: String(form.get("service") ?? "") || null, areaSlug: String(form.get("area") ?? "") || null,
      sortOrder: Number(max) + 1,
    })
    .returning({ id: schema.projectPhotos.id });
  return Response.json({ ok: true, id: row.id });
}

export async function DELETE(req: Request) {
  const u = new URL(req.url);
  const { business: b } = await requireBusiness(u.searchParams.get("b") ?? "", "manage_business");
  await db.delete(schema.projectPhotos).where(and(eq(schema.projectPhotos.id, u.searchParams.get("id") ?? ""), eq(schema.projectPhotos.businessId, b.id)));
  return Response.json({ ok: true });
}
