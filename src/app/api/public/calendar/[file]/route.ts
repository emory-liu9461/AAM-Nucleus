import { staffFeed } from "@/lib/staff";

/*
 * A crew member's personal calendar feed: GET /api/public/calendar/<token>.ics
 * Google Calendar, Outlook and Apple Calendar subscribe to this URL and re-check it
 * every few hours. The long random token is the only key, so it's kept private.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const ics = await staffFeed(file.replace(/\.ics$/i, "").toLowerCase());
  if (!ics) return new Response("Not found", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="schedule.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
