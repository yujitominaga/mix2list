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

interface SearchHit {
  uri: string;
  durationMs: number;
  album?: string;
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
    return { uri: item2.uri, durationMs: item2.duration_ms, album: item2.album?.name };
  }
  return { uri: item.uri, durationMs: item.duration_ms, album: item.album?.name };
}

/** Resolve every track to a Spotify URI. Mutates copies, returns new array. */
export async function matchTracks(
  tracks: Track[],
  onProgress?: (done: number, total: number) => void
): Promise<Track[]> {
  const out: Track[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    try {
      const hit = await searchTrack(t.title, t.artist);
      out.push(
        hit
          ? {
              ...t,
              spotifyUri: hit.uri,
              lengthSec: Math.round(hit.durationMs / 1000),
              album: t.album ?? hit.album,
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
