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

/** DJ-set-flavored genres for the analyzing-screen crate art. An unfiltered
 * random query over-represents J-Pop for a JP-market account, which rarely
 * shows up in an actual DJ set — steer toward genres that do. */
const CRATE_GENRES = ["house", "disco", "soul", "hip hop", "funk"];

function pickRandom<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
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
 * though `type=track` isn't). Tracks without album art are dropped.
 */
export async function fetchRandomAlbumArt(limit = 10): Promise<string[]> {
  // This app's search access appears capped below Spotify's documented
  // max of 50 (limit=24 came back "400 Invalid limit") — stay well under it.
  const cap = Math.min(limit, 10);
  const genres = pickRandom(CRATE_GENRES, 3);
  const perGenre = Math.max(1, Math.ceil(cap / genres.length));
  const out: string[] = [];
  for (const genre of genres) {
    try {
      // `genre:"x"` alone is a soft signal — Spotify's ranking still leans
      // on the account's home market, which for a JP account keeps
      // surfacing J-Pop regardless of genre. Repeating the term as a plain
      // keyword too reinforces it, and `market=US` pulls ranking away from
      // the JP catalog bias.
      const q = encodeURIComponent(`genre:"${genre}" ${genre}`);
      const res = await authed(`/search?type=track&limit=${perGenre}&market=US&q=${q}`);
      const data = await res.json();
      const items: { album?: { images?: SpotifyImage[] } }[] = data?.tracks?.items ?? [];
      out.push(...items.map((t) => displayImage(t.album?.images)).filter((u): u is string => !!u));
    } catch {
      // this genre's query failed — the others still cover it
    }
  }
  if (out.length) return out;

  // Fallback if the genre filter comes back empty for all of them (e.g.
  // unsupported on this app's search access): better generic art than none.
  const letter = "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)];
  const res = await authed(`/search?type=track&limit=${cap}&q=${letter}`);
  const data = await res.json();
  const items: { album?: { images?: SpotifyImage[] } }[] = data?.tracks?.items ?? [];
  return items.map((t) => displayImage(t.album?.images)).filter((u): u is string => !!u);
}

/**
 * Album art for the specific tracks in the mix being analyzed, once Gemini
 * has returned a track list. Tracks with no match or no art are dropped
 * rather than shown as a placeholder. Fetched in parallel — this only has
 * the ~1.2s "found"/"ordering" window on the Analyzing screen to land
 * before it unmounts, and a dozen tracks fetched one at a time doesn't fit
 * that window.
 */
export async function fetchAlbumArtForTracks(
  tracks: { title: string; artist: string }[]
): Promise<string[]> {
  const results = await Promise.allSettled(tracks.map((t) => searchTrack(t.title, t.artist)));
  return results
    .map((r) => (r.status === "fulfilled" ? r.value?.albumArt : undefined))
    .filter((u): u is string => !!u);
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

/** Spotify's Feb 2026 Web API migration retired `/users/{id}/playlists` for
 * Development Mode apps (410/403 as of the March 2026 cutoff) in favor of
 * `/me/playlists`, which drops the need for a separate user-id lookup. */
export async function createPlaylist(
  name: string,
  description: string,
  isPublic: boolean
): Promise<string> {
  const res = await authed(`/me/playlists`, {
    method: "POST",
    body: JSON.stringify({ name, description, public: isPublic }),
  });
  const data = await res.json();
  return data.id as string;
}

export async function addTracks(playlistId: string, uris: string[]): Promise<void> {
  // Spotify caps at 100 URIs per request. Same Feb 2026 migration renamed
  // this endpoint from `/tracks` to `/items`.
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    await authed(`/playlists/${playlistId}/items`, {
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
