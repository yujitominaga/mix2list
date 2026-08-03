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
Identify each distinct track played, in order. Prefer any tracklist in the video description or pinned comment; use the audio to fill gaps and to verify.

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
      temperature: 0.2,
      responseMimeType: "application/json",
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
