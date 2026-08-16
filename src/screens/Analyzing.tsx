import { Fragment, useEffect, useState } from "react";
import { motion } from "motion/react";
import { CrateDigger } from "../components/CrateDigger";
import { fetchAlbumArtForTracks } from "../services/spotify";
import { useI18n } from "../i18n";
import { EASE, revealUp } from "../lib/motion";

export type AnalyzePhase = "analyzing" | "found" | "ordering";

interface Props {
  phase: AnalyzePhase;
  foundCount?: number;
  /** Gemini's raw track list, once known — used to fetch real album art for
   * *this* mix instead of just decorative random covers. */
  tracks?: { title: string; artist: string }[];
  isAuthed: boolean;
  /** Random real covers, prefetched by App as soon as it's authed (starting
   * from the Home screen) so the crate doesn't race a fetch on arrival. */
  prefetchedArt: string[];
}

export function Analyzing({ phase, foundCount, tracks, isAuthed, prefetchedArt }: Props) {
  const { t } = useI18n();
  const [images, setImages] = useState<string[]>(prefetchedArt);

  // Prefetch may still resolve after this screen mounts — pick it up too.
  useEffect(() => {
    if (prefetchedArt.length) setImages((prev) => (prev.length ? prev : prefetchedArt));
  }, [prefetchedArt]);

  // Once Gemini has actually returned this mix's tracks, swap in art for the
  // real thing — nice-to-have, silently skipped if it doesn't resolve in time.
  useEffect(() => {
    if (!isAuthed || !tracks?.length) return;
    let cancelled = false;
    fetchAlbumArtForTracks(tracks)
      .then((art) => { if (!cancelled && art.length) setImages(art); })
      .catch((e) => console.warn("[crate] mix album art fetch failed:", e));
    return () => { cancelled = true; };
  }, [isAuthed, tracks]);

  const steps: { key: AnalyzePhase; label: string }[] = [
    { key: "analyzing", label: t("analyzing.step1") },
    { key: "found", label: t("analyzing.step2") },
    { key: "ordering", label: t("analyzing.step3") },
  ];
  const activeIdx = steps.findIndex((s) => s.key === phase);
  const label = revealUp(14, 0.7, 0.15);
  const process = revealUp(16, 0.7, 0.05);

  return (
    <>
      <motion.div
        className="analyzing"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <CrateDigger images={images} />
        <motion.div
          className="analyzing-label"
          initial={label.initial} animate={label.animate} transition={label.transition}
        >
          {t("analyzing.status")}
          <span className="astatus-dots" aria-hidden />
        </motion.div>
      </motion.div>

      <motion.div
        className="analyzing-process"
        initial={process.initial} animate={process.animate} exit={process.exit}
        transition={process.transition}
      >
        {steps.map((s, i) => (
          <Fragment key={s.key}>
            {i > 0 && <span className="aproc-sep" aria-hidden>—</span>}
            <div className={`aproc-step${i < activeIdx ? " done" : ""}${i === activeIdx ? " active" : ""}`}>
              <span className="aproc-num mono">0{i + 1}</span>
              {s.label}
              {s.key === "found" && foundCount != null && i <= activeIdx && (
                <span className="aproc-count mono">{foundCount}</span>
              )}
            </div>
          </Fragment>
        ))}
      </motion.div>
    </>
  );
}
