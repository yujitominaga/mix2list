import type { Track } from "../types";
import { useI18n } from "../i18n";

function fmtLen(sec?: number): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Map Camelot letter to an accent: A (minor) -> violet, B (major) -> amber.
function keyBadgeClass(key?: string): string {
  if (!key) return "badge-dim";
  const m = key.trim().toUpperCase().match(/([AB])$/);
  if (!m) return "badge-dim";
  return m[1] === "B" ? "badge-amber" : "badge-violet";
}

interface Props {
  track: Track;
  isPlaying?: boolean;
  onPreviewToggle?: (uri: string) => void;
}

export function TrackRow({ track, isPlaying, onPreviewToggle }: Props) {
  const { t } = useI18n();
  return (
    <div className="trow">
      <div className="trow-idx mono">{String(track.order).padStart(2, "0")}</div>
      <div className="trow-art-wrap">
        {track.albumArt ? (
          <img className="trow-art" src={track.albumArt} alt="" />
        ) : (
          <div className="trow-art trow-art-empty" aria-hidden />
        )}
        {track.spotifyUri && (
          <button
            type="button"
            className={`trow-play${isPlaying ? " is-playing" : ""}`}
            aria-label={isPlaying ? t("result.pause") : t("result.play")}
            onClick={() => onPreviewToggle?.(track.spotifyUri!)}
          >
            {isPlaying ? "❚❚" : "▶"}
          </button>
        )}
      </div>
      <div className="trow-main">
        <div className="trow-title">
          {track.title}
          {track.matchState === "notfound" && (
            <span className="trow-unmatched">{t("result.unmatched")}</span>
          )}
        </div>
        <div className="trow-artist">{track.artist}</div>
      </div>
      <div className="trow-bpm">{track.bpm ?? "—"}</div>
      <div className="trow-key">
        {track.key ? <span className={`badge ${keyBadgeClass(track.key)}`}>{track.key}</span> : <span className="trow-time">—</span>}
      </div>
      <div className="trow-time">{fmtLen(track.lengthSec)}</div>
    </div>
  );
}
