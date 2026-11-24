import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/session";
import { googleAuthUrl } from "@/lib/social-sync/google";
import { metaAuthUrl } from "@/lib/social-sync/meta";
import { oauthState } from "@/lib/social-sync";
import { appBase } from "@/lib/twilio";

/** Starts "Connect with Google / Facebook": GET /api/social/connect/{google|meta}?b=<business slug> */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const slug = new URL(req.url).searchParams.get("b") ?? "";
  const { business: b } = await requireBusiness(slug, "manage_business");
  const callback = `${appBase(req.headers)}/api/social/callback/${provider}`;
  const state = oauthState(b.slug, provider);
  if (provider === "google") redirect(googleAuthUrl(callback, state));
  if (provider === "meta") redirect(metaAuthUrl(callback, state));
  return new Response("Unknown provider", { status: 404 });
}
