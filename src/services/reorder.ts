import type { Track } from "../types";

/**
 * Reorder tracks so adjacent pairs mix well — the "Smart Reorder" idea we can
 * actually do ourselves, since Spotify won't do it via API.
 *
 * Cost between two tracks = harmonic distance (Camelot wheel) + tempo distance.
 * We greedily build a chain from the track that has the most compatible
 * neighbours. This is a heuristic, not a solver — good enough for a set list.
 */

function parseCamelot(key?: string): { num: number; letter: "A" | "B" } | null {
  if (!key) return null;
  const m = key.trim().toUpperCase().match(/^(\d{1,2})([AB])$/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  if (num < 1 || num > 12) return null;
  return { num, letter: m[2] as "A" | "B" };
}

/** 0 = same key, 1 = adjacent/relative (great), higher = worse. */
function harmonicDistance(a?: string, b?: string): number {
  const ka = parseCamelot(a);
  const kb = parseCamelot(b);
  if (!ka || !kb) return 3; // unknown key: neutral-ish penalty
  if (ka.num === kb.num && ka.letter === kb.letter) return 0;
  const ringDist = Math.min(
    Math.abs(ka.num - kb.num),
    12 - Math.abs(ka.num - kb.num)
  );
  // Adjacent on the wheel, same letter: +1 semitone-ish move.
  if (ringDist === 1 && ka.letter === kb.letter) return 1;
  // Relative major/minor: same number, different letter.
  if (ka.num === kb.num && ka.letter !== kb.letter) return 1;
  // Energy boost move (+7 / -5 on wheel is still musical) handled loosely:
  return 1 + ringDist;
}

function tempoDistance(a?: number, b?: number): number {
  if (a == null || b == null) return 2;
  // Percentage difference; 6% is the classic comfortable pitch range.
  const pct = Math.abs(a - b) / ((a + b) / 2);
  return pct / 0.06; // 1.0 == right at the 6% edge
}

function cost(a: Track, b: Track): number {
  return harmonicDistance(a.key, b.key) + tempoDistance(a.bpm, b.bpm);
}

export function harmonicReorder(tracks: Track[]): Track[] {
  if (tracks.length <= 2) return tracks.map((t, i) => ({ ...t, order: i + 1 }));

  const remaining = [...tracks];

  // Seed with the lowest-BPM track when tempos exist (natural warm-up start),
  // else keep the first track.
  let startIdx = 0;
  const withBpm = remaining.filter((t) => t.bpm != null);
  if (withBpm.length) {
    const minBpm = Math.min(...withBpm.map((t) => t.bpm!));
    startIdx = remaining.findIndex((t) => t.bpm === minBpm);
  }

  const chain: Track[] = [remaining.splice(startIdx, 1)[0]];

  while (remaining.length) {
    const last = chain[chain.length - 1];
    let bestIdx = 0;
    let bestCost = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = cost(last, remaining[i]);
      if (c < bestCost) {
        bestCost = c;
        bestIdx = i;
      }
    }
    chain.push(remaining.splice(bestIdx, 1)[0]);
  }

  return chain.map((t, i) => ({ ...t, order: i + 1 }));
}
