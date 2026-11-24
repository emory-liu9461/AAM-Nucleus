import { getJson, num, sum, type Item, type StatValues } from "./store";

/*
 * YouTube Data API v3 with an API key (public channel data only).
 * Env: YOUTUBE_API_KEY. Totals: subscribers, views. Recent activity: likes and comments
 * on the latest uploads, plus the newest comments.
 */
const base = () => (process.env.YOUTUBE_API_BASE ?? "https://www.googleapis.com/youtube/v3").replace(/\/$/, "");
const key = () => process.env.YOUTUBE_API_KEY ?? "";
export const youtubeConfigured = () => Boolean(process.env.YOUTUBE_API_KEY);

type Channel = { id: string; snippet?: { title?: string }; statistics?: { viewCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean }; contentDetails?: { relatedPlaylists?: { uploads?: string } } };

/** "https://youtube.com/@acme", "@acme" or a UC… channel id -> the channel. */
export async function findYouTubeChannel(input: string) {
  const v = input.trim();
  const id = v.match(/(UC[\w-]{20,})/)?.[1];
  const handle = id ? null : (v.match(/@([\w.-]+)/)?.[1] ?? (/^[\w.-]+$/.test(v) ? v : null));
  if (!id && !handle) throw new Error("Paste your channel link (youtube.com/@yourname) or channel ID.");
  const q = id ? `id=${encodeURIComponent(id)}` : `forHandle=${encodeURIComponent("@" + handle)}`;
  const r = await getJson<{ items?: Channel[] }>(`${base()}/channels?part=snippet,statistics,contentDetails&${q}&key=${key()}`);
  const ch = r.items?.[0];
  if (!ch) throw new Error("YouTube couldn't find that channel.");
  return { id: ch.id, name: ch.snippet?.title ?? "YouTube channel" };
}

export async function syncYouTube(channelId: string): Promise<{ stats: StatValues; items: Item[] }> {
  const r = await getJson<{ items?: Channel[] }>(`${base()}/channels?part=statistics,contentDetails&id=${encodeURIComponent(channelId)}&key=${key()}`);
  const ch = r.items?.[0];
  if (!ch) throw new Error("Channel not found on YouTube.");
  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  let likes: number | null = null;
  let comments: number | null = null;
  const items: Item[] = [];
  if (uploads) {
    const pl = await getJson<{ items?: { contentDetails?: { videoId?: string } }[] }>(`${base()}/playlistItems?part=contentDetails&maxResults=10&playlistId=${uploads}&key=${key()}`);
    const ids = (pl.items ?? []).map((i) => i.contentDetails?.videoId).filter(Boolean) as string[];
    if (ids.length) {
      const vids = await getJson<{ items?: { id: string; statistics?: { likeCount?: string; commentCount?: string } }[] }>(`${base()}/videos?part=statistics&id=${ids.join(",")}&key=${key()}`);
      likes = sum((vids.items ?? []).map((x) => num(x.statistics?.likeCount)));
      comments = sum((vids.items ?? []).map((x) => num(x.statistics?.commentCount)));
      // Newest comments on the latest few videos (comments may be turned off on some).
      for (const vid of ids.slice(0, 3)) {
        try {
          const ct = await getJson<{ items?: { id: string; snippet?: { topLevelComment?: { snippet?: { authorDisplayName?: string; textOriginal?: string; publishedAt?: string } } } }[] }>(
            `${base()}/commentThreads?part=snippet&maxResults=10&order=time&videoId=${vid}&key=${key()}`,
          );
          for (const t of ct.items ?? []) {
            const s = t.snippet?.topLevelComment?.snippet;
            items.push({ externalId: t.id, kind: "comment", author: s?.authorDisplayName, text: s?.textOriginal, url: `https://www.youtube.com/watch?v=${vid}&lc=${t.id}`, postedAt: new Date(s?.publishedAt ?? "") });
          }
        } catch {
          /* comments disabled on this video */
        }
      }
    }
  }
  return {
    stats: { followers: ch.statistics?.hiddenSubscriberCount ? null : num(ch.statistics?.subscriberCount), views: num(ch.statistics?.viewCount), likes, comments },
    items,
  };
}
