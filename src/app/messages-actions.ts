"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { setHandled } from "@/lib/messages";

/** The business a conversation or call belongs to, if this person can see it. */
async function allowed(itemId: string) {
  const s = await requireSession();
  if (!/^[0-9a-f-]{36}$/.test(itemId)) return null;
  const [conv] = await db.select({ b: schema.chatConversations.businessId }).from(schema.chatConversations).where(eq(schema.chatConversations.id, itemId));
  const [call] = conv ? [] : await db.select({ b: schema.calls.businessId }).from(schema.calls).where(eq(schema.calls.id, itemId));
  const [lead] = conv || call ? [] : await db.select({ b: schema.leads.businessId }).from(schema.leads).where(eq(schema.leads.id, itemId));
  const bid = conv?.b ?? call?.b ?? lead?.b;
  return bid && s.businesses.some((b) => b.id === bid) ? s : null;
}

/** Mark something replied (e.g. you called back from your own phone) or not replied, for the whole team. */
export async function markReplied(itemId: string, replied: boolean) {
  const s = await allowed(itemId);
  if (!s) return;
  await setHandled(itemId, s.user.id, replied);
  revalidatePath("/", "layout");
}
