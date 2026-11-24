import { getJson, num, sum, type Item, type StatValues } from "./store";

/*
 * Facebook Pages + Instagram professional accounts through Meta's Graph API.
 * Env: META_APP_ID, META_APP_SECRET, optional META_GRAPH_VERSION.
 * In the app's Development mode this works for Pages you're an admin of; no App Review
 * is needed to read your own business's data.
 */
export const metaConfigured = () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
const V = () => process.env.META_GRAPH_VERSION ?? "v23.0";
const graph = () => `${(process.env.META_API_BASE ?? "https://graph.facebook.com").replace(/\/$/, "")}/${V()}`;
export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_read_user_content", "read_insights", "instagram_basic", "instagram_manage_insights", "instagram_manage_comments", "business_management"];

export function metaAuthUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", redirect_uri: redirectUri, state, scope: META_SCOPES.join(","), response_type: "code" });
  return `https://www.facebook.com/${V()}/dialog/oauth?${p}`;
}

/** Code -> long-lived user token -> Pages (each with its own Page token) and linked Instagram accounts. */
export async function metaExchange(code: string, redirectUri: string) {
  const id = process.env.META_APP_ID ?? "";
  const secret = process.env.META_APP_SECRET ?? "";
  const short = await getJson<{ access_token: string }>(`${graph()}/oauth/access_token?${new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: redirectUri, code })}`);
  const long = await getJson<{ access_token: string }>(`${graph()}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: short.access_token })}`);
  const pages = await getJson<{ data?: { id: string; name: string; access_token: string; instagram_business_account?: { id: string } }[] }>(
    `${graph()}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${long.access_token}`,
  );
  return pages.data ?? [];
}

type Post = { id: string; message?: string; permalink_url?: string; created_time?: string; reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number }; data?: { id: string; message?: string; created_time?: string; from?: { name?: string } }[] }; shares?: { count?: number } };

export async function syncFacebook(pageId: string, token: string): Promise<{ stats: StatValues; items: Item[] }> {
  const page = await getJson<{ followers_count?: number; fan_count?: number }>(`${graph()}/${pageId}?fields=followers_count,fan_count&access_token=${token}`);
  const posts = await getJson<{ data?: Post[] }>(
    `${graph()}/${pageId}/posts?fields=id,message,permalink_url,created_time,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(10){id,message,created_time,from},shares&limit=15&access_token=${token}`,
  );
  const items: Item[] = [];
  for (const p of posts.data ?? []) {
    for (const c of p.comments?.data ?? []) items.push({ externalId: c.id, kind: "comment", author: c.from?.name ?? "Facebook user", text: c.message, url: p.permalink_url, postedAt: new Date(c.created_time ?? "") });
  }
  // Post views: Meta changes insights metric names over time, so this is best-effort.
  let views: number | null = null;
  try {
    const ins = await getJson<{ data?: { name: string; values?: { value?: number }[] }[] }>(`${graph()}/${pageId}/insights?metric=page_media_view&period=days_28&access_token=${token}`);
    views = num(ins.data?.[0]?.values?.at(-1)?.value);
  } catch {}
  return {
    stats: {
      followers: num(page.followers_count ?? page.fan_count),
      views,
      likes: sum((posts.data ?? []).map((p) => num(p.reactions?.summary?.total_count))),
      comments: sum((posts.data ?? []).map((p) => num(p.comments?.summary?.total_count))),
    },
    items,
  };
}

export async function syncInstagram(igUserId: string, token: string): Promise<{ stats: StatValues; items: Item[] }> {
  const user = await getJson<{ followers_count?: number; username?: string }>(`${graph()}/${igUserId}?fields=followers_count,username&access_token=${token}`);
  const media = await getJson<{ data?: { id: string; permalink?: string; like_count?: number; comments_count?: number; timestamp?: string }[] }>(
    `${graph()}/${igUserId}/media?fields=id,permalink,like_count,comments_count,timestamp&limit=15&access_token=${token}`,
  );
  const items: Item[] = [];
  let views: number | null = null;
  for (const m of (media.data ?? []).slice(0, 5)) {
    try {
      const cs = await getJson<{ data?: { id: string; text?: string; username?: string; timestamp?: string }[] }>(`${graph()}/${m.id}/comments?fields=id,text,username,timestamp&limit=10&access_token=${token}`);
      for (const c of cs.data ?? []) items.push({ externalId: c.id, kind: "comment", author: c.username, text: c.text, url: m.permalink, postedAt: new Date(c.timestamp ?? "") });
    } catch {}
    try {
      const ins = await getJson<{ data?: { name: string; values?: { value?: number }[] }[] }>(`${graph()}/${m.id}/insights?metric=views&access_token=${token}`);
      const v = num(ins.data?.[0]?.values?.[0]?.value);
      if (v !== null) views = (views ?? 0) + v;
    } catch {}
  }
  return {
    stats: {
      followers: num(user.followers_count),
      views,
      likes: sum((media.data ?? []).map((m) => num(m.like_count))),
      comments: sum((media.data ?? []).map((m) => num(m.comments_count))),
    },
    items,
  };
}
