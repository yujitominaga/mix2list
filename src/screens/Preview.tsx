import { thumbnailWithFallback } from "../services/youtube";
import type { VideoInfo } from "../types";
import { useI18n } from "../i18n";

export function Preview({ video, onAnalyze }: { video: VideoInfo; onAnalyze: () => void }) {
  const { t } = useI18n();
  const { primary, fallback } = thumbnailWithFallback(video.videoId);
  return (
    <div className="preview">
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
        <button className="btn btn-primary" onClick={onAnalyze}>{t("preview.analyze")}</button>
      </div>
      <p className="preview-hint">{t("preview.hint")}</p>
    </div>
  );
}
