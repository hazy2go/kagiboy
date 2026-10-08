# Audit 4: Performance and optimization

Date: 2026-10-08 · Build audited: `index-B4mUZ4_J.js` (the same hash is live on kagiboy.xyz) · Lighthouse 13.5.0 / Chrome 154 · Machine: Apple M5 (Metal ANGLE)

Goal: make the site faster with no change to the visuals. Every recommendation below is tagged **quality-neutral** (the output is pixel-identical or identical to the eye) or carries a note on any visual risk.

Scratch tooling, raw Lighthouse JSON, bundle treemap (`stats.html`), profiles and GLB experiments are in `~/.claude/jobs/d7a54b92/tmp/audit4-perf/`. No repo files were changed apart from this report.

---

## TL;DR

The site is already in good runtime shape. Scrolling the landing holds 60 fps even with the CPU throttled 4x. WebGL contexts are released on unmount. The DPR is capped at 2 on desktop and 1.75 on coarse pointers, with an adaptive step-down. Off-screen pixel loops pause through IntersectionObserver.

The wins are in **loading**:

1. **Render-blocking Google Fonts.** This is the largest single FCP/LCP cost on mobile. Lighthouse estimates 690–890 ms on slow 4G. → Self-host the same woff2 files.
2. **About page LCP image is `loading="lazy"`**, and 800 KB of gallery photos load eagerly and compete with it. Mobile LCP is 4.0 s.
3. **The 3D model loads in a chain:** entry → `scene` chunk → GLB. On slow 4G the 3D appears at **8.4 s** on `/` and **10.2 s** on `/demo`. Fetching the GLB in parallel with the three.js chunk cuts about 1.5–3 s.
4. **A palette constant pulls in the whole Game Boy emulator.** `fleaLoop`/`chainLoop` import `SOFT_LCD` from `emu/gameboy`, which drags 181 KB of serverboy (28 KB gz) into `/` and `/about` early.
5. **The entry chunk is one 589 KB (197 KB gz) monolith.** It contains `/about`, `canvas-confetti`, the full `motion` (46 KB gz) and gsap+ScrollTrigger (45 KB gz), which `/demo` and `/about` don't need.
6. **No long-term caching.** Every hashed `/assets/*` file and the 1.4 MB GLB are served `max-age=0, must-revalidate`.
7. **Apex → www 308 redirect** on `kagiboy.xyz` adds about 300 ms to every cold visit from a shared link.
8. **GLB:** −88 KB br is available with lossless WebP textures (pixel-identical, verified). The Bezel mesh has 122,754 triangles where about 27k is visually identical (verified by pixel-diff).
9. **A small memory leak:** each visit to a route keeps the previous page's whole DOM tree (landing: about 780 nodes and 0.7 MB per visit). GPU memory is freed correctly.

---

## 1. Baseline metrics

### Lighthouse: live (https://www.kagiboy.xyz, brotli, Vercel CDN)

| Route | Form | Score | FCP | LCP | TBT | CLS | SI | TTI | Bytes | Main-thread | LCP element |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | mobile | 88 | 2.8 s | 2.8 s | 203 ms | 0.000 | 2.8 s | 4.8 s | 1,593 KB | 3.0 s | `h1` "Your keys, in a Game Boy cartridge." |
| `/` | desktop | 99 | 0.7 s | 0.7 s | 0 ms | 0.002 | 0.8 s | 0.7 s | 1,593 KB | 0.6 s | same |
| `/demo` | mobile | 83 | 2.5 s | 2.5 s | 395 ms | 0.025 | 3.7 s | 6.0 s | 1,677 KB | 1.3 s | text |
| `/demo` | desktop | 96 | 0.7 s | 1.3 s | 46 ms | 0.015 | 1.1 s | 1.3 s | 1,677 KB | 0.3 s | |
| `/about` | mobile | 84 | 2.5 s | **4.0 s** | 0 ms | 0.023 | 2.5 s | 4.0 s | 1,135 KB | 0.6 s | `figure.flea-gb > img` (lazy!) |
| `/about` | desktop | 98 | 0.7 s | 1.1 s | 0 ms | 0.000 | 0.8 s | 1.1 s | 1,135 KB | 0.1 s | |

### Lighthouse: local `vite preview` on :5302 (no compression, so bytes are inflated)

| Route | Form | Score | FCP | LCP | TBT | CLS | TTI | Bytes |
|---|---|---|---|---|---|---|---|---|
| `/` | mobile | 61 | 2.7 s | 3.1 s | 2,094 ms* | 0.000 | 8.0 s | 2,085 KB |
| `/` | desktop | 99 | 0.7 s | 0.9 s | 1 ms | 0.002 | 1.2 s | 2,085 KB |
| `/demo` | mobile | 68 | 3.2 s | 4.2 s | 436 ms | 0.025 | 6.2 s | 2,168 KB |
| `/demo` | desktop | 97 | 0.7 s | 1.2 s | 34 ms | 0.016 | 1.2 s | 2,168 KB |
| `/about` | mobile | 78 | 2.4 s | 5.0 s | 0 ms | 0.023 | 5.2 s | 1,139 KB |
| `/about` | desktop | 98 | 0.6 s | 1.0 s | 0 ms | 0.000 | 1.0 s | 1,139 KB |

\*The local mobile TBT on `/` is noisy: in that run a single 1.8 s task landed during GLB parse plus first shader compile. Live measured 203 ms. Treat the live numbers as canonical; the preview server serves uncompressed files.

### Time-to-3D (puppeteer, slow 4G 1.6 Mbps / 150 ms RTT, CPU 4x, live)

| Page | FCP | 3D ready (`is-ready`) | Waterfall |
|---|---|---|---|
| `www.kagiboy.xyz/` | 1.94 s | **8.43 s** | index 0.29→1.51 · gameboy 1.84→2.63 (not needed yet) · scene 1.87→3.38 · **GLB 3.54→8.29** · chip 8.43→9.41 · wallet.gb 9.50 |
| `kagiboy.xyz/` (apex) | 2.27 s | 8.74 s | same +~300 ms redirect |
| `www.kagiboy.xyz/demo` | 1.70 s | **10.22 s** | index → DemoPage+chip+gameboy 1.65→3.37 → **scene 3.55→4.89 → GLB 5.07→9.82** |

### Runtime (puppeteer, Metal GPU)

| Check | Result |
|---|---|
| Landing scroll FPS, desktop 1440×900 @2x, full page | 60 fps, p95 16.8 ms, max 16.8 ms, 0 long tasks |
| Landing 3D-stage scroll, mobile 412×823 @1.75x, **CPU 4x** | 60 fps, p95 16.7 ms, 0 frames > 33 ms |
| Load long tasks (desktop) | 64, 122, 53 ms |
| Load long tasks (mobile, CPU 4x) | 232, 154, 246, 53, 58, 250 ms. Top self time: three `onFirstUse` (sync shader link check) 182 ms, `scene.project` 116 ms (`getBoundingClientRect`), emulator `draw` 140 ms |
| `/demo` load long tasks (CPU 4x) | 283 + 353 ms; three `onFirstUse` 249 ms is the largest |
| WebGL contexts after 5× `/`↔`/demo`↔`/about` | 11 created, **≤1 live** (forceContextLoss works) ✔ |
| WebGL canvas size | desktop 2880×1800 (DPR 2 cap), demo 1120×1400 for 560×700 CSS ✔ |
| rAF loops at idle, `/` top | 3 × 60 Hz: gsap ticker (Lenis), ScrollTrigger `_rafBugFix`, landing loop |
| rAF loops at idle, `/` bottom (stage off-screen) | same 3 × 60 Hz. The landing loop early-returns but keeps rescheduling |
| rAF on `/about`, `/demo` | ScrollTrigger `_rafBugFix` 60 Hz + 250 ms `setInterval` keep running on **every** route (registered at module load in the entry) |
| Hidden tab | rAF → 0.5/s ✔. `/demo` 15 s balance polling `setInterval` keeps firing while hidden |
| Memory, 5 nav cycles | heap 14.1 → 16.6 MB, DOM nodes 859 → 6,153, JS listeners 230 → 769 (see §6) |

---

## 2. Bundle analysis (`vite build`, visualizer treemap in scratch `stats.html`)

| Chunk | min | gz | Loaded on | Contents |
|---|---|---|---|---|
| `index` (entry) | 588.7 KB | 196.7 KB | **all routes** | react-dom, gsap + ScrollTrigger (≈45 KB gz), motion/framer-motion (≈46 KB gz), react-router (15 KB gz), lenis (5 KB), canvas-confetti (4 KB), lucide icons, Landing.tsx (36 KB raw), **AboutPage + masonry-lightbox** (18 KB raw), accordion/timeline/comparison, Waitlist |
| `scene` | 650.0 KB | 164.5 KB | `/` and `/demo` (dynamic) | three.js r186 (WebGLRenderer, GLTFLoader, meshopt decoder, RoomEnvironment) |
| `chip` | 481.4 KB | 150.3 KB | `/demo` (static), `/` (attract mode, after the GLB) | @solana/web3.js, @noble/curves, viem (part), bn.js, buffer, qrcode-generator, bip39 |
| `gameboy` | 181.2 KB | 28.0 KB | `/demo`, `/` **(early, via fleaLoop)**, `/about` **(via chainLoop)** | serverboy core |
| `DemoPage` | 305.1 KB | 93.3 KB | `/demo` | viem, ox, KagiApp, tailwind-merge, phone |
| `dist` | 4,013.6 KB | 1,020.0 KB | only when a swap quote is first requested (`app/swap.ts:52`) ✔ | @sodax/sdk + stellar, icon-sdk, sui, injective, bitcoinjs, anchor… |

Answers to the specific questions:

- **Does `/` load the SODAX SDK?** No. It loads only on the first swap call. ✔
- **Does `/` load viem / solana / serverboy / the ROM?** Yes, but late. Attract mode (`landing/attract.ts:1-4`) imports `@solana/web3.js` and `chip/chip.ts` (viem, noble, qrcode), plus the emulator and `/wallet.gb`. They start after the GLB finishes, so they don't delay the 3D. They do add about 190 KB gz of download and parse to every landing visit. serverboy also loads **early** through the palette import (§3, R4).
- **Does `/about` load three.js?** No. ✔ It does load serverboy (28 KB gz) for nothing, through `chainLoop.ts:7`.
- **Do `/demo` and `/about` load landing-only code?** Yes. gsap, ScrollTrigger, Lenis, Landing.tsx and the landing sections are all in the entry (about 75 KB gz).

---

## 3. Asset audit

| Asset | Size | Notes |
|---|---|---|
| `3d/kagiboy.glb` | 1,445,644 B raw · **880 KB br** (Vercel already serves br) | meshopt + quantization ✔. Geometry dominates: **Bezel 122,754 tris** (1.29 MB before compression), Body 36k, total 635k render verts. Textures 257 KB: pcb PNG 65 KB, abs_noise_n PNG 72 KB (256², normal map), label JPEG 81 KB, face PNG 38 KB, screen-soft PNG 2.5 KB |
| `gallery/*.webp` (6) | 816 KB total (boot 235 KB at 1400×1317; others 1120×1400, 95–141 KB) | **No `loading="lazy"`** (`site/ui/masonry-lightbox.tsx:201`). All 6 start at 361 ms on `/about`, alongside the LCP image. Has width/height ✔. No srcset: a phone tile is about 180 CSS px wide yet downloads the 1120 px file |
| `renders/front-ortho.webp` | 49 KB, 900×1600 | **LCP on /about but `loading="lazy"`** (`site/FleaMarketGameBoy.tsx:36`) |
| `renders/hero-front34.webp` | 35 KB, 2400×1350 | landing still placeholder. No width/height (CSS-sized, CLS 0, so cosmetic only) |
| `renders/cart-exploded.webp` | 61 KB, 1600×2400 | lazy ✔ |
| other renders | 15–24 KB each | fine |
| `prints/*.png` | 4.5–9 KB, 480×432 | fine (pixel art in PNG is correct). `home.png`/`sign.png` have no width/height (unsized-images audit) |
| `screens/*.png` | 1.4–2.4 KB | fine |
| `tokens/*.webp` (≈70) | 1–4 KB each | `/demo` only, lazy ✔ |
| `fonts/PixelOperator8.ttf` | 20 KB (7 KB br) | TTF, not preloaded, `font-display: swap` ✔. WOFF2 would be about 6 KB; the gain is marginal because br already applies |
| `wallet.gb` | 32 KB (13 KB br) | loaded by attract and the demo ✔ |
| `og.png` | 380 KB, 1200×630 | crawlers only, no user impact. Could be about 120 KB as an 8-bit PNG |
| Google Fonts | CSS 0.9 KB **render-blocking** on fonts.googleapis.com + 2 variable woff2 (Funnel Display 17 KB, Funnel Sans 17 KB) on fonts.gstatic.com | two extra origins (DNS + TCP + TLS) before first paint. Lighthouse: "render-blocking, est. savings 690 ms" (mobile) |
| Videos / audio files | none | — |

---

## 4. Caching, compression, hints

Live headers (`curl -I` on www.kagiboy.xyz):

| Path | Cache-Control | Encoding |
|---|---|---|
| `/` (HTML) | `public, max-age=0, must-revalidate` | br ✔ |
| `/assets/index-B4mUZ4_J.js` (content-hashed) | **`public, max-age=0, must-revalidate`** ✘ | br ✔ |
| `/3d/kagiboy.glb` | **max-age=0** | br ✔ (`model/gltf-binary`) |
| `/gallery/*.webp`, `/renders/*`, `/tokens/*`, `og.png` | **max-age=0** | none (correct for webp/png) |
| `/fonts/*.ttf`, `/wallet.gb` | **max-age=0** | br ✔ |

- `vercel.json` sets only security headers. Vite's hashed `/assets/*` never gets `immutable`, so every repeat visit sends about 20 conditional requests (304s) before the page can run.
- `https://kagiboy.xyz/` returns **308 → `https://www.kagiboy.xyz/`**. That is a full extra round trip (about 300 ms measured on slow 4G) for anyone opening the shared apex link. `og:url`/`og:image` point at `kagiboy.vercel.app`, a third hostname.
- `index.html`: only `preconnect` to the two Google origins. No preload for the GLB, the hero still, or the local pixel font. The CSP blocks inline scripts (`script-src 'self'`), so any route-aware preload has to happen in JS modules or in `vercel.json` headers, not in an inline `<script>`.
- No compression issues: Vercel serves brotli for JS, CSS, GLB, TTF and the ROM.

---

## 5. Runtime findings (detail)

1. **Layout read every frame on the landing.** `placeCallouts` (`landing/Landing.tsx:176`) calls `scene.project()` for every callout every frame, even while the callouts are hidden (the `vis` check comes after `project`). It also calls `projectPoint()` for the slip (`Landing.tsx:263`). Each of these calls `this.canvas.getBoundingClientRect()` (`landing/scene.ts:227, 255, 267`), and `paintChapters` has just written styles, so each read forces a style/layout flush. `getBoundingClientRect` was the #3 self-time item during scroll (77 ms over the scroll at 4x CPU). It doesn't drop frames on an M5 but costs headroom on mid-range Android.
2. **First render compiles shaders synchronously.** three's `onFirstUse` link check costs 182 ms (`/`) and 249 ms (`/demo`) of main thread at 4x CPU, and is the largest single long task on `/demo`.
3. **ScrollTrigger runs globally.** `gsap.registerPlugin(ScrollTrigger)` at module scope (`Landing.tsx:15`, entry chunk) starts ScrollTrigger's `_rafBugFix` rAF loop plus a 250 ms `setInterval`. These run forever on `/demo` and `/about` too. The cost per tick is tiny, but it wakes the main thread 60×/s for the whole session (battery).
4. **The landing loop keeps rescheduling when off-screen** (`Landing.tsx:255-259`). The early return is cheap, but stopping the loop from the IntersectionObserver callback would let the page go fully idle once the stage is scrolled past (only the gsap ticker/Lenis would remain).
5. **Attract mode runs a full Game Boy core** at 60 Hz while the stage is visible, including `generateAudioFake` (audio emulation with no output). That is about 5% of scroll CPU. The ROM steps only while visible ✔.
6. **The `/demo` balance poll** (`demo/session.ts:128, 162`, every 15 s) keeps firing in hidden tabs. rAF is paused by the browser ✔.
7. motion `useScroll` in `site/ui/timeline.tsx:20` measures on every scroll frame even when the timeline is far off-screen. It was the top JS item during scroll (91 ms over the run at 4x). Minor.

---

## 6. Memory: DOM leak per route visit

Each mount → unmount of a route keeps the old page's entire DOM subtree:

| Cycle (route ↔ 404) | Nodes retained per cycle | JS listeners per cycle | Heap per cycle |
|---|---|---|---|
| `/` | ~778 (incl. 4 canvases, 13 imgs) | ~47 | ~0.7 MB |
| `/about` | ~167 | ~24 | ~0.2 MB |
| `/demo` | ~113 | ~8 | ~0.35 MB |

- GPU memory is **not** leaked: contexts are lost/freed, so live WebGL contexts stay ≤ 1.
- memlab finds two retainer chains, both through WeakMap ephemerons. The first is the three.js module-level `emptyTexture` → renderer `WebGLTextures` cache → `WebGLTexture` → lost `WebGL2RenderingContext` → canvas → whole landing tree. The second is motion's `visualElementStore` → `inView.stopObserver` closure → `<li>` in the Timeline → tree.
- Impact is low for a marketing site (a judge clicking around 10 times would hold about 5–7 MB extra). It's worth a 30-minute look after the bigger load wins.
- Cheap mitigation (quality-neutral): in `scene.dispose()` also null `this.screen.map/emissiveMap` and call `this.renderer.info.reset()`. In the Landing cleanup, clear `chapterRefs`/`calloutRefs` and remove the canvas element's reference from the scene (`this.canvas = null`). Then re-run the scratch `leak3.mjs` to confirm.

---

## 7. Ranked plan

Impact is for the target audience: hackathon judges on laptops and phones, mostly cold first visits. Effort: S < 1 h, M = a few hours, L = a day or more.

| # | Change | Where | Expected saving | Effort | Visual |
|---|---|---|---|---|---|
| **R1** | **Self-host Funnel Display + Funnel Sans.** Download the exact variable woff2 files Google serves to Chrome (latin + latin-ext, about 17 KB each). Add `@font-face` with `font-weight: 400 800` / `300 800`, the same `unicode-range`, `font-display: swap`. `<link rel="preload" as="font" type="font/woff2" crossorigin>` the two latin files. Drop the googleapis `<link>`s, preconnects and CSP entries | `index.html:17-19`, `src/kb.css` (next to the Pixel Operator face), `vercel.json` CSP | Removes the render-blocking third-party CSS and 2 origins: **≈0.5–0.9 s FCP/LCP on mobile** (LH estimate 690 ms). Same files, same rendering | S | **quality-neutral** (byte-identical fonts; keep both subsets so glyphs outside Latin-1 still match) |
| **R2** | **Fix `/about` LCP.** Give `FleaMarketGameBoy` an `eager` prop: `loading={eager ? "eager" : "lazy"}` and `fetchPriority="high"`, passed from `AboutPage.tsx:94`. Add `loading="lazy" decoding="async"` to the gallery tiles | `site/FleaMarketGameBoy.tsx:36`, `about/AboutPage.tsx:94`, `site/ui/masonry-lightbox.tsx:201` | `/about` mobile LCP **4.0 s → ≈2.5 s**. Initial `/about` bytes −800 KB (gallery loads on scroll) | S | **quality-neutral** (tiles fade in through `whileInView` anyway; if the gallery is ever above the fold, keep the first 2 eager) |
| **R3** | **Fetch the GLB in parallel with three.js.** Start `fetch("/3d/kagiboy.glb").then(r => r.arrayBuffer())` at the same moment as `import("./scene")`. Add `HeroScene.loadBuffer(buf)` using `GLTFLoader.parseAsync(buf, "/3d/")`. On `/demo`, start both as soon as `DemoPage` mounts (or at module eval of `DemoPage.tsx`), not after the shell effect | `landing/Landing.tsx:202-223`, `demo/GameBoyShell.tsx:107-141`, `landing/scene.ts:144-147` | 3D-ready on slow 4G: `/` **8.4 s → ≈6.9 s**, `/demo` **10.2 s → ≈7.5 s** (GLB no longer waits for the 164 KB scene chunk; on `/demo` also not for chip) | S | **quality-neutral** |
| **R4** | **Move the palettes out of the emulator module.** New `src/emu/palette.ts` exporting `DMG`/`SOFT_LCD`. `gameboy.ts` re-exports them. `fleaLoop.ts:6` and `chainLoop.ts:7` import from `palette` | `emu/gameboy.ts:19-33`, `landing/fleaLoop.ts:6`, `site/chainLoop.ts:7` | `/`: −28 KB gz in the critical window (serverboy no longer races the scene chunk; ≈0.8 s of slow-4G bandwidth). `/about`: −28 KB gz and −181 KB of parse entirely. Verified in a scratch build | S | **quality-neutral** |
| **R5** | **Cache headers.** Add to `vercel.json` `headers`: `{ "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }`, and for `/(3d\|renders\|gallery\|prints\|screens\|tokens\|fonts)/(.*)` plus `/wallet.gb` use `public, max-age=86400, stale-while-revalidate=604800`. When an un-hashed file changes, bump its name or add a `?v=` (as already done for `og.png`) | `vercel.json` | Repeat visits: about 20 revalidation round trips → 0; GLB/images served from memory or disk. Judges reopening the site see an instant load | S | **quality-neutral** (only risk is a stale GLB for ≤1 day after a re-export under the same name) |
| **R6** | **Make the apex the primary domain** (or at least don't 308 it). In Vercel → Domains, set `kagiboy.xyz` as primary and redirect `www` → apex. Update `og:url`/`og:image`/`twitter:image` to `https://kagiboy.xyz` | Vercel dashboard, `index.html:9-13` | ≈300 ms (1 RTT + TLS) off every cold visit from the shared link | S | **quality-neutral** |
| **R7** | **Lazy-load `/about` and confetti.** `const AboutPage = lazy(...)` like `DemoPage`. In `Waitlist.tsx` replace the static `canvas-confetti` import with `const { default: confetti } = await import("canvas-confetti")` inside `celebrate()` | `App.tsx:5`, `landing/Waitlist.tsx:3,18` | Entry 588.7 → 567.2 KB (196.7 → 189.8 KB gz), verified in a scratch build. `/about` +1 small request | S | **quality-neutral** (confetti starts ≈20 ms later on submit; preload it on form focus if wanted) |
| **R8** | **`motion` → `LazyMotion` + `m`.** Wrap the app in `<LazyMotion features={() => import("./motionFeatures").then(m => m.default)}>` (`domAnimation`; use `domMax` inside the masonry lightbox, which uses `layoutId`). Change `motion.x` → `m.x` in Waitlist, timeline, accordion, masonry. Hooks (`useScroll`, `useTransform`, `useReducedMotion`) stay | `landing/Waitlist.tsx`, `site/ui/timeline.tsx`, `site/ui/accordion.tsx`, `site/ui/masonry-lightbox.tsx`, `main.tsx` | Entry −≈31 KB gz (motion 46 → 15 KB gz up front; features 24 KB gz async). Measured with esbuild | M | **near-neutral**: until the async features arrive, `m` elements sit at their `initial` state (e.g. the Waitlist form at opacity 0). All of these are below the fold, so in practice the features have loaded first. Preload them on idle to be safe |
| **R9** | **Precompile shaders off the main thread.** After `gltf` is added in `HeroScene.load()`, `await this.renderer.compileAsync(this.scene, this.camera)` before the first `render`. It uses `KHR_parallel_shader_compile` where available | `landing/scene.ts` after line 147/180 | Removes the 180–250 ms (4x CPU) `onFirstUse` long task on `/` and `/demo`; lowers TBT/INP around 3D-ready | S | **quality-neutral** (same shaders; the first frame appears a few ms later, behind the still image) |
| **R10** | **Stop the per-frame layout reads.** In `scene.ts` `project`/`projectPoint`/`projectCorner`, use the cached `this.w`/`this.h` from `resize()` instead of `getBoundingClientRect()`. In `placeCallouts`, return early when `vis <= 0.01` before calling `scene.project` | `landing/scene.ts:225-267`, `landing/Landing.tsx:176-200` | Removes a forced style/layout flush per callout per frame while scrolling the stage (#3 self-time during scroll). Smoother on mid/low Android | S | **quality-neutral** (the canvas box *is* `w×h`; `ResizeObserver` keeps it in sync) |
| **R11** | **GLB textures → lossless WebP.** Re-export from the uncompressed source through the existing pipeline plus `gltf-transform webp --pattern "pcb\|abs_noise_n\|face\|screen-soft" --lossless` before `meshopt`. Keep `label` as JPEG (WebP was larger). Three's GLTFLoader supports `EXT_texture_webp` natively | `public/3d/kagiboy.glb` | **−88 KB br** (880 → ≈792 KB). Verified: textures-only pass **0.000 % pixel difference** on 5 landing poses | S | **quality-neutral** (lossless; pixel-diff verified). Re-running meshopt on the already-compressed file adds about 69 KB, so do it from the source GLB |
| **R12** | **Decimate the Bezel only.** `simplify` the `Bezel` mesh at `error 1e-4, lockBorder` (122,754 → 27,146 tris). Do **not** simplify `Body` | GLB export | −≈30 KB br more; −95k triangles of vertex work per frame (≈−15 % of render verts), which helps low-end GPUs at DPR 1.75 | S | **near-neutral**, verified: 0.003 % of pixels differ by more than 16/255, mean abs diff 0.02/255 (invisible). More aggressive settings (`5e-4`, or Body included) produced visible shading facets and are **not** recommended |
| **R13** | **Stop global loops when not needed.** (a) Landing loop: cancel rAF when the IO says invisible and restart on visible (`Landing.tsx:253-259`). (b) On Landing unmount call `ScrollTrigger.disable()`; on mount `ScrollTrigger.enable()` (or move `registerPlugin` inside the effect). (c) `/demo` session: pause the balance interval on `visibilitychange` hidden | `Landing.tsx:15,253`, `demo/session.ts:128,162` | Idle main thread on `/demo`/`/about` and after scrolling past the stage; battery; fewer background RPC calls | S | **quality-neutral** |
| **R14** | **Gallery `srcset`.** Generate 560 w and 1120 w WebP variants of each gallery photo and add `srcset`/`sizes` | `public/gallery`, `site/ui/masonry-lightbox.tsx:201`, `about/AboutPage.tsx:12-17` | −50–70 % of gallery bytes on phones (≈800 → ≈300 KB) | M | **quality-neutral** at matching DPR (the lightbox keeps the full-size source) |
| **R15** | **Lazy route for the Landing too** (with an idle prefetch). `/demo` and `/about` stop downloading gsap, ScrollTrigger, Lenis, Landing and its sections | `App.tsx` | `/demo`, `/about` entry −≈75 KB gz | M | **quality-neutral**, but `/` gains one request in its chain (≈1 RTT). Only worth it after R7/R8, and ideally with route-aware `modulepreload` |
| **R16** | **Delay attract mode.** It downloads `chip` + `gameboy` + ROM (≈190 KB gz) and runs pbkdf2 key derivation on every landing visit. Option: start it on `requestIdleCallback` after the GLB is ready (already roughly the case), and skip it on `navigator.connection.saveData` / `effectiveType` 2g/3g, keeping the still `screens/home.png` there | `landing/Landing.tsx:238-248` | −190 KB gz and −≈300 ms CPU on slow devices | S | ⚠ **visual change on slow connections only**: the screen shows the still home image instead of the live ROM. Leave as is if the live screen matters on every device |
| **R17** | Fix the leak in §6 | `landing/scene.ts` dispose, Landing cleanup | ≈0.7 MB + 780 nodes per landing visit | M | quality-neutral |
| **R18** | (Optional, bigger lever) **Prerender the static HTML for `/` and `/about`** at build time (`renderToString` for the routes, then hydrate) | build script | Mobile FCP/LCP **2.8 s → ≈0.8 s** (the h1 paints before 190 KB of JS executes) | L | quality-neutral if hydration matches. Risk: `matchMedia`/window reads during render need guards. Not recommended before the deadline |
| — | Minor: `PixelOperator8.ttf` → WOFF2 + preload. Add `width`/`height` to `stage-still` and print `<img>`s. Compress `og.png` (380 → ≈120 KB) | `kb.css:5`, `Landing.tsx:349,384,429`, `public/og.png` | small | S | quality-neutral |

### Suggested order before 2026-10-12

1. **Same day, all quality-neutral, all S:** R1, R2, R3, R4, R5, R6, R7, R9, R10, R13.
   - Expected: mobile `/` LCP about 2.8 → 2.0 s.
   - `/about` LCP about 4.0 → 2.3 s.
   - 3D-ready on slow 4G: about 8.4 → 6 s on `/`, 10.2 → 7 s on `/demo`.
   - Repeat visits near-instant.
2. **Next:** R11 + R12 (one GLB re-export, verified by pixel-diff), then R8.
3. **If time allows:** R14, R15, R17. Skip R16 unless slow-device data says otherwise. Skip R18 before the deadline.

### Re-verification

All scripts are in the scratch dir:
- `lh.sh`: Lighthouse matrix.
- `ready.mjs`: time-to-3D on slow 4G.
- `scrollprof.mjs`: FPS and CPU during scroll.
- `leak.mjs`, `leak3.mjs`: navigation leak.
- `vdiff.mjs <baseline.glb> <candidate.glb>`: pixel-diff a re-exported model on the landing and demo before shipping it.
