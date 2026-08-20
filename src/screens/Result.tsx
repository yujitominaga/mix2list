import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { AnalysisResult, VideoInfo } from "../types";
import { TrackRow } from "../components/TrackRow";
import { MixSettingsBar } from "../components/MixSettingsBar";
import { MagneticButton } from "../components/MagneticButton";
import { CountUp } from "../components/CountUp";
import { onPreviewChange, togglePreview } from "../services/spotifyEmbed";
import { useI18n } from "../i18n";
import { EASE, revealUpVariants } from "../lib/motion";

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
};
const rowVariants = revealUpVariants(24, 0.6);

interface Props {
  video: VideoInfo;
  analysis: AnalysisResult;
  isAuthed: boolean;
  generating: boolean;
  onGenerate: () => void;
  onConnectSpotify: () => void;
}

export function Result({ video, analysis, isAuthed, generating, onGenerate, onConnectSpotify }: Props) {
  const { t } = useI18n();
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [playingUri, setPlayingUri] = useState<string | null>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => onPreviewChange(setPlayingUri), []);

  const totalSec = analysis.tracks.reduce((s, x) => s + (x.lengthSec ?? 0), 0);
  const totalMin = Math.floor(totalSec / 60);
  const conf =
    analysis.confidence === "high" ? t("result.confHigh")
    : analysis.confidence === "low" ? t("result.confLow")
    : t("result.confMed");

  const primaryBtn = isAuthed ? (
    <MagneticButton className="btn btn-primary" onClick={onGenerate} disabled={generating}>
      {generating ? t("result.generating") : t("result.generate")}
    </MagneticButton>
  ) : (
    <MagneticButton className="btn btn-outline" onClick={onConnectSpotify}>{t("result.connectFirst")}</MagneticButton>
  );

  return (
    <motion.div
      className="result"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <div className={`result-sticky${stuck ? " show" : ""}`}>
        <img src={video.thumbnail} alt="" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
        <span className="rs-title">{video.title}</span>
        {isAuthed ? (
          <button className="btn btn-primary" style={{ padding: "8px 18px", fontSize: 13 }} onClick={onGenerate} disabled={generating}>
            {generating ? t("result.generating") : t("result.generate")}
          </button>
        ) : (
          <button className="btn btn-outline" style={{ padding: "8px 18px", fontSize: 13 }} onClick={onConnectSpotify}>
            {t("nav.connect")}
          </button>
        )}
      </div>

      <div ref={sentinel} />

      <div className="result-head">
        <img className="result-thumb" src={video.thumbnail} alt=""
          onError={(e) => { e.currentTarget.src = `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`; }} />
        <div className="result-info">
          <p className="result-eyebrow">{video.channel}</p>
          <h1 className="result-vtitle">{video.title}</h1>
          <div className="result-meta">
            <span className="mono"><CountUp value={analysis.tracks.length} /></span>
            <span>{t("result.songs")}</span>
            {totalMin > 0 && <><span className="dot-sep" /><span className="mono"><CountUp value={totalMin} /></span><span>min</span></>}
            <span className="dot-sep" /><span>{conf}</span>
          </div>
          {primaryBtn}
        </div>
      </div>

      <div className="tracklist">
        <div className="tl-head">
          <span>#</span>
          <span aria-hidden />
          <span>{t("col.title")}</span>
          <span>{t("col.bpm")}</span>
          <span>{t("col.key")}</span>
          <span className="c-time r">{t("col.time")}</span>
        </div>

        <motion.div variants={listVariants} initial="hidden" animate="visible">
          {analysis.tracks.map((track) => (
            <motion.div key={track.id} variants={rowVariants}>
              <TrackRow
                track={track}
                isPlaying={!!track.spotifyUri && track.spotifyUri === playingUri}
                onPreviewToggle={togglePreview}
              />
              {track.mix && <MixSettingsBar mix={track.mix} />}
            </motion.div>
          ))}
        </motion.div>

        <p className="tl-legend">{t("result.coverNote")} {t("result.estNote")}</p>
      </div>
    </motion.div>
  );
}
