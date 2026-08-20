/**
 * Track preview playback via Spotify's official Embed iFrame (the
 * documented IFrameAPI at open.spotify.com/embed) — NOT the Web API's
 * preview_url, which Spotify retired for apps created after Nov 2024 (see
 * the note in spotify.ts). This is the only track-audio path left.
 *
 * One hidden, shared embed is created lazily on first use and reused for
 * every row via loadUri() — not one iframe per track — so only one track
 * ever plays at a time and there's no iframe sprawl in the tracklist.
 *
 * How much of the track actually plays is entirely up to Spotify's embed
 * and depends on the viewer's own browser session (full playback if
 * they're logged into Spotify with Premium there, more limited otherwise).
 * The app has no control over that — it's how the embed works.
 */

interface EmbedController {
  play(): void;
  pause(): void;
  loadUri(uri: string): void;
  addListener(event: "playback_update", cb: (e: { data: { isPaused: boolean } }) => void): void;
}

interface IFrameAPI {
  createController(
    element: HTMLElement,
    options: { uri: string; width: string; height: string },
    callback: (controller: EmbedController) => void
  ): void;
}

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: IFrameAPI) => void;
  }
}

type Listener = (playingUri: string | null) => void;

let controller: EmbedController | null = null;
let controllerPromise: Promise<EmbedController> | null = null;
let currentUri: string | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l(currentUri);
}

function loadScript(): Promise<IFrameAPI> {
  return new Promise((resolve) => {
    const prevReady = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (api) => {
      prevReady?.(api);
      resolve(api);
    };
    if (document.getElementById("spotify-iframe-api")) return;
    const script = document.createElement("script");
    script.id = "spotify-iframe-api";
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    script.async = true;
    document.body.appendChild(script);
  });
}

function createController(initialUri: string): Promise<EmbedController> {
  return loadScript().then(
    (IFrameAPI) =>
      new Promise((resolve) => {
        const el = document.createElement("div");
        el.setAttribute("aria-hidden", "true");
        el.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;";
        document.body.appendChild(el);
        IFrameAPI.createController(el, { uri: initialUri, width: "1", height: "152" }, (embedController) => {
          embedController.addListener("playback_update", (e) => {
            if (e.data.isPaused && currentUri) {
              currentUri = null;
              notify();
            }
          });
          resolve(embedController);
        });
      })
  );
}

/** Subscribe to the currently-playing track's Spotify URI (null = nothing
 * playing). Returns an unsubscribe function. */
export function onPreviewChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPlayingUri(): string | null {
  return currentUri;
}

/** Play `uri`, or pause if it's already the one playing. */
export async function togglePreview(uri: string): Promise<void> {
  if (currentUri === uri && controller) {
    controller.pause();
    currentUri = null;
    notify();
    return;
  }

  currentUri = uri;
  notify();

  if (!controller) {
    if (!controllerPromise) controllerPromise = createController(uri);
    controller = await controllerPromise;
    // initialUri is already loaded by createController — just play it,
    // unless the user toggled to a different track while this resolved.
    if (currentUri === uri) controller.play();
    return;
  }

  controller.loadUri(uri);
  controller.play();
}
