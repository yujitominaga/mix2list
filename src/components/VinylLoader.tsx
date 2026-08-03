import { useEffect, useRef } from "react";
import "./VinylLoader.css";

/**
 * Minimal analyzing visual: a single vinyl record rotating at a steady 33⅓-ish
 * pace, with concentric grooves and a moving "needle" reading position. Quiet
 * by design — the moodboard calls for restraint, so no fanned deck of covers.
 */
export function VinylLoader({ status }: { status: string }) {
  const disc = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !disc.current) return;
    let raf = 0;
    let angle = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      angle = (angle + dt * 0.05) % 360; // ~ slow spin
      if (disc.current) disc.current.style.transform = `rotate(${angle}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="vinyl">
      <div className="vinyl-plate">
        <div className="vinyl-disc" ref={disc}>
          <span className="vinyl-groove g1" />
          <span className="vinyl-groove g2" />
          <span className="vinyl-groove g3" />
          <span className="vinyl-label" />
          <span className="vinyl-spindle" />
        </div>
        <span className="vinyl-needle" />
      </div>
      <div className="vinyl-status mono">{status}</div>
    </div>
  );
}
