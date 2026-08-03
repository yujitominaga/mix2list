import { config } from "./config";
import type { SpotifyTokens } from "../types";

/**
 * Authorization Code with PKCE. No client secret, so it's safe to run entirely
 * in the browser — which is exactly what a GitHub Pages deploy needs.
 */

const TOKEN_KEY = "m2l.spotify.tokens";
const VERIFIER_KEY = "m2l.spotify.verifier";
const AUTH_BASE = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

function randomString(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ("0" + (b & 0xff).toString(16)).slice(-2)).join("");
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function loadTokens(): SpotifyTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as SpotifyTokens) : null;
  } catch {
    return null;
  }
}

function saveTokens(t: SpotifyTokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
}

/** Kick off the login redirect. */
export async function beginLogin(): Promise<void> {
  if (!config.spotify.clientId) throw new Error("VITE_SPOTIFY_CLIENT_ID is not set.");
  const verifier = randomString(48);
  const challenge = base64url(await sha256(verifier));
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: config.spotify.clientId,
    response_type: "code",
    redirect_uri: config.spotify.redirectUri,
    scope: config.spotify.scopes.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `${AUTH_BASE}?${params}`;
}

/** Call on the callback route to exchange ?code=... for tokens. */
export async function completeLogin(code: string): Promise<SpotifyTokens> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("PKCE verifier missing. Please log in again.");

  const body = new URLSearchParams({
    client_id: config.spotify.clientId!,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.spotify.redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}).`);

  const data = await res.json();
  const tokens: SpotifyTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  saveTokens(tokens);
  sessionStorage.removeItem(VERIFIER_KEY);
  return tokens;
}

async function refresh(tokens: SpotifyTokens): Promise<SpotifyTokens> {
  if (!tokens.refreshToken) throw new Error("No refresh token available.");
  const body = new URLSearchParams({
    client_id: config.spotify.clientId!,
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Token refresh failed. Please log in again.");
  const data = await res.json();
  const next: SpotifyTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  saveTokens(next);
  return next;
}

/** Return a valid access token, refreshing 60s before expiry. */
export async function getValidAccessToken(): Promise<string | null> {
  let tokens = loadTokens();
  if (!tokens) return null;
  if (Date.now() > tokens.expiresAt - 60_000) {
    tokens = await refresh(tokens);
  }
  return tokens.accessToken;
}
