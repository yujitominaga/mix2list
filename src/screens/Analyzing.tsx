import { useEffect, useState } from "react";
import { CrateDigger } from "../components/CrateDigger";
import { fetchAlbumArtForTracks } from "../services/spotify";
import { useI18n } from "../i18n";

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

  const stepLabel =
    phase === "analyzing" ? t("analyzing.step1")
    : phase === "found" ? t("analyzing.step2")
    : t("analyzing.step3");
  const stepText =
    phase === "found" && foundCount != null
      ? `${stepLabel} · ${foundCount} ${t("analyzing.found")}`
      : stepLabel;

  return (
    <div className="analyzing">
      <CrateDigger images={images} />
      <div className="analyzing-status">
        <span className="astatus-label">
          {t("analyzing.status")}
          <span className="astatus-dots" aria-hidden />
        </span>
        <span className="astatus-step">{stepText}</span>
      </div>
    </div>
  );
}
