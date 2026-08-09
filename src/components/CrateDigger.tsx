import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import "./CrateDigger.css";

const RANGE = 4; // tiles per side — 2*RANGE+1 visible, symmetric
const TICK_MS = 950;
const GAP = 175; // px between slot centers
const SWATCHES = 6;

interface Slot {
  id: number;
  pos: number;
  src: string | null; // null = generated placeholder tile
  swatch: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * "Digging through a record crate" loop for the analyzing screen: a
 * symmetric conveyor of cover tiles sliding past a highlighted center slot.
 * Uses real Spotify album art when available (see `images`); otherwise
 * generated gradient swatches, so it never looks broken pre-auth or before
 * the fetch resolves.
 */
export function CrateDigger({ images }: { images: string[] }) {
  // Seeded once, from whatever `images` already has at mount — if App has
  // already prefetched art (it starts from the Home screen) this shows real
  // covers from the very first frame instead of placeholders.
  const pool = useRef<string[]>(images.length ? shuffle(images) : []);
  const drawIdx = useRef(0);
  const nextId = useRef(RANGE + 1);
  const reduce = useMemo(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    []
  );

  const [slots, setSlots] = useState<Slot[]>(() => {
    const initial: Slot[] = [];
    for (let p = -RANGE; p <= RANGE; p++) {
      const src = pool.current.length ? pool.current[drawIdx.current % pool.current.length] : null;
      const swatch = drawIdx.current % SWATCHES;
      drawIdx.current++;
      initial.push({ id: p, pos: p, src, swatch });
    }
    return initial;
  });

  // Real art replaces the draw pool for future slots. The first time real
  // art arrives, also backfill it into whatever placeholder tiles are
  // already on screen — otherwise, since only *new* tiles (entering at the
  // right edge, one per tick) ever get an image, it can take up to
  // (2*RANGE+1) ticks (~8s) before any real cover is visible, which is
  // often longer than the whole analyzing phase lasts.
  useEffect(() => {
    if (!images.length) return;
    const wasEmpty = pool.current.length === 0;
    pool.current = shuffle(images);
    if (wasEmpty) {
      setSlots((prev) =>
        prev.map((s) => {
          if (s.src) return s;
          const src = pool.current[drawIdx.current % pool.current.length];
          drawIdx.current++;
          return { ...s, src };
        })
      );
    }
  }, [images]);

  // Self-scheduling timeout (not setInterval) so the tick period can jitter
  // a little each time — a perfectly metronomic conveyor reads as
  // mechanical; +/-120ms of wobble feels more like a hand flipping records.
  useEffect(() => {
    if (reduce) return;
    let timer: number;
    const tick = () => {
      setSlots((prev) => {
        const shifted = prev.map((s) => ({ ...s, pos: s.pos - 1 })).filter((s) => s.pos >= -RANGE);
        const useReal = pool.current.length > 0;
        const src = useReal ? pool.current[drawIdx.current % pool.current.length] : null;
        const swatch = drawIdx.current % SWATCHES;
        drawIdx.current++;
        shifted.push({ id: nextId.current++, pos: RANGE, src, swatch });
        return shifted;
      });
      timer = window.setTimeout(tick, TICK_MS + (Math.random() * 240 - 120));
    };
    timer = window.setTimeout(tick, TICK_MS);
    return () => window.clearTimeout(timer);
  }, [reduce]);

  return (
    <div className="crate" aria-hidden>
      <AnimatePresence initial={false}>
        {slots.map((s) => {
          const d = Math.abs(s.pos);
          const isCenter = s.pos === 0;
          const scale = isCenter ? 1.18 : Math.max(0.5, 1 - d * 0.14);
          const opacity = Math.max(0.12, 1 - d * 0.2);
          const rotateY = isCenter ? 0 : s.pos * -9;
          return (
            <motion.div
              key={s.id}
              className={`crate-tile${isCenter ? " is-center" : ""}`}
              style={{ zIndex: 10 - d }}
              initial={{ x: (s.pos + 1) * GAP, scale: 0.4, opacity: 0 }}
              animate={{ x: s.pos * GAP, scale, opacity, rotateY }}
              exit={{ x: (s.pos - 1) * GAP, opacity: 0, scale: 0.4 }}
              transition={{
                // A record dropping into the center gets a touch of bounce
                // (lower damping); side slots settle without overshoot.
                x: { type: "spring", stiffness: 170, damping: isCenter ? 15 : 26, mass: 0.9 },
                rotateY: { type: "spring", stiffness: 170, damping: 22 },
                scale: { type: "spring", stiffness: 220, damping: isCenter ? 13 : 28 },
                // Same ease as the rest of the app's transitions (--ease).
                opacity: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
              }}
            >
              {s.src ? <img src={s.src} alt="" /> : <span className={`crate-swatch sw-${s.swatch}`} />}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
