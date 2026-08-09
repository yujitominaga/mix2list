import { getValidAccessToken } from "./spotifyAuth";
import type { Track } from "../types";

const API = "https://api.spotify.com/v1";

async function authed(path: string, init: RequestInit = {}) {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Not logged in to Spotify.");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (res.status === 401) throw new Error("Spotify session expired. Please log in again.");
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Spotify API error (${res.status}): ${detail.slice(0, 160)}`);
  }
  return res;
}

export interface SpotifyUser {
  id: string;
  display_name: string;
}

export async function getCurrentUser(): Promise<SpotifyUser> {
  const res = await authed("/me");
  return res.json();
}

interface SpotifyImage {
  url: string;
  width: number;
  height: number;
}

interface SearchHit {
  uri: string;
  durationMs: number;
  album?: string;
  albumArt?: string;
}

/** Smallest available image — a list thumbnail doesn't need the 640px one. */
function smallestImage(images?: SpotifyImage[]): string | undefined {
  if (!images?.length) return undefined;
  return [...images].sort((a, b) => a.width - b.width)[0].url;
}

/** Mid-sized image (~300px) — crisp enough for the analyzing-screen crate
 * animation without pulling the full 640px cover. */
function displayImage(images?: SpotifyImage[]): string | undefined {
  if (!images?.length) return undefined;
  const sorted = [...images].sort((a, b) => b.width - a.width);
  return sorted[Math.min(1, sorted.length - 1)].url;
}

/** Best-effort match of one track by title+artist. */
async function searchTrack(title: string, artist: string): Promise<SearchHit | null> {
  const q = encodeURIComponent(`track:${title} artist:${artist}`);
  const res = await authed(`/search?type=track&limit=1&q=${q}`);
  const data = await res.json();
  const item = data?.tracks?.items?.[0];
  if (!item) {
    // Loosen the query: some titles include remix/feat noise.
    const q2 = encodeURIComponent(`${title} ${artist}`);
    const res2 = await authed(`/search?type=track&limit=1&q=${q2}`);
    const data2 = await res2.json();
    const item2 = data2?.tracks?.items?.[0];
    if (!item2) return null;
    return {
      uri: item2.uri,
      durationMs: item2.duration_ms,
      album: item2.album?.name,
      albumArt: smallestImage(item2.album?.images),
    };
  }
  return {
    uri: item.uri,
    durationMs: item.duration_ms,
    album: item.album?.name,
    albumArt: smallestImage(item.album?.images),
  };
}

/**
 * Real, current album art for the analyzing-screen crate-digging animation
 * (not the mix being analyzed — that's not known yet at this point).
 *
 * Uses a `type=track` /search — the exact same request shape as
 * `searchTrack` above, which is proven to work (it's how track rows get
 * their album art on the Result screen). Earlier this used `type=album`,
 * and separately `/browse/new-releases`; both come back empty for this app
 * (browse endpoints are restricted to extended-quota apps since Spotify's
 * late-2024 API changes — same bucket as the retired audio-features
 * endpoint — and `type=album` search appears to be similarly gated even
 * though `type=track` isn't). A random single-letter query is a cheap way
 * to get a broad, varied set of real tracks. Tracks without album art are
 * dropped.
 */
export async function fetchRandomAlbumArt(limit = 10): Promise<string[]> {
  // This app's search access appears capped below Spotify's documented
  // max of 50 (limit=24 came back "400 Invalid limit") — stay well under it.
  const letter = "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
  const res = await authed(`/search?type=track&limit=${Math.min(limit, 10)}&q=${letter}`);
  const data = await res.json();
  const items: { album?: { images?: SpotifyImage[] } }[] = data?.tracks?.items ?? [];
  return items
    .map((t) => displayImage(t.album?.images))
    .filter((u): u is string => !!u);
}

/**
 * Album art for the specific tracks in the mix being analyzed, once Gemini
 * has returned a track list. Tracks with no match or no art are dropped
 * rather than shown as a placeholder.
 */
export async function fetchAlbumArtForTracks(
  tracks: { title: string; artist: string }[]
): Promise<string[]> {
  const out: string[] = [];
  for (const t of tracks) {
    try {
      const hit = await searchTrack(t.title, t.artist);
      if (hit?.albumArt) out.push(hit.albumArt);
    } catch {
      // skip — this is decorative, not worth surfacing an error for
    }
  }
  return out;
}

/**
 * Resolve every track to a Spotify URI. Mutates copies, returns new array.
 * Tracks that already carry a matchState (from an earlier pass, e.g. the
 * Result screen's art prefetch) are left as-is instead of re-searched.
 */
export async function matchTracks(
  tracks: Track[],
  onProgress?: (done: number, total: number) => void
): Promise<Track[]> {
  const out: Track[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (t.matchState === "matched" || t.matchState === "notfound") {
      out.push(t);
      onProgress?.(i + 1, tracks.length);
      continue;
    }
    try {
      const hit = await searchTrack(t.title, t.artist);
      out.push(
        hit
          ? {
              ...t,
              spotifyUri: hit.uri,
              lengthSec: Math.round(hit.durationMs / 1000),
              album: t.album ?? hit.album,
              albumArt: hit.albumArt,
              matchState: "matched",
            }
          : { ...t, matchState: "notfound" }
      );
    } catch {
      out.push({ ...t, matchState: "notfound" });
    }
    onProgress?.(i + 1, tracks.length);
  }
  return out;
}

export async function createPlaylist(
  userId: string,
  name: string,
  description: string,
  isPublic: boolean
): Promise<string> {
  const res = await authed(`/users/${userId}/playlists`, {
    method: "POST",
    body: JSON.stringify({ name, description, public: isPublic }),
  });
  const data = await res.json();
  return data.id as string;
}

export async function addTracks(playlistId: string, uris: string[]): Promise<void> {
  // Spotify caps at 100 URIs per request.
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    await authed(`/playlists/${playlistId}/tracks`, {
      method: "POST",
      body: JSON.stringify({ uris: chunk }),
    });
  }
}

/**
 * Set the playlist cover from an image URL (the YouTube thumbnail).
 * Spotify wants a raw base64 JPEG body (no data: prefix), <256KB.
 * Fetching the thumbnail cross-origin can taint the canvas, so this is
 * best-effort: on failure we simply skip the cover.
 */
export async function setPlaylistCoverFromUrl(
  playlistId: string,
  imageUrl: string
): Promise<boolean> {
  try {
    const base64 = await urlToJpegBase64(imageUrl, 600, 0.85);
    const token = await getValidAccessToken();
    const res = await fetch(`${API}/playlists/${playlistId}/images`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
      body: base64,
    });
    return res.ok;
  } catch {
    return false;
  }
}

function urlToJpegBase64(url: string, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const side = Math.min(img.width, img.height, maxSize);
      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas ctx"));
      // center-crop to square
      const sx = (img.width - Math.min(img.width, img.height)) / 2;
      const sy = (img.height - Math.min(img.width, img.height)) / 2;
      const s = Math.min(img.width, img.height);
      ctx.drawImage(img, sx, sy, s, s, 0, 0, side, side);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = () => reject(new Error("thumbnail load failed"));
    img.src = url;
  });
}
