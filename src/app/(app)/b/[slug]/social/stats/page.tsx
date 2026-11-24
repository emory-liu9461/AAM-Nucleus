import Link from "next/link";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema } from "@/db";
import { chooseSocialAccount, connectYouTube, disconnectSocial, saveManualStats, syncSocialNow } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { CopyField } from "@/components/CopyField";
import { Kpi } from "@/components/Kpi";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { requireBusinessPage } from "@/lib/session";
import { SOCIAL_CHANNELS, socialChannel } from "@/lib/social";
import { latestSocial, recentSocialItems, socialSummary } from "@/lib/social-stats";
import { googleConfigured, metaConfigured, youtubeConfigured } from "@/lib/social-sync";
import { appBase } from "@/lib/twilio";

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString());
const stars = (r: number | null) => (r ? "★".repeat(r) + "☆".repeat(5 - r) : "");
const NAME = (k: string) => socialChannel(k)?.name ?? k;

export default async function SocialStatsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ connected?: string; error?: string; choose?: string }> }) {
  const [{ slug }, flash] = await Promise.all([params, searchParams]);
  const { business: b } = await requireBusinessPage(slug, "manage_business");
  const since = new Date(Date.now() - 30 * 864e5);
  const [rows, summary, reviews, comments, accounts] = await Promise.all([
    latestSocial([b.id]),
    socialSummary([b.id], since, new Date(Date.now() + 1000)),
    recentSocialItems([b.id], 12, "review"),
    recentSocialItems([b.id], 12, "comment"),
    db.select().from(schema.socialAccounts).where(eq(schema.socialAccounts.businessId, b.id)),
  ]);
  const acc = Object.fromEntries(accounts.map((a) => [a.channel, a]));
  const base = appBase(await headers());
  const ordered = [...rows].sort((x, y) => SOCIAL_CHANNELS.findIndex((c) => c.key === x.channel) - SOCIAL_CHANNELS.findIndex((c) => c.key === y.channel));
  const google = rows.find((r) => r.channel === "google");

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href={`/b/${b.slug}/social`} className="text-sm text-muted hover:text-ink">← Social</Link>
          <h1 className="text-xl font-semibold">Social stats</h1>
          <p className="text-sm text-muted">Reviews, followers, views, likes and comments across your channels. Connected accounts update every morning.</p>
        </div>
        {accounts.length > 0 && <ActionForm action={syncSocialNow.bind(null, b.slug)} submit="Update now" pendingText="Updating…" className="flex flex-wrap items-center gap-2"><span /></ActionForm>}
      </div>

      {flash.connected && <div className="card border-good/40 text-sm">Connected {flash.connected === "meta" ? "Facebook" : flash.connected === "google" ? "Google Business Profile" : flash.connected}.{flash.choose && " You manage more than one, so check the one being tracked below."}</div>}
      {flash.error && <div className="card border-bad/40 text-sm text-bad">Couldn&apos;t connect: {flash.error}</div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Followers" value={fmt(summary.followers)} sub={summary.followerGrowth !== null ? `${summary.followerGrowth >= 0 ? "+" : ""}${summary.followerGrowth.toLocaleString()} in 30 days` : "across all channels"} tone={summary.followerGrowth !== null ? (summary.followerGrowth >= 0 ? "good" : "bad") : undefined} />
        <Kpi label="Reviews" value={fmt(summary.reviews)} sub={summary.rating ? `${summary.rating.toFixed(1)} ★ average` : "no ratings yet"} />
        <Kpi label="New reviews (30 days)" value={fmt(summary.newReviews)} sub={summary.newReviews ? `${summary.newReviewRating?.toFixed(1) ?? "—"} ★ · ${summary.unreplied} not replied to` : "from connected accounts"} tone={summary.unreplied ? "bad" : undefined} />
        <Kpi label="Views" value={fmt(summary.views)} sub="latest per channel (YouTube is all-time, others recent)" />
        <Kpi label="Likes" value={fmt(summary.likes)} sub="on recent posts" />
        <Kpi label="New comments (30 days)" value={fmt(summary.newComments)} sub="from connected accounts" />
      </section>

      <section className="card overflow-x-auto p-0">
        <div className="card-title px-4 pt-4">By channel</div>
        <table className="tbl">
          <thead><tr><th>Channel</th><th className="text-right">Followers</th><th className="text-right">Views</th><th className="text-right">Likes</th><th className="text-right">Comments</th><th className="text-right">Reviews</th><th className="text-right">Rating</th><th>Updated</th></tr></thead>
          <tbody>
            {ordered.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted">No numbers yet. Connect an account or enter numbers below.</td></tr>}
            {ordered.map((r) => (
              <tr key={r.channel}>
                <td className="font-medium">{NAME(r.channel)}</td>
                <td className="text-right">{fmt(r.followers)}{r.followers !== null && r.followersBefore !== null && <div className={`text-xs ${r.followers >= r.followersBefore ? "text-good" : "text-bad"}`}>{r.followers >= r.followersBefore ? "+" : ""}{(r.followers - r.followersBefore).toLocaleString()}</div>}</td>
                <td className="text-right">{fmt(r.views)}</td>
                <td className="text-right">{fmt(r.likes)}</td>
                <td className="text-right">{fmt(r.comments)}</td>
                <td className="text-right">{fmt(r.reviewsCount)}</td>
                <td className="text-right">{r.rating ? `${r.rating.toFixed(1)} ★` : "—"}</td>
                <td className="text-xs text-muted">{fmtDate(r.day)} · {r.source === "api" ? "automatic" : "entered by hand"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {google?.extra && Object.keys(google.extra).length > 0 && (
          <p className="px-4 pb-3 text-xs text-muted">
            From your Google profile (last 28 days): {fmt(google.extra.calls)} calls · {fmt(google.extra.websiteClicks)} website clicks · {fmt(google.extra.directions)} direction requests.
          </p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-title">Latest reviews</div>
          {reviews.length === 0 ? <p className="text-sm text-muted">Reviews appear here once Google Business Profile is connected.</p> : (
            <ul className="divide-y divide-line text-sm">
              {reviews.map((r) => (
                <li key={r.id} className="py-2">
                  <div className="flex items-center gap-2"><span className="text-amber-500">{stars(r.rating)}</span><span className="font-medium">{r.author ?? "Customer"}</span>
                    <span className="ml-auto text-xs text-muted">{NAME(r.channel)} · {fmtDate(r.postedAt)}</span></div>
                  {r.text && <p className="mt-1 line-clamp-3 text-muted">{r.text}</p>}
                  {!r.replied && <p className="mt-1 text-xs text-bad">Not replied to yet</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <div className="card-title">Latest comments</div>
          {comments.length === 0 ? <p className="text-sm text-muted">Comments appear here once Facebook, Instagram or YouTube is connected.</p> : (
            <ul className="divide-y divide-line text-sm">
              {comments.map((c) => (
                <li key={c.id} className="py-2">
                  <div className="flex items-center gap-2"><span className="font-medium">{c.author ?? "Someone"}</span>
                    <span className="ml-auto text-xs text-muted">{NAME(c.channel)} · {fmtDateTime(c.postedAt)}</span></div>
                  {c.text && <p className="mt-1 line-clamp-3 text-muted">{c.text}</p>}
                  {c.url && <a className="text-xs text-accent hover:underline" href={c.url} target="_blank" rel="noreferrer">Open and reply ↗</a>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Connected accounts</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {([
            ["google", "Google Business Profile", "Reviews, rating, profile views, calls and website clicks", googleConfigured(), "google"],
            ["facebook", "Facebook & Instagram", "Followers, likes, comments and views for your Page and linked Instagram", metaConfigured(), "meta"],
          ] as const).map(([ch, title, what, configured, provider]) => {
            const a = acc[ch];
            const choices = a?.meta?.choices ? (JSON.parse(a.meta.choices) as { id: string; name: string }[]) : [];
            return (
              <div key={ch} className="card space-y-2 text-sm">
                <div className="font-semibold">{title}</div>
                <p className="text-xs text-muted">{what}</p>
                {a ? (
                  <>
                    <p>Tracking <strong>{a.name}</strong>{ch === "facebook" && acc.instagram ? <> and <strong>{acc.instagram.name}</strong></> : null}</p>
                    {choices.length > 1 && (
                      <form action={chooseSocialAccount.bind(null, b.slug, ch)} className="flex gap-2">
                        <select name="choice" defaultValue={a.externalId} className="input">{choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                        <button className="btn-ghost">Switch</button>
                      </form>
                    )}
                    <p className="text-xs text-muted">{a.lastSyncAt ? `Updated ${fmtDateTime(a.lastSyncAt)}` : "Not updated yet"}</p>
                    {a.lastError && <p className="text-xs text-bad">Last update failed: {a.lastError}</p>}
                    <form action={disconnectSocial.bind(null, b.slug, ch)}><button className="text-xs text-muted hover:text-bad">Disconnect</button></form>
                  </>
                ) : configured ? (
                  <a className="btn" href={`/api/social/connect/${provider}?b=${b.slug}`}>Connect {ch === "google" ? "Google" : "Facebook"}</a>
                ) : (
                  <p className="text-xs text-muted">Needs setup first (see below).</p>
                )}
              </div>
            );
          })}
          <div className="card space-y-2 text-sm">
            <div className="font-semibold">YouTube</div>
            <p className="text-xs text-muted">Subscribers, views, likes and comments</p>
            {acc.youtube ? (
              <>
                <p>Tracking <strong>{acc.youtube.name}</strong></p>
                <p className="text-xs text-muted">{acc.youtube.lastSyncAt ? `Updated ${fmtDateTime(acc.youtube.lastSyncAt)}` : "Not updated yet"}</p>
                {acc.youtube.lastError && <p className="text-xs text-bad">Last update failed: {acc.youtube.lastError}</p>}
                <form action={disconnectSocial.bind(null, b.slug, "youtube")}><button className="text-xs text-muted hover:text-bad">Disconnect</button></form>
              </>
            ) : youtubeConfigured() ? (
              <ActionForm action={connectYouTube.bind(null, b.slug)} submit="Connect YouTube" className="space-y-2">
                <input className="input" name="channel" defaultValue={b.site?.social?.youtube ?? ""} placeholder="https://youtube.com/@yourbusiness" required />
              </ActionForm>
            ) : (
              <p className="text-xs text-muted">Needs setup first (see below).</p>
            )}
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <div className="card-title mb-1">Enter numbers by hand</div>
          <p className="text-sm text-muted">For channels without an automatic connection (HomeStars, Houzz, Yelp, TikTok, LinkedIn, Nextdoor…). Copy the numbers from your profile once a month; leave any field blank.</p>
        </div>
        <ActionForm action={saveManualStats.bind(null, b.slug)} submit="Save numbers" className="grid gap-3 sm:grid-cols-4">
          <label className="field sm:col-span-4">Channel
            <select className="input" name="channel" defaultValue="homestars">
              {SOCIAL_CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.name}{acc[c.key] ? " (connected: updates automatically)" : ""}</option>)}
            </select>
          </label>
          <label className="field">Followers<input className="input" name="followers" inputMode="numeric" /></label>
          <label className="field">Reviews<input className="input" name="reviewsCount" inputMode="numeric" /></label>
          <label className="field">Rating (1–5)<input className="input" name="rating" inputMode="decimal" placeholder="4.8" /></label>
          <label className="field">Views<input className="input" name="views" inputMode="numeric" /></label>
          <label className="field">Likes<input className="input" name="likes" inputMode="numeric" /></label>
          <label className="field">Comments<input className="input" name="comments" inputMode="numeric" /></label>
        </ActionForm>
      </section>

      <details className="card text-sm" open={!googleConfigured() && !metaConfigured() && !youtubeConfigured()}>
        <summary className="cursor-pointer font-semibold">Setting up automatic connections</summary>
        <div className="mt-3 space-y-4 text-muted">
          <div>
            <p className="font-medium text-ink">Google Business Profile {googleConfigured() ? "✓" : ""}</p>
            <ol className="ml-5 list-decimal space-y-1">
              <li>In Google Cloud Console, create a project and enable the Business Profile APIs (My Business Account Management, Business Information, Business Profile Performance, and the Google My Business API for reviews).</li>
              <li>Request Business Profile API access for the project (Google approves this; it can take a few days).</li>
              <li>Create an OAuth client (Web application) with this redirect URL:<div className="mt-1"><CopyField value={`${base}/api/social/callback/google`} /></div></li>
              <li>Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in Vercel and redeploy.</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-ink">Facebook &amp; Instagram {metaConfigured() ? "✓" : ""}</p>
            <ol className="ml-5 list-decimal space-y-1">
              <li>At developers.facebook.com, create an app (type: Business) and add Facebook Login.</li>
              <li>Add this as a valid OAuth redirect URL:<div className="mt-1"><CopyField value={`${base}/api/social/callback/meta`} /></div></li>
              <li>Your Instagram must be a Business or Creator account linked to your Facebook Page.</li>
              <li>Add <code>META_APP_ID</code> and <code>META_APP_SECRET</code> in Vercel and redeploy. While the app is in Development mode it works for Pages you&apos;re an admin of, which is all you need.</li>
            </ol>
          </div>
          <div>
            <p className="font-medium text-ink">YouTube {youtubeConfigured() ? "✓" : ""}</p>
            <ol className="ml-5 list-decimal space-y-1">
              <li>In Google Cloud Console, enable the YouTube Data API v3 and create an API key.</li>
              <li>Add it in Vercel as <code>YOUTUBE_API_KEY</code> and redeploy.</li>
            </ol>
          </div>
          <p>Daily updates run automatically on Vercel. Add <code>CRON_SECRET</code> (any long random text) in Vercel so only Vercel can start them.</p>
        </div>
      </details>
    </div>
  );
}
