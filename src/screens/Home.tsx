import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { MagneticButton } from "../components/MagneticButton";
import { extractVideoId } from "../services/youtube";
import { assertConfigured } from "../services/config";
import { useI18n } from "../i18n";
import { EASE, revealUp } from "../lib/motion";

/** Full-screen looping backdrop with a rough analog treatment: RGB channel
 * split (SVG filter), scanlines, film grain, and a vignette/scrim so the
 * wordmark and form stay readable over it. Rendered at the App root (not
 * nested inside .app-shell) so its negative z-index actually lands behind
 * the topbar instead of behind app-shell's own content only. */
export function HomeBackdrop() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) videoRef.current?.pause();
  }, []);

  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id="m2l-chroma">
          <feColorMatrix in="SourceGraphic" type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset in="r" dx="-2" dy="0" result="r-off" />
          <feColorMatrix in="SourceGraphic" type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="SourceGraphic" type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
          <feOffset in="b" dx="2" dy="0" result="b-off" />
          <feBlend in="r-off" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="b-off" mode="screen" />
        </filter>
      </svg>
      {/* leaving Home/Preview: a slow fade + gentle zoom-out. (Used to
          animate a CSS-var-driven blur() here too, but combining that with
          the chroma-aberration SVG filter's default filter region shifted
          the rendered video vertically as the blur radius grew — simpler
          fade+scale avoids touching `filter` at all.) */}
      <motion.video
        ref={videoRef}
        className="home-bgvideo"
        src={`${import.meta.env.BASE_URL}dj-play-03.mp4`}
        autoPlay
        muted
        loop
        playsInline
        disablePictureInPicture
        aria-hidden
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.08 }}
        transition={{ duration: 1.1, ease: EASE }}
      />
      <motion.div className="home-bg-vignette" aria-hidden {...fade} transition={{ duration: 1, ease: EASE }} />
      <motion.div className="home-bg-scan" aria-hidden {...fade} transition={{ duration: 1, ease: EASE }} />
      <motion.div className="home-bg-grain" aria-hidden {...fade} transition={{ duration: 1, ease: EASE }} />
      <motion.div className="home-bg-scrim" aria-hidden {...fade} transition={{ duration: 1, ease: EASE }} />
    </>
  );
}

export function Home({ onSubmit }: { onSubmit: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const { t } = useI18n();
  const missing = assertConfigured();

  function submit() {
    if (!extractVideoId(url)) { setError(t("home.invalidUrl")); return; }
    setError("");
    onSubmit(url);
  }

  // The whole hero (title + tagline + form) reveals as one section, not as
  // separately staggered micro-elements.
  const section = revealUp(24, 0.9, 0);

  return (
    <motion.div
      className="home"
      initial={section.initial} animate={section.animate} exit={section.exit}
      transition={section.transition}
    >
      <h1 className="home-wordmark">
        <span className="m2">mix2</span><span className="list">list</span>
      </h1>
      <p className="home-tagline">{t("home.tagline")}</p>

      <div className="url-field">
        <input
          className="url-input"
          type="url"
          inputMode="url"
          placeholder={t("home.placeholder")}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          aria-label="YouTube URL"
        />
        <MagneticButton className="url-submit" onClick={submit} disabled={!url.trim()}>
          {t("home.analyze")}
          <span className="arw" aria-hidden>→</span>
        </MagneticButton>
      </div>
      {error && <div className="field-error">{error}</div>}

      {missing.length > 0 && (
        <p className="config-note">
          {t("home.missingEnv")}: {missing.map((m) => <code key={m}>{m} </code>)}
          <br />{t("home.missingHint")}
        </p>
      )}
    </motion.div>
  );
}
