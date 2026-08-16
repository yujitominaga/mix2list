/**
 * Shared motion language for the whole app.
 *
 * Signature curve: "ease in slowly, a little anticipation, drastic
 * acceleration, then settle" (ref: bleibtgleich.dev). A single cubic-bezier
 * can't encode the anticipation dip on its own — it can only shape how fast
 * progress moves from 0 to 1, not send a value backward first — so `revealUp`
 * drives explicit keyframes (with a matching multi-segment `times`/`ease`
 * split) instead of a plain initial->animate tween.
 */

// Base two-point curve for simple fades/scales that don't need a keyframe
// dip: a pronounced S — slow in, fast middle, settled finish.
export const EASE = [0.76, 0, 0.14, 1] as const;

const REVEAL_TIMES = [0, 0.22, 0.55, 1];
// held/slow start -> snap into the anticipation dip -> drastic acceleration
// past the resting point -> settle back. (Plain bezier tuples rather than
// named "easeIn" strings — motion's `Easing` type isn't publicly exported,
// so there's nothing to annotate this array against; tuples type-check
// structurally without importing anything.)
const EASE_IN: [number, number, number, number] = [0.42, 0, 1, 1];
const SNAP: [number, number, number, number] = [0.16, 1, 0.3, 1];
const REVEAL_EASE: [number, number, number, number][] = [EASE_IN, EASE_IN, SNAP];

/**
 * Fade + vertical-offset reveal with a small anticipation dip: eases in
 * slowly, dips slightly *further* from rest (anticipation), then snaps past
 * and settles. `distance` is the resting travel distance in px.
 */
export function revealUp(distance = 24, duration = 0.9, delay = 0) {
  const anticipate = distance + Math.max(6, distance * 0.3);
  const overshoot = -distance * 0.12;
  return {
    initial: { opacity: 0, y: distance },
    animate: { opacity: [0, 0, 1, 1], y: [distance, anticipate, overshoot, 0] },
    exit: { opacity: 0, y: distance * 0.6, transition: { duration: duration * 0.45, ease: EASE } },
    transition: { duration, delay, times: REVEAL_TIMES, ease: REVEAL_EASE },
  };
}

/** Same shape as `revealUp`, for use as `variants` on a staggered list of
 * children (each item's own `visible` keyframes, no `initial`/`exit` object
 * — the parent stagger container drives entry via variant propagation). */
export function revealUpVariants(distance = 24, duration = 0.7) {
  const anticipate = distance + Math.max(6, distance * 0.3);
  const overshoot = -distance * 0.12;
  return {
    hidden: { opacity: 0, y: distance },
    visible: {
      opacity: [0, 0, 1, 1],
      y: [distance, anticipate, overshoot, 0],
      transition: { duration, times: REVEAL_TIMES, ease: REVEAL_EASE },
    },
  };
}

/** Fade + scale reveal (no directional dip — a y-anticipation reads oddly
 * on a centered panel/card scaling in place). Still carries the signature
 * slow-in/fast-mid/settle shape via `EASE`. */
export function revealScale(fromScale = 0.94, duration = 0.6, delay = 0) {
  return {
    initial: { opacity: 0, scale: fromScale },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: fromScale + 0.02 },
    transition: { duration, delay, ease: EASE },
  };
}
