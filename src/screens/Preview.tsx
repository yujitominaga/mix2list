import { embedUrl } from "../services/youtube";
import type { VideoInfo } from "../types";
import { useI18n } from "../i18n";

export function Preview({ video, onAnalyze }: { video: VideoInfo; onAnalyze: () => void }) {
  const { t } = useI18n();
  return (
    <div className="preview">
      <div className="preview-frame">
        <iframe
          src={embedUrl(video.videoId)}
          title={video.title}
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      </div>
      <div className="preview-meta">
        <div style={{ minWidth: 0 }}>
          <h2 className="preview-vtitle">{video.title}</h2>
          <p className="preview-vchan">{video.channel}</p>
        </div>
        <button className="btn btn-primary" onClick={onAnalyze}>{t("preview.analyze")}</button>
      </div>
      <p className="preview-hint">{t("preview.hint")}</p>
    </div>
  );
}
