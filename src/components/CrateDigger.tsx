import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { EASE } from "../lib/motion";
import "./CrateDigger.css";

const RANGE = 8; // tiles per side — 2*RANGE+1 = 17 visible, symmetric
const SWATCHES = 6;

// Slots sit on a large, shallow circle rather than a flat row: each step
// around the center adds ANGLE_STEP degrees. A small angle-per-step plus a
// big radius reads as tightly packed records fanned around a wide curve
// (rather than a few widely-splayed cards) — "records packed edge to edge,
// curving away into depth". Needs `.crate` to actually be full browser
// width (see CrateDigger.css) or most of this spread just gets clipped by
// a narrower container before the mask-image edge-fade ever applies.
// Kept so RANGE * ANGLE_STEP stays comfortably under 90° — past that, sin()
// turns over and the outermost tiles start sliding back *toward* center
// instead of continuing to spread, which reads as bunching rather than a
// clean curve.
const ANGLE_STEP = 10; // degrees per slot
const RADIUS = 1150; // px

// Motion: not a steady one-slot-per-tick conveyor — a rest, then an
// inertial "flick" that jumps several slots at once and coasts to a stop,
// then rests again. Mimics an actual hand flicking through a crate rather
// than a machine advancing a belt.
const REST_MIN_MS = 1300;
const REST_MAX_MS = 2600;
const SPIN_MIN = 5; // slots per flick
const SPIN_MAX = 13;
// Long, gentle decelerating tail (not a quick snap-then-stop) — most of the
// duration is spent visibly slowing down, not sitting still near the end.
// Pushed even flatter/earlier than a standard ease-out so the coast phase
// itself reads as longer and softer.
const SPIN_EASE: [number, number, number, number] = [0.11, 1, 0.15, 1];

// Longer flicks (more slots) get proportionally more time — and the base
// itself is generous, since a short duration is what made the coast read as
// a sudden stop regardless of easing curve.
function spinDuration(n: number): number {
  return 1.7 + n * 0.2;
}

function arcFor(pos: number) {
  const angleRad = (pos * ANGLE_STEP * Math.PI) / 180;
  return {
    x: Math.sin(angleRad) * RADIUS,
    z: -(1 - Math.cos(angleRad)) * RADIUS,
    rotateY: -pos * ANGLE_STEP,
  };
}
// Generic off-screen rest points for tiles entering/leaving mid-flick — using
// the real (pos - 1)/(pos + 1) neighbor would look like a small nudge next to
// tiles that just jumped several slots; these read as "swept in/out with it".
const OFFSCREEN_ENTER = arcFor(RANGE + 2);
const OFFSCREEN_EXIT = arcFor(-RANGE - 2);

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
 * "Digging through a record crate" loop for the analyzing screen: records
 * packed along a wide, shallow curve, flicked forward in bursts (not a
 * steady conveyor) past a highlighted center slot. Uses real Spotify album
 * art when available (see `images`); otherwise generated gradient swatches,
 * so it never looks broken pre-auth or before the fetch resolves.
 */
export function CrateDigger({ images }: { images: string[] }) {
  // Seeded once, from whatever `images` already has at mount — if App has
  // already prefetched art (it starts from the Home screen) this shows real
  // covers from the very first frame instead of placeholders.
  const pool = useRef<string[]>(images.length ? shuffle(images) : []);
  const drawIdx = useRef(0);
  const nextId = useRef(RANGE + 1);
  // Size of the flick currently underway — read at render time so the
  // per-tile transition duration scales with it (a bigger flick coasts
  // longer than a small nudge).
  const lastSpinRef = useRef(SPIN_MIN);
  const reduce = useMemo(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    []
  );

  // True only for the very first render, so the initial tiles can stagger in
  // "one by one" — later flicks shouldn't get that extra artificial delay.
  const firstRenderRef = useRef(true);
  useEffect(() => {
    firstRenderRef.current = false;
  }, []);

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
  // already on screen — otherwise, since only *new* tiles ever get an
  // image, it can take a while before any real cover is visible, which is
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

  // Self-scheduling timeout: rest for a random beat, then flick several
  // slots at once, then rest again.
  useEffect(() => {
    if (reduce) return;
    let timer: number;
    const flick = () => {
      const n = SPIN_MIN + Math.floor(Math.random() * (SPIN_MAX - SPIN_MIN + 1));
      lastSpinRef.current = n;
      setSlots((prev) => {
        const shifted = prev.map((s) => ({ ...s, pos: s.pos - n })).filter((s) => s.pos >= -RANGE);
        const added: Slot[] = [];
        for (let k = 0; k < n; k++) {
          const useReal = pool.current.length > 0;
          const src = useReal ? pool.current[drawIdx.current % pool.current.length] : null;
          const swatch = drawIdx.current % SWATCHES;
          drawIdx.current++;
          added.push({ id: nextId.current++, pos: RANGE - k, src, swatch });
        }
        return [...shifted, ...added];
      });
      const rest = REST_MIN_MS + Math.random() * (REST_MAX_MS - REST_MIN_MS);
      timer = window.setTimeout(flick, spinDuration(n) * 1000 + rest);
    };
    timer = window.setTimeout(flick, REST_MIN_MS);
    return () => window.clearTimeout(timer);
  }, [reduce]);

  return (
    <div className="crate" aria-hidden>
      <AnimatePresence>
        {slots.map((s) => {
          const d = Math.abs(s.pos);
          const isCenter = s.pos === 0;
          const scale = isCenter ? 1.2 : Math.max(0.55, 1 - d * 0.06);
          // Off-center tiles stay fully opaque — they recede via *darkening*
          // (filter: brightness) instead of transparency, so the tile behind
          // never shows through. Only enter/exit (mounting/unmounting) fade.
          const brightness = isCenter ? 1 : Math.max(0.3, 1 - d * 0.12);
          const here = arcFor(s.pos);
          // Cover arts appear one by one on first load, radiating out from
          // the center; a mid-flick settle gets a much smaller ripple so
          // the whole flick still reads as one gesture, not a cascade.
          const delay = firstRenderRef.current ? d * 0.06 : d * 0.012;
          const duration = firstRenderRef.current ? 0.9 : spinDuration(lastSpinRef.current);
          return (
            <motion.div
              key={s.id}
              className={`crate-tile${isCenter ? " is-center" : ""}`}
              style={{ zIndex: 10 - d }}
              initial={{ x: OFFSCREEN_ENTER.x, z: OFFSCREEN_ENTER.z, rotateY: OFFSCREEN_ENTER.rotateY, scale: 0.4, opacity: 0, filter: "brightness(1)" }}
              animate={{ x: here.x, z: here.z, rotateY: here.rotateY, scale, opacity: 1, filter: `brightness(${brightness})` }}
              exit={{ x: OFFSCREEN_EXIT.x, z: OFFSCREEN_EXIT.z, rotateY: OFFSCREEN_EXIT.rotateY, opacity: 0, scale: 0.4 }}
              transition={{
                x: { duration, ease: SPIN_EASE, delay },
                z: { duration, ease: SPIN_EASE, delay },
                rotateY: { duration, ease: SPIN_EASE, delay },
                scale: { duration: duration * 0.8, ease: SPIN_EASE, delay },
                opacity: { duration: 0.4, ease: EASE, delay },
                filter: { duration: duration * 0.6, ease: EASE, delay },
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
