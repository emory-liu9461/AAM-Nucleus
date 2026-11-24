import { getJson, num, type Item, type StatValues } from "./store";

/*
 * Google Business Profile: reviews (v4 API) and profile performance (Business Profile
 * Performance API). OAuth with scope business.manage. Google must approve API access
 * for your Cloud project (Business Profile API access request).
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
 */
export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const api = (sub: string) => (process.env.GOOGLE_API_BASE ? `${process.env.GOOGLE_API_BASE.replace(/\/$/, "")}/${sub}` : `https://${sub}.googleapis.com`);

export function googleAuthUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "", redirect_uri: redirectUri, response_type: "code",
    scope: "https://www.googleapis.com/auth/business.manage", access_type: "offline", prompt: "consent", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type Token = { access_token: string; refresh_token?: string; expires_in?: number };

export async function googleExchange(code: string, redirectUri: string) {
  return getJson<Token>(`${api("oauth2")}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
}

export async function googleRefresh(refreshToken: string) {
  return getJson<Token>(`${api("oauth2")}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", grant_type: "refresh_token" }),
  });
}

/** All business locations the signed-in Google account manages. */
export async function googleLocations(token: string) {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const accounts = await getJson<{ accounts?: { name: string; accountName?: string }[] }>(`${api("mybusinessaccountmanagement")}/v1/accounts`, auth);
  const out: { account: string; location: string; title: string }[] = [];
  for (const a of accounts.accounts ?? []) {
    const locs = await getJson<{ locations?: { name: string; title?: string }[] }>(`${api("mybusinessbusinessinformation")}/v1/${a.name}/locations?readMask=name,title&pageSize=100`, auth);
    for (const l of locs.locations ?? []) out.push({ account: a.name, location: l.name, title: l.title ?? l.name });
  }
  return out;
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const METRICS = ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH", "CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS"];

/** externalId = "accounts/1/locations/2" (account + location). */
export async function syncGoogle(token: string, accountLocation: string): Promise<{ stats: StatValues; items: Item[] }> {
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const items: Item[] = [];
  let average: number | null = null;
  let total: number | null = null;
  let pageToken = "";
  for (let page = 0; page < 5; page++) {
    const r = await getJson<{
      reviews?: { reviewId: string; reviewer?: { displayName?: string }; starRating?: string; comment?: string; createTime?: string; reviewReply?: { comment?: string } }[];
      averageRating?: number; totalReviewCount?: number; nextPageToken?: string;
    }>(`${api("mybusiness")}/v4/${accountLocation}/reviews?pageSize=50${pageToken ? `&pageToken=${pageToken}` : ""}`, auth);
    average = r.averageRating ?? average;
    total = r.totalReviewCount ?? total;
    for (const rv of r.reviews ?? []) {
      items.push({ externalId: rv.reviewId, kind: "review", author: rv.reviewer?.displayName, text: rv.comment ?? null, rating: STARS[rv.starRating ?? ""] ?? null, replied: Boolean(rv.reviewReply?.comment), postedAt: new Date(rv.createTime ?? "") });
    }
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }

  // Profile performance over the last 28 days (Google reports with a delay of a few days).
  const extra: Record<string, number> = {};
  let views: number | null = null;
  try {
    const location = accountLocation.replace(/^accounts\/[^/]+\//, "");
    const end = new Date(Date.now() - 3 * 864e5);
    const start = new Date(end.getTime() - 27 * 864e5);
    const d = (x: Date, p: string) => `&dailyRange.${p}Date.year=${x.getUTCFullYear()}&dailyRange.${p}Date.month=${x.getUTCMonth() + 1}&dailyRange.${p}Date.day=${x.getUTCDate()}`;
    const r = await getJson<{ multiDailyMetricTimeSeries?: { dailyMetricTimeSeries?: { dailyMetric?: string; timeSeries?: { datedValues?: { value?: string }[] } }[] }[] }>(
      `${api("businessprofileperformance")}/v1/${location}:fetchMultiDailyMetricsTimeSeries?${METRICS.map((m) => `dailyMetrics=${m}`).join("&")}${d(start, "start")}${d(end, "end")}`,
      auth,
    );
    for (const group of r.multiDailyMetricTimeSeries ?? []) {
      for (const series of group.dailyMetricTimeSeries ?? []) {
        const total = (series.timeSeries?.datedValues ?? []).reduce((a, x) => a + (num(x.value) ?? 0), 0);
        if (series.dailyMetric) extra[series.dailyMetric] = total;
      }
    }
    views = Object.entries(extra).filter(([k]) => k.startsWith("BUSINESS_IMPRESSIONS")).reduce((a, [, v]) => a + v, 0);
  } catch (e) {
    // Reviews still count if performance data isn't available yet.
    extra.performance_unavailable = 1;
    console.error("google performance", e instanceof Error ? e.message : e);
  }
  const ex: Record<string, number> = {};
  if (extra.CALL_CLICKS != null) ex.calls = extra.CALL_CLICKS;
  if (extra.WEBSITE_CLICKS != null) ex.websiteClicks = extra.WEBSITE_CLICKS;
  if (extra.BUSINESS_DIRECTION_REQUESTS != null) ex.directions = extra.BUSINESS_DIRECTION_REQUESTS;
  return { stats: { reviewsCount: total, rating: average, views, extra: ex }, items };
}
