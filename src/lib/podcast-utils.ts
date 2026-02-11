import Parser from "rss-parser";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const parserOptions = {
  customFields: {
    item: [
      ["itunes:duration", "itunesDuration"],
      ["itunes:image", "itunesImage"],
      ["itunes:summary", "itunesSummary"],
      ["itunes:episode", "itunesEpisode"],
    ] as [string, string][],
    feed: [
      ["itunes:author", "itunesAuthor"],
      ["itunes:image", "itunesImage"],
    ] as [string, string][],
  },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parser = new (Parser as any)(parserOptions);

export interface ParsedPodcast {
  title: string;
  author: string | null;
  description: string | null;
  coverUrl: string | null;
  episodes: ParsedEpisode[];
}

export interface ParsedEpisode {
  guid: string | null;
  title: string;
  description: string | null;
  pubDate: string | null;
  duration: number | null;
  audioUrl: string;
  coverUrl: string | null;
  fileSize: number | null;
}

export async function parseFeed(feedUrl: string): Promise<ParsedPodcast> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feed: any = await parser.parseURL(feedUrl);

  const coverUrl =
    feed.itunesImage?.href || feed.image?.url || null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const episodes: ParsedEpisode[] = (feed.items || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((item: any) => item.enclosure?.url)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => ({
      guid: item.guid || item.link || null,
      title: item.title || "Untitled Episode",
      description:
        item.itunesSummary || item.contentSnippet || item.content || null,
      pubDate: item.pubDate || item.isoDate || null,
      duration: parseDuration(item.itunesDuration),
      audioUrl: item.enclosure!.url,
      coverUrl: item.itunesImage?.href || null,
      fileSize: item.enclosure?.length
        ? parseInt(item.enclosure.length)
        : null,
    }));

  return {
    title: feed.title || "Untitled Podcast",
    author: feed.itunesAuthor || feed.creator || null,
    description: feed.description || null,
    coverUrl,
    episodes,
  };
}

export function parseDuration(
  raw: string | undefined | null
): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed);
  const parts = trimmed.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export async function downloadFile(
  url: string,
  destPath: string
): Promise<void> {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

export async function downloadCoverArt(
  coverUrl: string
): Promise<string | null> {
  try {
    const hash = crypto.createHash("md5").update(coverUrl).digest("hex");
    const ext = coverUrl.match(/\.(jpe?g|png|webp)/i)?.[1] || "jpg";
    const filename = `podcast-${hash}.${ext}`;
    const coversDir = path.join(process.cwd(), "public", "covers");
    const fullPath = path.join(coversDir, filename);

    if (!fs.existsSync(coversDir))
      fs.mkdirSync(coversDir, { recursive: true });

    if (!fs.existsSync(fullPath)) {
      await downloadFile(coverUrl, fullPath);
    }

    return `/covers/${filename}`;
  } catch {
    return null;
  }
}

export function getPodcastStoragePath(): string {
  return (
    process.env.PODCAST_STORAGE_PATH ||
    path.join(process.cwd(), "data", "podcasts")
  );
}

export function getEpisodeFilePath(
  podcastId: number,
  episodeId: number,
  audioUrl: string
): string {
  const ext = path.extname(new URL(audioUrl).pathname) || ".mp3";
  const base = getPodcastStoragePath();
  return path.join(base, `podcast-${podcastId}`, `episode-${episodeId}${ext}`);
}

export function formatPodcastDuration(seconds: number | null): string {
  if (!seconds) return "--:--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
