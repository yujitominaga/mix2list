import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence } from "motion/react";
import "./styles.css";
import "./screens/screens.css";

import type { AnalysisResult, Screen, Track, VideoInfo } from "./types";
import { Home, HomeBackdrop } from "./screens/Home";
import { Preview } from "./screens/Preview";
import { Analyzing, type AnalyzePhase } from "./screens/Analyzing";
import { Result } from "./screens/Result";
import { Snackbar } from "./components/Snackbar";
import { GlitchOverlay } from "./components/GlitchOverlay";
import { useI18n } from "./i18n";

import { fetchVideoInfo } from "./services/youtube";
import { analyzeVideo } from "./services/gemini";
import { harmonicReorder } from "./services/reorder";
import { beginLogin, completeLogin, loadTokens, clearTokens, getValidAccessToken } from "./services/spotifyAuth";
import { matchTracks, createPlaylist, addTracks, setPlaylistCoverFromUrl, fetchRandomAlbumArt } from "./services/spotify";

interface SnackState {
  show: boolean; message: string; loading?: boolean; ready?: boolean;
  actionLabel?: string; onAction?: () => void;
}

export default function App() {
  const { t, lang, setLang } = useI18n();
  const [screen, setScreen] = useState<Screen>("home");
  // Mirrors `screen === "analyzing"`, but only flips once the *previous*
  // screen has fully finished exiting (see onExitComplete below) — flipping
  // it immediately made the still-fading-out screen jump/reflow mid-exit,
  // since .app-shell--center changes the flex layout everything sits in.
  const [shellCenter, setShellCenter] = useState(false);
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [liveTracks, setLiveTracks] = useState<Track[] | null>(null);
  const [phase, setPhase] = useState<AnalyzePhase>("analyzing");
  const [isAuthed, setIsAuthed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [snack, setSnack] = useState<SnackState>({ show: false, message: "" });
  const [crateArt, setCrateArt] = useState<string[]>([]);
  const [cursorEnabled] = useState(
    () =>
      (window.matchMedia?.("(pointer: fine)").matches ?? false) &&
      !(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
  );

  const showSnack = useCallback((s: Omit<SnackState, "show">) => setSnack({ ...s, show: true }), []);
  const hideSnack = useCallback(() => setSnack((s) => ({ ...s, show: false })), []);

  const loginHandled = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      if (loginHandled.current) return;
      loginHandled.current = true;
      completeLogin(code)
        .then(() => {
          setIsAuthed(true);
          window.history.replaceState({}, "", `${import.meta.env.BASE_URL}`);
          restoreState();
        })
        .catch((e) => showSnack({ message: e.message }));
    } else {
      setIsAuthed(!!loadTokens());
      restoreState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefetch Spotify matches (for album art) as soon as the result list is
  // shown, instead of waiting for "Generate playlist". Idempotent: matchTracks
  // skips tracks that already carry a matchState.
  const artFetched = useRef(false);
  useEffect(() => {
    if (screen !== "result" || !analysis || !isAuthed) return;
    if (artFetched.current) return;
    artFetched.current = true;
    matchTracks(analysis.tracks)
      .then((matched) => setAnalysis((prev) => (prev ? { ...prev, tracks: matched } : prev)))
      .catch(() => {});
  }, [screen, analysis, isAuthed]);

  // Home and Preview share the full-screen backdrop video (it persists
  // across that transition); drop the html/body canvas background while
  // either is showing so nothing opaque sits between it and the page.
  const showVideoBg = screen === "home" || screen === "preview";
  useEffect(() => {
    document.documentElement.classList.toggle("m2l-video-bg", showVideoBg);
  }, [showVideoBg]);

  // Prefetch real album art for the analyzing-screen crate animation as soon
  // as we're connected — starting from the Home screen, well before the
  // user even submits a URL, so it's already sitting ready by the time the
  // analyzing screen shows up instead of racing a fetch against it.
  const crateArtFetched = useRef(false);
  useEffect(() => {
    if (!isAuthed || crateArtFetched.current) return;
    crateArtFetched.current = true;
    fetchRandomAlbumArt()
      .then(setCrateArt)
      .catch((e) => console.warn("[crate] prefetch failed:", e));
  }, [isAuthed]);

  function persistState(v: VideoInfo | null, a: AnalysisResult | null) {
    if (v && a) sessionStorage.setItem("m2l.work", JSON.stringify({ v, a }));
  }
  function restoreState() {
    try {
      const raw = sessionStorage.getItem("m2l.work");
      if (raw) {
        const { v, a } = JSON.parse(raw);
        setVideo(v); setAnalysis(a); setScreen("result");
      }
    } catch { /* ignore */ }
  }

  const handleUrl = useCallback(async (url: string) => {
    try {
      const info = await fetchVideoInfo(url);
      setVideo(info); setScreen("preview");
    } catch (e) { showSnack({ message: (e as Error).message }); }
  }, [showSnack]);

  const handleAnalyze = useCallback(async () => {
    if (!video) return;
    artFetched.current = false;
    setLiveTracks(null);
    setScreen("analyzing"); setPhase("analyzing");
    try {
      const result = await analyzeVideo(video.url);
      setLiveTracks(result.tracks);
      setPhase("found");
      await new Promise((r) => setTimeout(r, 700));
      setPhase("ordering");
      const ordered = { ...result, tracks: harmonicReorder(result.tracks) };
      await new Promise((r) => setTimeout(r, 500));
      setAnalysis(ordered); persistState(video, ordered); setScreen("result");
    } catch (e) {
      showSnack({ message: (e as Error).message }); setScreen("preview");
    }
  }, [video, showSnack]);

  const handleConnectSpotify = useCallback(async () => {
    try { await beginLogin(); }
    catch (e) { showSnack({ message: (e as Error).message }); }
  }, [showSnack]);

  const handleGenerate = useCallback(async () => {
    if (!video || !analysis) return;
    setGenerating(true);
    showSnack({ message: t("snack.generating"), loading: true });
    try {
      const token = await getValidAccessToken();
      if (!token) {
        setIsAuthed(false);
        showSnack({ message: t("snack.loginFirst") });
        setGenerating(false); return;
      }
      showSnack({ message: t("snack.searching"), loading: true });
      const matched = await matchTracks(analysis.tracks);
      const uris = matched.filter((x) => x.spotifyUri).map((x) => x.spotifyUri!);
      const notFound = matched.length - uris.length;
      setAnalysis({ ...analysis, tracks: matched });
      if (!uris.length) { showSnack({ message: t("snack.noMatch") }); setGenerating(false); return; }

      showSnack({ message: t("snack.creating"), loading: true });
      const desc = `From "${video.title}" by ${video.channel} — mix2list`;
      const playlistId = await createPlaylist(video.title, desc, false);
      await addTracks(playlistId, uris);
      setPlaylistCoverFromUrl(playlistId, video.thumbnail).catch(() => {});

      const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
      showSnack({
        message: notFound ? `${t("snack.ready")} · ${notFound} ${t("result.unmatched")}` : t("snack.ready"),
        ready: true, actionLabel: t("snack.goto"),
        onAction: () => window.open(playlistUrl, "_blank"),
      });
    } catch (e) { showSnack({ message: (e as Error).message }); }
    finally { setGenerating(false); }
  }, [video, analysis, showSnack, t]);

  const goHome = useCallback(() => {
    setScreen("home"); setVideo(null); setAnalysis(null);
    sessionStorage.removeItem("m2l.work"); hideSnack();
  }, [hideSnack]);

  return (
    <>
      {cursorEnabled && <GlitchOverlay />}
      <AnimatePresence>{showVideoBg && <HomeBackdrop key="home-bg" />}</AnimatePresence>

      <div className="topbar">
        <div className="top">
          {screen === "home" ? <span /> : (
            <button className="back-btn" onClick={screen === "result" ? goHome : () => setScreen("home")}>
              <span className="arw" aria-hidden>←</span>
              {screen === "result" ? t("nav.newMix") : t("nav.back")}
            </button>
          )}

          <div className="top-right">
            <div className="lang-toggle" role="group" aria-label="Language">
              <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
              <span className="sep">/</span>
              <button className={lang === "ja" ? "active" : ""} onClick={() => setLang("ja")}>JA</button>
            </div>
            <button
              className={`connect-btn${isAuthed ? " on" : ""}`}
              onClick={isAuthed ? () => { clearTokens(); setIsAuthed(false); } : handleConnectSpotify}
            >
              <span className="status-dot" />
              {isAuthed ? t("nav.connected") : t("nav.connect")}
            </button>
          </div>
        </div>
      </div>

      <div className={`app-shell${shellCenter ? " app-shell--center" : ""}`}>
      <AnimatePresence mode="wait" onExitComplete={() => setShellCenter(screen === "analyzing")}>
        {screen === "home" && <Home key="home" onSubmit={handleUrl} />}
        {screen === "preview" && video && <Preview key="preview" video={video} onAnalyze={handleAnalyze} />}
        {screen === "analyzing" && (
          <Analyzing
            key="analyzing"
            phase={phase} foundCount={liveTracks?.length} tracks={liveTracks ?? undefined}
            isAuthed={isAuthed} prefetchedArt={crateArt}
          />
        )}
        {screen === "result" && video && analysis && (
          <Result key="result" video={video} analysis={analysis} isAuthed={isAuthed} generating={generating}
            onGenerate={handleGenerate} onConnectSpotify={handleConnectSpotify} />
        )}
      </AnimatePresence>

      <Snackbar show={snack.show} message={snack.message} loading={snack.loading}
        ready={snack.ready} actionLabel={snack.actionLabel} onAction={snack.onAction} />
      </div>
    </>
  );
}
