// ---- Domain types shared across the app ----

export type Screen = "home" | "preview" | "analyzing" | "result";

export interface VideoInfo {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  thumbnail: string; // highest-res thumbnail URL
}

/**
 * Camelot key notation, e.g. "8A" / "8B".
 * Kept as a string because Gemini returns estimates and we display them as-is.
 */
export type CamelotKey = string;

export interface Track {
  id: string; // local uuid, not a Spotify id
  order: number; // 1-based position after optimization
  title: string;
  artist: string;
  album?: string;
  bpm?: number; // estimated — flagged as such in the UI
  key?: CamelotKey; // estimated
  lengthSec?: number; // from Spotify once matched, else undefined
  startTimeSec?: number; // where it appears in the source video (from Gemini)

  // Spotify match, filled in during the "generate" step
  spotifyUri?: string;
  matchState?: "unmatched" | "matched" | "notfound";
  albumArt?: string; // small Spotify album image, once matched

  // Recommended mix transition INTO this track from the previous one.
  // Display-only: Spotify has no public API to apply these.
  mix?: MixSettings;
}

export type VolumeCurve =
  | "smooth-crossfade"
  | "overlap"
  | "fade-in-out"
  | "cut";

export interface MixSettings {
  volume: VolumeCurve;
  // EQ curve, expressed as which bands swap. Display-oriented.
  eq: {
    low: "swap" | "cut-out" | "hold";
    mid: "duck" | "hold";
    high: "open" | "hold";
  };
  filter?: "hpf-sweep" | "lpf-sweep" | "none";
  bars?: number; // transition length in bars (DJ convention: 8/16/32)
  note?: string; // short human explanation, e.g. "phrase-aligned bass swap"
}

export interface AnalysisResult {
  tracks: Track[];
  confidence?: "high" | "medium" | "low";
  source?: "description" | "audio" | "mixed";
}

// ---- Spotify auth ----

export interface SpotifyTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
}
