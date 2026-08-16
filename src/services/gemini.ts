import { config, geminiEndpoint } from "./config";
import type { AnalysisResult, Track, MixSettings } from "../types";

/**
 * Ask Gemini to identify the tracks played in a DJ-mix YouTube video and
 * recommend a mix transition into each one.
 *
 * Gemini natively accepts a YouTube URL as a fileData part, so we don't have to
 * download or transcode anything. It reasons over BOTH the audio track and the
 * description/comments it can see.
 *
 * BPM and key are ESTIMATES. Spotify's audio-features endpoint was retired for
 * new apps in late 2024, so there's no authoritative source to reconcile
 * against — we surface them as estimates in the UI.
 */

const SYSTEM_PROMPT = `You are a professional DJ and music analyst. You are given a YouTube DJ mix video.
Identify each distinct track played, in order.

Track identification priority (follow strictly, to keep results consistent across repeated runs on the same video):
1. If the video description or a pinned/top comment contains an explicit tracklist, treat it as GROUND TRUTH. Output exactly those tracks — same count, same order, same titles/artists. Do not add, remove, merge, split, or reorder tracks based on your own audio judgment. Use the audio ONLY to fill in per-track startTimeSec/bpm/key that the text doesn't give you.
2. Only when no tracklist exists in the text does audio-only identification apply. In that case, work through the ENTIRE video chronologically from 0:00 to the end, logging every distinct track transition you can hear — do not skip short or unfamiliar-sounding tracks, and do not stop early.

For EACH track provide:
- title, artist, album (album may be null if unknown)
- bpm (integer estimate)
- key in Camelot notation (e.g. "8A", "11B")
- startTimeSec: integer seconds where the track begins in the video

Then, for the transition INTO each track (except the first), recommend DJ mix settings appropriate to the tempo/key/energy relationship with the previous track:
- volume: one of "smooth-crossfade" | "overlap" | "fade-in-out" | "cut"
- eq.low: "swap" | "cut-out" | "hold"   (low must never double-stack; prefer "swap")
- eq.mid: "duck" | "hold"
- eq.high: "open" | "hold"
- filter: "hpf-sweep" | "lpf-sweep" | "none"
- bars: transition length, one of 8 / 16 / 32
- note: a SHORT reason in English (max ~40 chars), e.g. "phrase-aligned bass swap"

Reply with ONLY valid minified JSON, no markdown fences, no preamble, matching:
{"confidence":"high|medium|low","source":"description|audio|mixed","tracks":[{"title":"","artist":"","album":null,"bpm":0,"key":"","startTimeSec":0,"mix":{"volume":"","eq":{"low":"","mid":"","high":""},"filter":"","bars":0,"note":""}}]}
The first track's "mix" must be null.`;

interface RawTrack {
  title: string;
  artist: string;
  album?: string | null;
  bpm?: number;
  key?: string;
  startTimeSec?: number;
  mix?: MixSettings | null;
}

interface RawResult {
  confidence?: "high" | "medium" | "low";
  source?: "description" | "audio" | "mixed";
  tracks: RawTrack[];
}

function buildRequestBody(youtubeUrl: string) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          { fileData: { fileUri: youtubeUrl } },
          { text: SYSTEM_PROMPT },
        ],
      },
    ],
    generationConfig: {
      // As low as the API allows — this is a detection/extraction task, not
      // a creative one, and run-to-run consistency on the same video matters
      // more here than variety.
      temperature: 0,
      responseMimeType: "application/json",
      // Generous headroom for long mixes (20+ tracks, each with a mix-settings
      // object) so the JSON never gets cut off mid-response.
      maxOutputTokens: 8192,
    },
  };
}

function stripFences(s: string): string {
  return s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function toTracks(raw: RawResult): Track[] {
  return raw.tracks.map((t, i) => ({
    id: crypto.randomUUID(),
    order: i + 1,
    title: t.title?.trim() || "Unknown",
    artist: t.artist?.trim() || "Unknown",
    album: t.album ?? undefined,
    bpm: typeof t.bpm === "number" ? Math.round(t.bpm) : undefined,
    key: t.key?.trim() || undefined,
    startTimeSec: t.startTimeSec,
    matchState: "unmatched",
    mix: t.mix ?? undefined,
  }));
}

export async function analyzeVideo(youtubeUrl: string): Promise<AnalysisResult> {
  const url =
    config.mode === "proxy"
      ? geminiEndpoint()
      : `${geminiEndpoint()}?key=${config.gemini.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody(youtubeUrl)),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Analysis request failed (${res.status}). ${
        res.status === 403 ? "Check your API key." : ""
      } ${detail.slice(0, 200)}`
    );
  }

  const data = await res.json();
  const text: string | undefined =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? undefined;

  if (!text) throw new Error("Empty analysis result. The video may be too long or private.");

  let parsed: RawResult;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    throw new Error("Could not parse the analysis result. Please try again.");
  }

  if (!parsed.tracks?.length) throw new Error("No tracks could be detected in the video.");

  return {
    tracks: toTracks(parsed),
    confidence: parsed.confidence,
    source: parsed.source,
  };
}
