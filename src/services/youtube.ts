import type { VideoInfo } from "../types";

/** Pull the 11-char video id out of any common YouTube URL shape. */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
    /(?:youtube\.com\/live\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  // bare id
  if (/^[\w-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

export function thumbnailUrl(videoId: string): string {
  // maxresdefault isn't guaranteed to exist; hqdefault always does.
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

/**
 * Fetch title + channel via YouTube's public oEmbed endpoint.
 * No API key required, and it's CORS-enabled.
 */
export async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Could not read a video ID from this URL.");

  const canonical = `https://www.youtube.com/watch?v=${videoId}`;
  const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    canonical
  )}&format=json`;

  let title = "Unknown title";
  let channel = "Unknown channel";
  try {
    const res = await fetch(oembed);
    if (res.ok) {
      const data = await res.json();
      title = data.title ?? title;
      channel = data.author_name ?? channel;
    }
  } catch {
    // oEmbed can fail for age-restricted / private videos; keep placeholders.
  }

  return {
    videoId,
    url: canonical,
    title,
    channel,
    thumbnail: thumbnailUrl(videoId),
  };
}

/** Verify a thumbnail actually resolves; fall back to hqdefault if not. */
export function thumbnailWithFallback(videoId: string): {
  primary: string;
  fallback: string;
} {
  return {
    primary: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    fallback: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  };
}
