import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** A progress photo on a customer's project page. The job's private token is the key. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!/^[a-f0-9]{32}$/.test(token) || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [row] = await db
    .select({ mime: schema.jobPhotos.mime, data: schema.jobPhotos.data })
    .from(schema.jobPhotos)
    .innerJoin(schema.jobs, eq(schema.jobs.id, schema.jobPhotos.jobId))
    .where(and(eq(schema.jobPhotos.id, id), eq(schema.jobs.portalToken, token)));
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), { headers: { "Content-Type": row.mime, "Cache-Control": "private, max-age=86400" } });
}
