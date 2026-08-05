/**
 * Single source of truth for external-service configuration.
 *
 * DEPLOYMENT MODES
 * ----------------
 * mode "direct"  — calls Gemini straight from the browser with a key baked in
 *                  at build time via VITE_GEMINI_API_KEY. Fine for a personal
 *                  tool on GitHub Pages. The key IS visible to anyone who opens
 *                  devtools, so never ship this publicly with a shared key.
 *
 * mode "proxy"   — calls a backend function (e.g. /api/gemini) that holds the
 *                  key server-side. Flip VITE_BACKEND_MODE=proxy and deploy the
 *                  function; nothing else in the app changes.
 *
 * When you're ready to go public: write the function, set VITE_BACKEND_MODE,
 * and geminiEndpoint() below starts returning the proxy URL. That's the whole
 * migration.
 */

type BackendMode = "direct" | "proxy";

const MODE: BackendMode =
  (import.meta.env.VITE_BACKEND_MODE as BackendMode) || "direct";

export const config = {
  mode: MODE,

  gemini: {
    // Only read in "direct" mode. In "proxy" mode this is intentionally unused.
    apiKey: import.meta.env.VITE_GEMINI_API_KEY as string | undefined,
    model: (import.meta.env.VITE_GEMINI_MODEL as string) || "gemini-3.6-flash",
  },

  spotify: {
    clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined,
    // Must exactly match a Redirect URI registered in the Spotify dashboard.
    redirectUri:
      (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string) ||
      `${window.location.origin}${import.meta.env.BASE_URL}callback`,
    scopes: ["playlist-modify-public", "playlist-modify-private", "ugc-image-upload"],
  },
} as const;

/** Where Gemini requests go. Swaps automatically with MODE. */
export function geminiEndpoint(): string {
  if (config.mode === "proxy") return `${import.meta.env.BASE_URL}api/gemini`;
  return `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`;
}

export function assertConfigured() {
  const missing: string[] = [];
  if (config.mode === "direct" && !config.gemini.apiKey) missing.push("VITE_GEMINI_API_KEY");
  if (!config.spotify.clientId) missing.push("VITE_SPOTIFY_CLIENT_ID");
  return missing;
}
