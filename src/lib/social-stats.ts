import { and, desc, gte, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const { socialStats, socialItems } = schema;
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export type ChannelRow = {
  businessId: string;
  channel: string;
  day: string;
  source: "api" | "manual";
  followers: number | null;
  followersBefore: number | null; // ~30 days earlier, for growth
  views: number | null;
  likes: number | null;
  comments: number | null;
  reviewsCount: number | null;
  rating: number | null;
  extra: Record<string, number> | null;
};

/** Latest numbers per business and channel, with the follower count from ~30 days before. */
export async function latestSocial(businessIds: string[]): Promise<ChannelRow[]> {
  if (!businessIds.length) return [];
  const rows = (await db.execute(sql`
    select distinct on (s.business_id, s.channel)
      s.business_id, s.channel, s.day::text as day, s.source, s.followers, s.views, s.likes, s.comments, s.reviews_count, s.rating, s.extra,
      (select p.followers from social_stats p where p.business_id = s.business_id and p.channel = s.channel
         and p.day <= s.day - 28 and p.followers is not null order by p.day desc limit 1) as followers_before
    from social_stats s
    where s.business_id in ${sql`(${sql.join(businessIds.map((id) => sql`${id}::uuid`), sql`, `)})`}
    order by s.business_id, s.channel, s.day desc`)) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    businessId: r.business_id as string, channel: r.channel as string, day: r.day as string, source: r.source as "api" | "manual",
    followers: n(r.followers), followersBefore: n(r.followers_before), views: n(r.views), likes: n(r.likes), comments: n(r.comments),
    reviewsCount: n(r.reviews_count), rating: r.rating ? Number(r.rating) : null, extra: (r.extra as Record<string, number>) ?? null,
  }));
}

export async function recentSocialItems(businessIds: string[], limit = 20, kind?: "review" | "comment") {
  if (!businessIds.length) return [];
  return db
    .select()
    .from(socialItems)
    .where(and(inArray(socialItems.businessId, businessIds), kind ? sql`${socialItems.kind} = ${kind}` : sql`true`))
    .orderBy(desc(socialItems.postedAt))
    .limit(limit);
}

export type SocialSummary = {
  followers: number | null;
  followerGrowth: number | null;
  reviews: number | null;
  rating: number | null; // weighted by review count across channels
  newReviews: number;
  newReviewRating: number | null;
  unreplied: number;
  newComments: number;
  views: number | null;
  likes: number | null;
  channels: number;
};

export async function socialSummary(businessIds: string[], from: Date, to: Date): Promise<SocialSummary> {
  const latest = await latestSocial(businessIds);
  const add = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : null);
  const rated = latest.filter((r) => r.rating !== null && (r.reviewsCount ?? 0) > 0);
  const totalRated = rated.reduce((a, r) => a + (r.reviewsCount ?? 0), 0);
  const [items] = businessIds.length
    ? await db
        .select({
          newReviews: sql<number>`count(*) filter (where ${socialItems.kind} = 'review')`,
          newReviewRating: sql<number | null>`avg(${socialItems.rating}) filter (where ${socialItems.kind} = 'review')`,
          unreplied: sql<number>`count(*) filter (where ${socialItems.kind} = 'review' and not ${socialItems.replied})`,
          newComments: sql<number>`count(*) filter (where ${socialItems.kind} = 'comment')`,
        })
        .from(socialItems)
        .where(and(inArray(socialItems.businessId, businessIds), gte(socialItems.postedAt, from), lt(socialItems.postedAt, to)))
    : [{ newReviews: 0, newReviewRating: null, unreplied: 0, newComments: 0 }];
  const followers = add(latest.map((r) => r.followers));
  // Growth only from channels with a reading from ~30 days ago; newly added channels aren't "growth".
  const comparable = latest.filter((r) => r.followers !== null && r.followersBefore !== null);
  const growth = comparable.length ? comparable.reduce((a, r) => a + (r.followers! - r.followersBefore!), 0) : null;
  return {
    followers,
    followerGrowth: growth,
    reviews: add(latest.map((r) => r.reviewsCount)),
    rating: totalRated ? rated.reduce((a, r) => a + (r.rating ?? 0) * (r.reviewsCount ?? 0), 0) / totalRated : null,
    newReviews: Number(items.newReviews ?? 0),
    newReviewRating: items.newReviewRating !== null ? Number(items.newReviewRating) : null,
    unreplied: Number(items.unreplied ?? 0),
    newComments: Number(items.newComments ?? 0),
    views: add(latest.map((r) => r.views)),
    likes: add(latest.map((r) => r.likes)),
    channels: new Set(latest.map((r) => r.channel)).size,
  };
}
