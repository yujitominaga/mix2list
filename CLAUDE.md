# mix2list — working notes for Claude Code

Personal tool: turns a YouTube DJ mix into a Spotify playlist. React + TS + Vite,
deployed on GitHub Pages (personal account, private repo).

## Design intent — do not undo these

Direction: **dark, minimal, typographic.** Moodboard references: amra (whitespace,
type contrast, transparent-white steps), Birmingham Depot (layered non-black darks,
tiny functional accents, mono numerals, space instead of rules).

Principles, in priority order:
1. **Generous whitespace.** When unsure, add space, not elements.
2. **Type contrast carries the page** — big display headings vs. small mono labels.
3. **Accents are tiny and functional.** Green/amber/coral/violet appear only as
   small dots, badges, single words — never large fills. The primary button is
   warm-white on dark, NOT a green blob. If an accent covers more than a few
   square millimetres, it's probably wrong.
4. **Rules are a last resort.** Separate with space. A hairline (`--rule`) only
   where space genuinely can't do the job.
5. **Micro-interactions matter** — hover, focus, transitions should feel precise.
   Respect `prefers-reduced-motion` (already wired globally).

The signature element is the **track list**: rule-less depot-style rows, mono
index + title + tiny key-colored badge + mono BPM/time, hover reveals a soft
surface (not a border). Keep it.

## Type

- Display: `helvetica-now-display` (Adobe Fonts kit) → falls back to Inter.
- Body: `helvetica-now-text` → Inter → Zen Kaku Gothic New (JP).
- Mono: Space Mono (numerals, labels, IDs).
- JP text uses `.jp` / `--font-jp` = Zen Kaku Gothic New.

The Adobe kit `<link>` goes in `index.html` (placeholder comment marks the spot).
Once pasted, `helvetica-now-*` wins automatically — no other change needed.

## Architecture

- All external calls go through `src/services/`. Gemini routing is centralized in
  `src/services/config.ts` — `direct` mode (key in bundle, personal use) vs
  `proxy` mode (`/api/gemini`, for a future public deploy). Don't scatter fetch
  calls or hardcode the Gemini URL elsewhere.
- Spotify auth is PKCE (`spotifyAuth.ts`); no client secret anywhere.
- `reorder.ts` is a heuristic (Camelot + BPM). It's an estimate — never present
  its output as authoritative ordering.
- BPM/key are Gemini estimates. Always keep them visibly marked as estimates.
- i18n: `src/i18n.tsx`. Default English, JA toggle. **All user-facing copy goes
  through `t(key)`** — no hardcoded strings in components.

## Hard constraints (don't "fix" these — they're real limits)

- Spotify's Mix feature has **no public API**. Mix settings are display-only
  recommendations. The value we add is ordering, not applying transitions.
- Spotify audio-features endpoint is retired for new apps — that's why BPM/key
  come from Gemini, not Spotify.

## Credentials

`.env` (gitignored) holds `VITE_SPOTIFY_CLIENT_ID`, `VITE_SPOTIFY_REDIRECT_URI`,
`VITE_GEMINI_API_KEY`, `VITE_GEMINI_MODEL`. See `.env.example`. Never commit real
values; never paste them into chat.

## Commands

- `npm run dev` — local dev (http://127.0.0.1:5173)
- `npm run build` — tsc + vite build
- `VITE_BASE=/mix2list/ npm run build` — build for GitHub Pages project site

## Decisions & dead ends (don't re-litigate)

Context that lives in the builder's head, not the code. Read before proposing
changes so we don't repeat work already tried and rejected.

- **Spotify Mix transitions have no public API.** Confirmed by checking. Do NOT
  propose applying volume/EQ/filter mix settings programmatically — it isn't
  possible. They are display-only recommendations the user applies by hand in
  the Spotify app.
- **Track ordering is our own Camelot+BPM heuristic, on purpose.** Spotify won't
  reorder via API, so `reorder.ts` is the app's real value-add — not a stopgap
  to replace later with a Spotify feature. Improve it; don't remove it.
- **Helvetica Now was chosen to approximate Spotify's Circular** (non-open-source).
  Not arbitrary. If swapping fonts, keep that intent — a geometric, Circular-like
  face. Manrope was the earlier free stand-in; Inter is the current fallback.
- **BPM/key come from Gemini because Spotify's audio-features endpoint is retired**
  for new apps. Their being estimates is expected, not a bug — keep them marked
  as estimates in the UI.
- **CTA color is acid chartreuse `#d4ff1a`** (`--cta`), the hue midpoint between
  Spotify green (~141°) and YouTube red (0°). Used ONLY on primary action buttons
  (home Analyze, Generate playlist), with dark chartreuse-black text `#1a2400`
  (`--cta-tx`) — never pure black. This is the one place a bright accent is
  allowed to occupy real area; everywhere else accents stay tiny. Disabled CTAs
  drop to `--surface-2`, not a dimmed-olive opacity.
- **Design language is fixed by a moodboard** (amra + Birmingham Depot): dark,
  minimal, typographic; generous whitespace; accents tiny and functional; space
  instead of rules; the track list is the signature. See "Design intent" above.
