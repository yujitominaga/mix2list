import { useEffect, useState, useCallback } from "react";
import "./styles.css";
import "./screens/screens.css";

import type { AnalysisResult, Screen, VideoInfo } from "./types";
import { Home } from "./screens/Home";
import { Preview } from "./screens/Preview";
import { Analyzing, type AnalyzePhase } from "./screens/Analyzing";
import { Result } from "./screens/Result";
import { Snackbar } from "./components/Snackbar";
import { useI18n } from "./i18n";

import { fetchVideoInfo } from "./services/youtube";
import { analyzeVideo } from "./services/gemini";
import { harmonicReorder } from "./services/reorder";
import { beginLogin, completeLogin, loadTokens, clearTokens, getValidAccessToken } from "./services/spotifyAuth";
import { getCurrentUser, matchTracks, createPlaylist, addTracks, setPlaylistCoverFromUrl } from "./services/spotify";

interface SnackState {
  show: boolean; message: string; loading?: boolean; ready?: boolean;
  actionLabel?: string; onAction?: () => void;
}

export default function App() {
  const { t, lang, setLang } = useI18n();
  const [screen, setScreen] = useState<Screen>("home");
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [phase, setPhase] = useState<AnalyzePhase>("analyzing");
  const [isAuthed, setIsAuthed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [snack, setSnack] = useState<SnackState>({ show: false, message: "" });

  const showSnack = useCallback((s: Omit<SnackState, "show">) => setSnack({ ...s, show: true }), []);
  const hideSnack = useCallback(() => setSnack((s) => ({ ...s, show: false })), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
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
    setScreen("analyzing"); setPhase("analyzing");
    try {
      const result = await analyzeVideo(video.url);
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
      const user = await getCurrentUser();
      showSnack({ message: t("snack.searching"), loading: true });
      const matched = await matchTracks(analysis.tracks);
      const uris = matched.filter((x) => x.spotifyUri).map((x) => x.spotifyUri!);
      const notFound = matched.length - uris.length;
      setAnalysis({ ...analysis, tracks: matched });
      if (!uris.length) { showSnack({ message: t("snack.noMatch") }); setGenerating(false); return; }

      showSnack({ message: t("snack.creating"), loading: true });
      const desc = `From "${video.title}" by ${video.channel} — mix2list`;
      const playlistId = await createPlaylist(user.id, video.title, desc, false);
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
    <div className="app-shell">
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

      {screen === "home" && <Home onSubmit={handleUrl} />}
      {screen === "preview" && video && <Preview video={video} onAnalyze={handleAnalyze} />}
      {screen === "analyzing" && <Analyzing phase={phase} foundCount={analysis?.tracks.length} />}
      {screen === "result" && video && analysis && (
        <Result video={video} analysis={analysis} isAuthed={isAuthed} generating={generating}
          onGenerate={handleGenerate} onConnectSpotify={handleConnectSpotify} />
      )}

      <Snackbar show={snack.show} message={snack.message} loading={snack.loading}
        ready={snack.ready} actionLabel={snack.actionLabel} onAction={snack.onAction} />
    </div>
  );
}
