import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSession } from "@/lib/session";
import { setRead } from "@/lib/messages";

/** Opening a conversation or call: mark it read for this person, then show it (so the unread count is right). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const back = new URLSearchParams(url.search);
  back.set("open", id);
  const s = await getSession();
  if (s && /^[0-9a-f-]{36}$/.test(id)) {
    const [conv] = await db.select({ b: schema.chatConversations.businessId }).from(schema.chatConversations).where(eq(schema.chatConversations.id, id));
    const [call] = conv ? [] : await db.select({ b: schema.calls.businessId }).from(schema.calls).where(eq(schema.calls.id, id));
    const bid = conv?.b ?? call?.b;
    if (bid && s.businesses.some((b) => b.id === bid)) await setRead(s.user.id, id, true);
  }
  return NextResponse.redirect(new URL(`/messages?${back}`, url), 303);
}
