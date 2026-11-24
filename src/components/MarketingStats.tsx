import Link from "next/link";
import type { Business } from "@/db/schema";
import type { MarketingMetrics } from "@/lib/metrics";
import { label, pct } from "@/lib/format";
import { Kpi } from "./Kpi";
import type { SocialSummary } from "@/lib/social-stats";

const SOURCE_LABEL: Record<string, string> = {
  direct: "Direct / typed in", google: "Google", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube",
  linkedin: "LinkedIn", x: "X (Twitter)", nextdoor: "Nextdoor", pinterest: "Pinterest", houzz: "Houzz", homestars: "HomeStars", yelp: "Yelp", angi: "Angi", bing: "Bing",
};

function Bars({ rows, empty }: { rows: [string, number][]; empty: string }) {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="space-y-2">
      {rows.map(([name, v]) => (
        <div key={name} className="text-sm">
          <div className="flex justify-between"><span>{name}</span><span className="text-muted">{v}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-bg"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${(v / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

/** Marketing section of the dashboard: website traffic, calls, texts, email and where leads come from. */
export function MarketingStats({ m, per, list, social }: { m: MarketingMetrics; per: MarketingMetrics[]; list: Business[]; social: SocialSummary }) {
  const conversion = m.visits ? m.websiteLeads / m.visits : null;
  const answerRate = m.calls ? m.callsAnswered / m.calls : null;
  // Website names (angi.com) keep their spelling; tags (google, newsletter) get capitalized.
  const sources = Object.entries(m.sources).map(([k, v]) => [SOURCE_LABEL[k] ?? (k.includes(".") ? k : label(k)), v] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const channels = Object.entries(m.leadChannels).sort((a, b) => b[1] - a[1]);
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Marketing</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Website visits" value={m.visits.toLocaleString()} sub={`${m.pageViews.toLocaleString()} page views`} />
        <Kpi label="Leads from the website" value={m.websiteLeads.toLocaleString()} sub={`${pct(conversion)} of visits · ${m.chats} chats started`} />
        <Kpi label="Phone calls" value={m.calls.toLocaleString()} sub={`${m.callsAnswered} answered · ${m.callsMissed} missed${m.voicemails ? ` · ${m.voicemails} voicemails` : ""}`} />
        <Kpi label="Text messages" value={m.textsIn.toLocaleString()} sub={`received · ${m.textsAutoReplied} AI replies · ${m.textBacks} missed-call texts`} />
        <Kpi label="Emails" value={m.emailsIn.toLocaleString()} sub="received" />
        <Kpi label="Booked by the AI assistant" value={m.aiBookings.toLocaleString()} sub="site visits & calls from chat, text and email" />
        <Kpi label="Call answer rate" value={pct(answerRate)} sub={m.callsMissed ? `${m.callsMissed} missed calls to follow up` : "of incoming calls"} tone={answerRate !== null && answerRate < 0.6 ? "bad" : answerRate !== null ? "good" : undefined} />
        <Kpi label="Visit → lead rate" value={pct(conversion)} sub="website leads ÷ website visits" />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted">Social media &amp; reviews</h3>
          {list.length === 1 && <Link href={`/b/${list[0].slug}/social/stats`} className="text-xs text-accent hover:underline">Social stats →</Link>}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Followers" value={social.followers?.toLocaleString() ?? "—"} sub={social.followerGrowth !== null ? `${social.followerGrowth >= 0 ? "+" : ""}${social.followerGrowth.toLocaleString()} in 30 days` : `${social.channels} channel${social.channels === 1 ? "" : "s"} tracked`} tone={social.followerGrowth !== null ? (social.followerGrowth >= 0 ? "good" : "bad") : undefined} />
          <Kpi label="Reviews" value={social.reviews?.toLocaleString() ?? "—"} sub={social.rating ? `${social.rating.toFixed(1)} ★ average` : "connect Google or enter by hand"} />
          <Kpi label="New reviews" value={social.newReviews.toLocaleString()} sub={social.newReviews ? `${social.newReviewRating?.toFixed(1) ?? "—"} ★ · ${social.unreplied} need a reply` : "in this period"} tone={social.unreplied ? "bad" : undefined} />
          <Kpi label="New comments" value={social.newComments.toLocaleString()} sub={`in this period${social.likes !== null ? ` · ${social.likes.toLocaleString()} recent likes` : ""}`} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-title">Where website visitors come from</div>
          <Bars rows={sources} empty="No website visits recorded in this period yet." />
        </div>
        <div className="card">
          <div className="card-title">How new leads reached you</div>
          <Bars rows={channels} empty="No new leads in this period." />
        </div>
      </div>
      {list.length > 1 && (
        <div className="card overflow-x-auto p-0">
          <div className="card-title px-4 pt-4">Marketing by business</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Business</th><th className="text-right">Visits</th><th className="text-right">Website leads</th><th className="text-right">Calls</th>
                <th className="text-right">Missed</th><th className="text-right">Texts</th><th className="text-right">Emails</th><th className="text-right">AI bookings</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b, i) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/b/${b.slug}`} className="flex items-center gap-2 font-medium hover:underline">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />{b.name}
                    </Link>
                  </td>
                  <td className="text-right">{per[i].visits}</td>
                  <td className="text-right">{per[i].websiteLeads}</td>
                  <td className="text-right">{per[i].calls}</td>
                  <td className={`text-right ${per[i].callsMissed ? "text-bad" : ""}`}>{per[i].callsMissed}</td>
                  <td className="text-right">{per[i].textsIn}</td>
                  <td className="text-right">{per[i].emailsIn}</td>
                  <td className="text-right">{per[i].aiBookings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
