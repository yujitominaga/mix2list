import { useEffect, useRef } from "react";
import html2canvas from "html2canvas";
import "./GlitchOverlay.css";

const INTERACTIVE = 'a, button, [role="button"], input, .url-field';

// Fixed per spec — not exposed as UI controls in the shipped app.
const P = { radius: 70, pixel: 10, rgb: 15, slice: 15, burst: 20 };

const CAPTURE_INTERVAL_MS = 200;
const RESIZE_DEBOUNCE_MS = 150;

// The glitch no longer tracks the cursor continuously — it flashes on for
// a short burst at a random interval, then stays off (native cursor
// visible) until the next one.
const BURST_GAP_MIN_MS = 2000;
const BURST_GAP_MAX_MS = 4000;
const BURST_DURATION_MS = 320;

/**
 * Cursor-follow glitch: pixelation + RGB split + slice displacement inside
 * a jagged clip region around the pointer, ported from
 * glitch-demo-mix2list.html. Unlike the prototype (which draws its own
 * scene onto an offscreen canvas every frame), this overlays the *real*
 * page — the canvas is otherwise fully transparent and only paints a
 * glitched patch, sampled from a periodically-refreshed html2canvas
 * snapshot of `#root`, during a brief random-interval burst (see
 * `BURST_GAP_*`/`BURST_DURATION_MS`). DOM capture (expensive) stays
 * decoupled from cursor tracking (cheap, runs every rAF) either way.
 *
 * `#root` itself carries no background (see styles.css), so the snapshot
 * only has opaque pixels where there's real foreground content — empty
 * background areas stay transparent and never pick up the RGB-split tint.
 */
export function GlitchOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;
    let bitmap: HTMLCanvasElement | null = null;
    let capturing = false;

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas!.width = W * DPR;
      canvas!.height = H * DPR;
      canvas!.style.width = W + "px";
      canvas!.style.height = H + "px";
    }
    resize();

    async function capture() {
      const root = document.getElementById("root");
      if (!root || capturing) return;
      capturing = true;
      try {
        bitmap = await html2canvas(root, {
          backgroundColor: null,
          scale: DPR,
          width: W,
          height: H,
          windowWidth: W,
          windowHeight: H,
          x: 0,
          y: 0,
          logging: false,
          // Album art (crate-digger tiles, track-list thumbnails) is loaded
          // cross-origin from Spotify's CDN. Without this, html2canvas
          // can't rasterize those <img>s and falls back to the tile's own
          // (near-black) placeholder background — which is why covers were
          // showing up as solid dark blobs instead of glitching. We never
          // read pixel data back out (no getImageData/toDataURL), so a
          // tainted canvas from allowTaint is harmless here.
          useCORS: true,
          allowTaint: true,
          ignoreElements: (el) => el === canvas,
          // html2canvas can't rasterize a live <video> frame directly (it
          // renders blank/black). Swap in a same-frame snapshot canvas on
          // the clone right before serialization, so the home backdrop
          // video is real, glitchable content instead of a hole.
          onclone: (_doc, cloned) => {
            const liveVideo = document.querySelector<HTMLVideoElement>(".home-bgvideo");
            const clonedVideo = cloned.querySelector<HTMLVideoElement>(".home-bgvideo");
            if (!liveVideo || !clonedVideo || !liveVideo.videoWidth) return;
            const frame = document.createElement("canvas");
            frame.width = liveVideo.videoWidth;
            frame.height = liveVideo.videoHeight;
            frame.className = clonedVideo.className;
            frame.setAttribute("style", clonedVideo.getAttribute("style") || "");
            const fctx = frame.getContext("2d")!;
            // Raw video pixels are much brighter than what's on screen —
            // .home-bgvideo applies brightness(0.58) contrast(1.1)
            // saturate(0.8) via CSS filter (screens.css), which a canvas
            // drawImage() doesn't inherit. Match it here so the glitched
            // patch sits at the same brightness as the frame around it
            // instead of flashing lighter.
            fctx.filter = "brightness(0.58) contrast(1.1) saturate(0.8)";
            fctx.drawImage(liveVideo, 0, 0);
            clonedVideo.replaceWith(frame);

            // html2canvas doesn't implement 3D CSS transforms (perspective /
            // rotateY / translateZ), which the crate-digger tiles use for
            // their fanned-curve layout — it renders them blank or in the
            // wrong spot, so the glitch never lines up with a visible
            // cover. The browser itself still computes each tile's correct
            // projected 2D screen box via getBoundingClientRect(), so pull
            // a flattened, plainly-positioned copy of each tile out from
            // under the 3D-transformed ancestor chain (appended straight
            // to #root, which has no transform of its own) and hide the
            // original in place of it.
            const liveTiles = document.querySelectorAll<HTMLElement>(".crate-tile");
            const clonedTiles = cloned.querySelectorAll<HTMLElement>(".crate-tile");
            liveTiles.forEach((liveTile, i) => {
              const clonedTile = clonedTiles[i];
              if (!clonedTile) return;
              const rect = liveTile.getBoundingClientRect();
              if (rect.width < 1 || rect.height < 1) return;
              const flat = clonedTile.cloneNode(true) as HTMLElement;
              flat.style.position = "fixed";
              flat.style.left = `${rect.left}px`;
              flat.style.top = `${rect.top}px`;
              flat.style.width = `${rect.width}px`;
              flat.style.height = `${rect.height}px`;
              flat.style.margin = "0";
              flat.style.transform = "none";
              cloned.appendChild(flat);
              clonedTile.style.visibility = "hidden";
            });
          },
        });
      } catch {
        // transient (e.g. mid-transition); next interval retries
      } finally {
        capturing = false;
      }
    }

    let resizeTimer: number | undefined;
    function onResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resize();
        capture();
      }, RESIZE_DEBOUNCE_MS);
    }
    window.addEventListener("resize", onResize);

    capture();
    const captureTimer = window.setInterval(capture, CAPTURE_INTERVAL_MS);

    const mouse = { x: -9999, y: -9999, active: false, over: false };

    function onMove(e: PointerEvent) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
      mouse.over = !!(e.target as HTMLElement)?.closest?.(INTERACTIVE);
    }
    function onLeave() {
      mouse.active = false;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    let burstUntil = 0;
    let burstTimer: number | undefined;
    function scheduleNextBurst() {
      const gap = BURST_GAP_MIN_MS + Math.random() * (BURST_GAP_MAX_MS - BURST_GAP_MIN_MS);
      burstTimer = window.setTimeout(() => {
        burstUntil = performance.now() + BURST_DURATION_MS;
        scheduleNextBurst();
      }, gap);
    }
    scheduleNextBurst();

    let cursorHidden = false;
    let raf = 0;
    function frame() {
      raf = requestAnimationFrame(frame);
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

      const bursting = performance.now() < burstUntil;
      const showGlitch = mouse.active && !mouse.over && bursting;
      if (showGlitch !== cursorHidden) {
        document.documentElement.classList.toggle("m2l-glitch-cursor-none", showGlitch);
        cursorHidden = showGlitch;
      }
      if (!showGlitch || !bitmap) return;

      const R = P.radius * DPR;
      const mx = mouse.x * DPR;
      const my = mouse.y * DPR;
      const x0 = Math.max(0, mx - R);
      const y0 = Math.max(0, my - R);
      const x1 = Math.min(canvas!.width, Math.min(bitmap.width, mx + R));
      const y1 = Math.min(canvas!.height, Math.min(bitmap.height, my + R));
      const rw = x1 - x0;
      const rh = y1 - y0;
      if (rw <= 0 || rh <= 0) return;

      // Occasional stronger flicker within an active burst (independent of
      // the outer burst timing above — this just varies intensity frame to
      // frame while a burst is already showing).
      const flicker = Math.random() * 100 < P.burst * 0.12;
      const rgb = (P.rgb + (flicker ? 16 : 0)) * DPR;
      const px = Math.max(1, Math.round(P.pixel * (flicker ? 1.6 : 1)));
      const sw = Math.max(1, Math.round(rw / px));
      const sh = Math.max(1, Math.round(rh / px));

      // Stacked horizontal glitch bars instead of one solid silhouette:
      // thin rows, each an independently random horizontal extent, drawn
      // as a union of rects (nonzero fill rule clips their combined area).
      // A sine envelope keeps it roughly lens-shaped (wide through the
      // middle, tapering at top/bottom) while per-row jitter and occasional
      // detached stray ticks give it that torn-tape/interlaced-scan look
      // rather than a clean blob. Re-rolled every frame.
      const rowH = Math.max(2, px * 0.55) * DPR;
      const rows = Math.max(6, Math.round((R * 2) / rowH));
      ctx!.save();
      ctx!.beginPath();
      for (let i = 0; i < rows; i++) {
        const t = i / (rows - 1);
        const envelope = Math.sin(t * Math.PI); // 0 at top/bottom, 1 through the middle
        const rowWidth = R * 1.7 * (0.12 + envelope * (0.4 + Math.random() * 0.6));
        const jitterX = (Math.random() - 0.5) * R * 0.7;
        const by = my - R + i * rowH;
        const bh = rowH * (0.35 + Math.random() * 0.85);
        const bx = mx - rowWidth / 2 + jitterX;
        ctx!.rect(bx, by, rowWidth, bh);
        // detached fragment flying off one side, like a stray scan tick
        if (Math.random() < 0.22) {
          const strayW = rowWidth * (0.12 + Math.random() * 0.3);
          const gap = 6 * DPR + Math.random() * R * 0.3;
          const strayX = Math.random() < 0.5 ? bx - strayW - gap : bx + rowWidth + gap;
          ctx!.rect(strayX, by, strayW, bh * 0.7);
        }
      }
      ctx!.clip();
      ctx!.imageSmoothingEnabled = false;

      // Pixelate: sample the captured (content-only, transparent-bg)
      // region down to a tiny scratch canvas, then blit it back up —
      // empty background contributes nothing, so it stays untouched.
      const scratch = document.createElement("canvas");
      scratch.width = sw;
      scratch.height = sh;
      const sg = scratch.getContext("2d")!;
      sg.imageSmoothingEnabled = false;
      sg.drawImage(bitmap, x0, y0, rw, rh, 0, 0, sw, sh);
      ctx!.drawImage(scratch, 0, 0, sw, sh, x0, y0, rw, rh);

      // Chromatic aberration: red/blue tinted copies of the content,
      // masked back to content-only via destination-in, offset and
      // screen-blended so empty space never picks up a color haze.
      if (rgb > 0.5) {
        const makeTint = (tint: string) => {
          const c = document.createElement("canvas");
          c.width = sw;
          c.height = sh;
          const g = c.getContext("2d")!;
          g.imageSmoothingEnabled = false;
          g.drawImage(scratch, 0, 0);
          g.globalCompositeOperation = "multiply";
          g.fillStyle = tint;
          g.fillRect(0, 0, sw, sh);
          g.globalCompositeOperation = "destination-in";
          g.drawImage(scratch, 0, 0);
          return c;
        };
        const jy = () => (Math.random() - 0.5) * rgb;
        // `screen` is inherently additive (only ever brightens), and at
        // full strength against real footage it blows out past the dark,
        // filtered scene around it. Cut its opacity so the fringe still
        // reads as color-split without floodlighting the patch.
        ctx!.globalCompositeOperation = "screen";
        ctx!.globalAlpha = 0.3;
        ctx!.drawImage(makeTint("#ff2040"), 0, 0, sw, sh, x0 + rgb, y0 + jy(), rw, rh);
        ctx!.drawImage(makeTint("#2060ff"), 0, 0, sw, sh, x0 - rgb * 0.9, y0 + jy(), rw, rh);
        ctx!.globalAlpha = 1;
        ctx!.globalCompositeOperation = "source-over";
      }

      // Slice displacement: horizontal bands shoved sideways.
      const slices = Math.round(P.slice * (flicker ? 1.8 : 1));
      for (let i = 0; i < slices; i++) {
        const sy = y0 + Math.random() * rh;
        const sh2 = 2 + Math.random() * (rh * 0.06);
        const dx = (Math.random() - 0.5) * rgb * 4;
        ctx!.drawImage(canvas!, x0, sy, rw, sh2, x0 + dx, sy, rw, sh2);
      }

      ctx!.restore();

      // Tiny square marker — the only visible cursor position cue while
      // the native pointer is hidden. A functional accent, not a fill.
      ctx!.save();
      ctx!.strokeStyle = "rgba(212,255,26,.6)";
      ctx!.lineWidth = DPR;
      const cs = 5 * DPR;
      ctx!.strokeRect(mx - cs, my - cs, cs * 2, cs * 2);
      ctx!.restore();
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(captureTimer);
      window.clearTimeout(resizeTimer);
      window.clearTimeout(burstTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.documentElement.classList.remove("m2l-glitch-cursor-none");
    };
  }, []);

  return <canvas id="m2l-glitch-canvas" ref={canvasRef} aria-hidden />;
}
