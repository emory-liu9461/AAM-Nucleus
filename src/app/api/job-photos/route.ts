import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireBusiness } from "@/lib/session";

/* Upload one progress photo for a job (resized in the browser first). Anyone with access to the business. */
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 3 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const { business: b } = await requireBusiness(String(form.get("b") ?? ""));
  const jobId = String(form.get("job") ?? "");
  const [job] = /^[0-9a-f-]{36}$/.test(jobId) ? await db.select({ id: schema.jobs.id }).from(schema.jobs).where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.businessId, b.id))) : [];
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No photo received" }, { status: 400 });
  if (!TYPES.includes(file.type)) return Response.json({ error: "Use a JPG, PNG or WebP photo" }, { status: 415 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Photo is too large (max 3 MB after resizing)" }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const num = (k: string) => (Number(form.get(k)) > 0 ? Math.round(Number(form.get(k))) : null);
  const [row] = await db
    .insert(schema.jobPhotos)
    .values({ businessId: b.id, jobId: job.id, mime: file.type, bytes: buf.length, data: buf, width: num("width"), height: num("height") })
    .returning({ id: schema.jobPhotos.id });
  return Response.json({ ok: true, id: row.id });
}
