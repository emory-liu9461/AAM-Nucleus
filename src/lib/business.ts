import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";

export const getBusiness = cache(async (slug: string) => {
  const [b] = await db.select().from(schema.businesses).where(eq(schema.businesses.slug, slug));
  if (!b) notFound();
  return b;
});
