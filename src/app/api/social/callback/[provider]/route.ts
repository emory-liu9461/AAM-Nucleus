import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/session";
import { googleExchange, googleLocations } from "@/lib/social-sync/google";
import { metaExchange } from "@/lib/social-sync/meta";
import { readOauthState, syncBusinessSocial, upsertAccount } from "@/lib/social-sync";
import { encrypt } from "@/lib/social-sync/store";
import { appBase } from "@/lib/twilio";

/** Google / Meta send the user back here after they approve access. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const slug = readOauthState(url.searchParams.get("state"), provider);
  if (!slug) return new Response("This sign-in link expired or wasn't started here. Go back and click Connect again.", { status: 400 });
  const { business: b } = await requireBusiness(slug, "manage_business");
  const back = (q: string) => redirect(`/b/${b.slug}/social/stats?${q}`);
  const code = url.searchParams.get("code");
  if (!code) back(`error=${encodeURIComponent(url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "Access wasn't granted")}`);
  const callback = `${appBase(req.headers)}/api/social/callback/${provider}`;
  let note = "";
  try {
    if (provider === "google") {
      const t = await googleExchange(code!, callback);
      const locs = await googleLocations(t.access_token);
      if (!locs.length) throw new Error("No Business Profile locations found on that Google account.");
      const pick = locs[0];
      await upsertAccount(b.id, "google", {
        externalId: `${pick.account}/${pick.location}`, name: pick.title, accessToken: t.access_token, refreshToken: t.refresh_token, expiresIn: t.expires_in,
        meta: { choices: JSON.stringify(locs.map((l) => ({ id: `${l.account}/${l.location}`, name: l.title }))) },
      });
      note = locs.length > 1 ? `&choose=google` : "";
    } else if (provider === "meta") {
      const pages = await metaExchange(code!, callback);
      if (!pages.length) throw new Error("No Facebook Pages found. Make sure you're an admin of the Page and allowed access to it.");
      const page = pages[0];
      const choices = JSON.stringify(pages.map((p) => ({ id: p.id, name: p.name, token: encrypt(p.access_token), ig: p.instagram_business_account?.id ?? null })));
      await upsertAccount(b.id, "facebook", { externalId: page.id, name: page.name, accessToken: page.access_token, meta: { choices } });
      if (page.instagram_business_account?.id) {
        await upsertAccount(b.id, "instagram", { externalId: page.instagram_business_account.id, name: `${page.name} (Instagram)`, accessToken: page.access_token });
      }
      note = pages.length > 1 ? `&choose=facebook` : "";
    } else {
      return new Response("Unknown provider", { status: 404 });
    }
  } catch (e) {
    back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Connection failed")}`);
  }
  await syncBusinessSocial(b);
  back(`connected=${provider}${note}`);
}
