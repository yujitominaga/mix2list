import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// For GitHub Pages project sites the app is served from /<repo>/.
// Set VITE_BASE=/mix2list/ (or your repo name) when building for Pages.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: env.VITE_BASE || "/",
    plugins: [react()],
    // Spotify's redirect URI is fixed to 127.0.0.1 (its loopback requirement).
    // "localhost" can resolve to ::1 only on Windows, leaving 127.0.0.1
    // unbound and the OAuth callback connection refused — bind explicitly.
    server: {
      host: "127.0.0.1",
    },
  };
});
