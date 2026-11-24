import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/* Public project photo for the websites. Photos never change once uploaded, so cache for a year. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [p] = await db
    .select({ data: schema.projectPhotos.data, mime: schema.projectPhotos.mime, archived: schema.businesses.archived })
    .from(schema.projectPhotos)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.projectPhotos.businessId))
    .where(eq(schema.projectPhotos.id, id));
  if (!p || p.archived) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(p.data), {
    headers: { "Content-Type": p.mime, "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" },
  });
}
