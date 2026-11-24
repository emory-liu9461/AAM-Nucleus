import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSession } from "@/lib/session";
import { fetchRecording } from "@/lib/twilio";

/** Plays a voicemail to signed-in users who can see that business (Twilio media needs our credentials). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return new Response("Sign in", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const [call] = await db.select().from(schema.calls).where(and(eq(schema.calls.id, id)));
  if (!call?.recordingUrl || !s.businesses.some((b) => b.id === call.businessId)) return new Response("Not found", { status: 404 });
  const res = await fetchRecording(call.recordingUrl);
  if (!res.ok || !res.body) return new Response("Recording unavailable", { status: 502 });
  return new Response(res.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
}
