import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// For GitHub Pages project sites the app is served from /<repo>/.
// Set VITE_BASE=/mix2list/ (or your repo name) when building for Pages.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: env.VITE_BASE || "/",
    plugins: [react()],
  };
});
