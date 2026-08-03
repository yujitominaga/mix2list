# mix2list

Turn a YouTube DJ-mix video into a Spotify playlist. Gemini identifies the
tracks, the app reorders them harmonically (Camelot + BPM), creates the playlist
on your account, and shows recommended DJ mix settings for each transition.

Built with React + TypeScript + Vite.

## What it does

1. Paste a YouTube URL → preview the video (with a CRT scanline effect).
2. Hit **Analyze** → Gemini reads the audio + description and returns a tracklist
   with estimated BPM / key / start times.
3. Tracks are reordered for smooth harmonic transitions.
4. Connect Spotify → **Generate** creates a private playlist on your account,
   using the video thumbnail as the cover.

## Honest limitations

- **Mix settings are display-only.** Spotify's Mix feature (transition volume /
  EQ / filter curves) has **no public API**. The app recommends settings per
  transition; you apply them by hand in the Spotify app. The one thing it *can*
  do automatically is order the tracks so those transitions work.
- **BPM / Key are estimates.** Spotify retired its audio-features endpoint for
  new apps in late 2024, so there's no authoritative source. Gemini estimates
  them; they're labelled `EST` in the UI.
- **Track matching is best-effort.** Spotify search can miss remixes / bootlegs /
  unreleased edits. Unmatched tracks are flagged and skipped.

## Setup

```bash
npm install
cp .env.example .env   # fill in the keys below
npm run dev
```

### Keys

- **Gemini API key** — https://aistudio.google.com/apikey → `VITE_GEMINI_API_KEY`
- **Spotify client ID** — https://developer.spotify.com/dashboard
  - Create an app, add a Redirect URI that **exactly** matches
    `VITE_SPOTIFY_REDIRECT_URI` (e.g. `http://127.0.0.1:5173/callback`).
  - No client secret needed — auth uses Authorization Code + PKCE.
  - While your app is in Development Mode, only you + up to 25 manually-added
    users can log in. That's fine for a personal tool.

## The "go public later" path

Right now the Gemini key is compiled into the browser bundle (`VITE_BACKEND_MODE=direct`).
That's safe for a private, single-user deploy but **not** for a public one — anyone
could read the key from devtools.

When you want to publish:

1. Write a tiny serverless function (Vercel / Cloudflare) at `/api/gemini` that
   holds the key server-side and forwards the request body to Gemini.
2. Set `VITE_BACKEND_MODE=proxy`.

That's the whole migration — `src/services/config.ts` already routes Gemini calls
through `geminiEndpoint()`, which switches to `/api/gemini` in proxy mode. Nothing
else changes.

## Deploy to GitHub Pages

```bash
# build with the repo name as the base path
VITE_BASE=/mix2list/ npm run build
```

Then push `dist/` to a `gh-pages` branch (or use a GitHub Action). Remember to add
the Pages callback URL (`https://<you>.github.io/mix2list/callback`) as a Redirect
URI in the Spotify dashboard, and set `VITE_SPOTIFY_REDIRECT_URI` to match.

Note: `/callback` isn't a separate route — the app reads `?code=...` off whatever
URL it loads at, so a single-page Pages deploy works as long as the redirect lands
back on the app.

## Structure

```
src/
  types/            shared domain types
  services/
    config.ts       ← single swap point for direct vs. proxy key supply
    youtube.ts      URL parsing + oEmbed metadata
    gemini.ts       video → tracklist + mix recommendations
    spotifyAuth.ts  PKCE login / token refresh
    spotify.ts      search, create playlist, add tracks, cover upload
    reorder.ts      harmonic (Camelot + BPM) track ordering
  components/       RecordSwiper, TrackRow, MixSettingsBar, Snackbar
  screens/          Home, Preview, Analyzing, Result
  App.tsx           screen state machine + flow orchestration
```
