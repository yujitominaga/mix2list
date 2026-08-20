import { motion } from "motion/react";
import { MagneticButton } from "../components/MagneticButton";
import { thumbnailWithFallback } from "../services/youtube";
import type { VideoInfo } from "../types";
import { useI18n } from "../i18n";
import { EASE, revealScale } from "../lib/motion";

export function Preview({ video, onAnalyze }: { video: VideoInfo; onAnalyze: () => void }) {
  const { t } = useI18n();
  const { primary, fallback } = thumbnailWithFallback(video.videoId);
  // Thumbnail + title + description reveal together as one section, not as
  // separately staggered micro-elements.
  const panel = revealScale();

  return (
    <motion.div
      className="preview"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <motion.div className="preview-inner" {...panel}>
        <a
          className="preview-frame"
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("preview.watch")}
        >
          <img
            src={primary}
            alt={video.title}
            onError={(e) => {
              if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
            }}
          />
          <span className="preview-play" aria-hidden>▶</span>
        </a>
        <div className="preview-meta">
          <div className="preview-copy">
            <h2 className="preview-vtitle" title={video.title}>{video.title}</h2>
            <p className="preview-vchan">{video.channel}</p>
          </div>
          <MagneticButton className="btn btn-primary" onClick={onAnalyze}>{t("preview.analyze")}</MagneticButton>
        </div>
        <p className="preview-hint">{t("preview.hint")}</p>
      </motion.div>
    </motion.div>
  );
}
