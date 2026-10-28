# Plan — pilot (epic `pilot`)

## TL;DR
- 25 atomic steps in 5 checkpoints plus one closeout step. Variant A (twgl, imperative loop in `app.ts`, React only for the overlay), analysis H (`AnalyserNode` for (a), AudioWorklet for (b) stamped with `currentFrame`), own ACF + PLL for (c), planned last and non-blocking.
- S1.1 scaffolds `web/` and fixes the commands. S1.2 is a throwaway `?probe` page the user runs in Chrome on the M4 and reports numbers from (R1, R2, R5, R6, R9). The fallbacks the design names (α analysis, self-contained worklet, WebM) are conditional notes inside the steps they affect, not extra steps.
- CP1: line-in or file → (a) energy → tunnel reacts. CP2: (b) onsets, `?flash` lag method, `?debug` L/R meters. CP3: 4 scenes, FBO crossfade, director, keys. CP4: REC (MP4 first), quality modes, governor. CP5: (c) tempo + phase bonus behind the S8 contracts. S6.1: `THIRD_PARTY.md` (R4) and probe deletion.
- Every pure module (`energy`, `onset`, `tempo`, `sync`, `director`, `quality`) ships a Vitest file with synthetic fixtures. Gates for every step: `cd web && npm run lint && npm run typecheck && npm test`.

## Freshness
- Authored 2026-10-27 by planner (Fable 5.1), from: `agents/STATE.md` HEAD (gate 2026-10-27); `agents/system-designer/design_pilot.md` rev 3: TL;DR, Constraints, S1–S8, Variant A, ledger, Research gaps, Decision needed; `thoughts/spec_veejay_wizard.md` TL;DR, §2.1–§2.8, §3, §5, §6, §7; `agents/research/research_audio_copyleft_libs.md` §4 (beatfinder phase nudge, reference only) and §8; `research_render_stack.md` lines 6, 12, 23 for twgl 7.0.0 and MediaRecorder facts; `CLAUDE.md` Commands, Constraints (hard), Agents.
- Repo state: no `web/`, no `donor/`. Stale when the design or spec sections above change, or after 60 days.
- No internet during planning. Toolchain versions are not in research: steps say "latest at scaffold time, pinned exactly", and S6.1 records them.

## Chosen variant
`agents/system-designer/design_pilot.md` § "Variant A — twgl, imperative engine outside React" + § "Shared decisions" S1–S5, S7, S8 (S6 readiness only, nothing built). User gate passed 2026-10-27: Q1 = A, Q2 = H, Q3 = own ACF + PLL, Q6 = MP4/H.264 first with WebM fallback, Q4/Q5/Q7/Q8/Q9 = designer defaults (thresholds, keys `T [ ] , . B` + B + heuristic for bar "1", 60 fps = ≤1 late frame/min, `?flash` + 240 fps video, autopilot 16 bars / 30 s, localStorage, `web/`).

Conventions for all steps:
- Every step text starts with: **"Invoke the `ponytail` skill (full) before writing code."**
- Paths are under `web/`. Singletons (audio, store, engine, director, governor, recorder) are created at module level, never in Effects (S1). Overlay files export components only.
- Done-check for every step: `cd web && npm run lint && npm run typecheck && npm test`, plus the manual check listed.
- Numbers marked "knob" live as named constants at the top of the module.

## Checkpoints

### CP1 — thinnest slice: source → (a) energy → one scene (S1.1–S1.6)
**Frozen contract (CP1):**
```ts
// audio/energy.ts
export const BAND_COUNT = 32;                                        // log 30 Hz–16 kHz
export interface Levels { bass: number; mid: number; treb: number }  // 1 ≈ running average
export interface Energy { bands: Float32Array; level: Levels; att: Levels }
// frame.ts — what every scene reads each frame. CP1 fills energy/audioNow/time/dt/width/height;
// onsets/lastOnset stay empty/null until CP2, sync stays ZERO_SYNC until CP5. The type never changes.
export interface FrameInput { energy: Energy; onsets: readonly Onset[]; lastOnset: Onset | null; audioNow: number; sync: Sync; time: number; dt: number; width: number; height: number }
// gl/scene.ts
export interface Scene { readonly name: string; draw(f: FrameInput): void }   // draws into whatever framebuffer is bound
export type SceneFactory = (gl: WebGL2RenderingContext) => Scene;
// store.ts (fields may be added later, never renamed)
export interface UiSnapshot { devices: { id: string; label: string }[]; source: { kind: 'device'; id: string } | { kind: 'file'; name: string } | null; needsStart: boolean; sceneName: string; bpm: number; confident: boolean; hold: boolean; recording: boolean; quality: QualityMode; scale: number; drops: number }
export const store: { subscribe(cb: () => void): () => void; getSnapshot(): UiSnapshot; patch(p: Partial<UiSnapshot>): void }
```
**Demo:** `cd web && npm run dev`, open the URL in Chrome. Click **Start** (if shown), pick the USB line-in in the overlay picker (or drop an mp3 on the window). The tunnel scene swells with bass and sparkles on highs. Reload: the last device reconnects after one click. Console shows `track.getSettings()` (channelCount, sampleRate).

### CP2 — (b) onsets in audio time + lag method + channel check (S2.1–S2.4)
**Frozen contract (CP2):**
```ts
// audio/onset.ts — pure DSP shared by the worklet and Vitest
export interface Onset { t: number; strength: number }                 // t = AudioContext seconds from currentFrame
export function createDetector(opts?: Partial<DetectorOpts>): { detect(mag: Float32Array, t: number): Onset | null; readonly odf: number }
// audio/onset.worklet.ts → main, via port.postMessage
export type WorkletMsg = { kind: 'onset'; t: number; strength: number } | { kind: 'odf'; t0: number; hop: number; values: Float32Array } // ODF batched per 8 hops, for (c)
// audio/input.ts
export const onsetQueue: Onset[]          // drained by app.ts each frame
export function audioNow(): number        // ctx.getOutputTimestamp() mapped to this instant
```
**Demo:** play a track with clear kicks: the tunnel flashes on each kick, with the flash decaying by age even at 30 fps. `?flash` paints a full white frame per onset: film screen + speaker at 240 fps with a rekordbox click track on line-in and report the lag (spec §7.2 method). `?debug` shows L/R meters and `getSettings()`: run a test tone on each hardware input to verify channels 1–2 (spec §2.1).

### CP3 — four scenes, crossfade, director, keys (S3.1–S3.7)
**Frozen contract (CP3):**
```ts
// director.ts (pure)
export type OwnSceneId = 'tunnel' | 'spectrum' | 'particles' | 'glitch';
export interface Shot { from: OwnSceneId; to: OwnSceneId | null; mix: number }
export interface Director { update(now: number, sync: Sync): Shot; next(): void; prev(): void; setHold(on: boolean): void }
export function createDirector(playlist: readonly OwnSceneId[], opts?: Partial<DirectorOpts>): Director
// playlist.ts
export const playlist: readonly OwnSceneId[] = ['tunnel', 'spectrum', 'particles', 'glitch'];
// gl/engine.ts
export function render(shot: Shot, f: FrameInput): void;   // scene FBO(s) → mix → upscale → #stage
export function setOutput(width: number, height: number, scale: number): void;
```
**Demo:** all 4 scenes cycle every 30 s with a 2 s crossfade (no (c) yet, so the time fallback). `←`/`→` switch immediately, `Space` locks (overlay shows Lock), `F` toggles fullscreen. Overlay auto-hides ~2.5 s after the mouse stops.

### CP4 — REC, quality modes, governor (S4.1–S4.3)
**Frozen contract (CP4):**
```ts
// quality.ts
export type QualityMode = '60-adaptive' | '60-full' | '30';
export interface Governor { frame(now: number, jsMs: number): void; readonly scale: number; readonly drops: number; readonly refreshMs: number }
export function createGovernor(opts?: Partial<GovernorOpts>): Governor
// recorder.ts
export function pickMimeType(): string | undefined   // first of S5 list accepted by MediaRecorder.isTypeSupported
export function startRecording(finalCanvas: HTMLCanvasElement, audio: MediaStreamTrack, videoBps: number): () => Promise<void> // stop() downloads
```
**Demo:** `R` starts/stops recording; a `.mp4` (or `.webm` if MP4 fails the probe) downloads and plays in QuickTime with picture and sound. `Q` cycles `60A → 60F → 30`; the badge reads e.g. `60A · 0.80× · 3 drops`. During REC, `Q` is ignored and `F` only rescales CSS. The user runs 60A for 30 min and reads the drops counter (≤30 late frames after warm-up = pass, Q7).

### CP5 — (c) tempo + phase bonus (S5.1–S5.4)
**Frozen contract (CP5, from S8):**
```ts
// audio/tempo.ts — own source
export interface TempoReading { bpm: number; anchor: number; confidence: number }   // anchor = audio time of a beat
export interface TempoSource { push(o: Onset): void; pushOdf(values: Float32Array, t0: number, hop: number): void; read(): TempoReading | null }
export function createTempoSource(opts?: Partial<TempoOpts>): TempoSource
// audio/sync.ts — controller
export interface Sync { bpm: number; beat: number; bar: number; confidence: number }
export const ZERO_SYNC: Sync   // bpm 0, beat 0, bar 0, confidence 0 (used since CP1)
export interface SyncControls { tap(t: number): void; double(): void; halve(): void; nudge(ms: number): void; downbeat(t: number): void }
export function createSync(source: TempoSource, opts?: Partial<SyncOpts>): SyncControls & { at(audioNow: number): Sync; feed(o: Onset): void }
```
**Demo:** steady 4/4 track: overlay BPM matches rekordbox within ±1 within ~10 s; scenes pulse between beats; autopilot now switches on bar lines every 16 bars with a 1-bar crossfade. `T`×4 sets tempo, `[`/`]` halve/double, `,`/`.` nudge ±10 ms, `B` marks bar "1". In a break the grid holds; a non-beatmatched overlap lowers confidence and the pulse fades to energy-only. `?debug` shows pulse-offset median/p95 (ms) and time-to-confident.

## Steps

### S1.1 `[x]` Scaffold `web/`
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** Vite + React + TS + ESLint + Vitest project in `web/`, gates green on an empty app, commands recorded for the lead.
- **Files:** `web/` via `npm create vite@latest web -- --template react-ts` (latest at scaffold time, pin exact versions in `package.json`); edit `web/package.json`, `web/vite.config.ts`, `web/index.html`.
- **Behaviour:** `index.html` has `<canvas id="stage">` and `<div id="ui">`; `main.tsx` mounts React into `#ui` inside `<StrictMode>`. Remove template demo files (logo, counter, `App.css`). Add Vitest (`environment: 'node'`, `include: ['src/**/*.test.ts']`, via `test` key in `vite.config.ts`). Scripts: `dev`, `build`, `preview`, `lint` (`eslint .`), `typecheck` (`tsc --noEmit -p tsconfig.app.json` ⚠️ adjust to the template's tsconfig layout), `test` (`vitest run`), `test:watch`. Keep the template's ESLint flat config (typescript-eslint, react-hooks, react-refresh ⚠️ verify present; add if missing). `.gitignore` the template default. One smoke test `src/smoke.test.ts` (`expect(1+1).toBe(2)`) so `npm test` exercises the runner.
- **Tests:** smoke only.
- **Done-check:** gates green; `npm run dev` serves a black page with an empty overlay div.
- **Record for CLAUDE.md § Commands** (coder puts this block at the end of its final message): `cd web && npm install` · `npm run dev` (Vite, prints the localhost URL) · `npm run lint` · `npm run typecheck` · `npm test` · `npm run build && npm run preview` (bundle check). Gates = `npm run lint && npm run typecheck && npm test` from `web/`.
- **Deps:** react, react-dom (MIT); vite, @vitejs/plugin-react, typescript, vitest, eslint + template plugins (licenses recorded in S6.1, R4).
- **Depends on:** nothing.
- **Changed during implementation:**
  - Scaffolded with `create-vite@9.3.3 --template react-ts --eslint --no-interactive --no-immediate`. 9.x defaults React templates to Oxlint; `--eslint` keeps the ESLint flat config (typescript-eslint, react-hooks, react-refresh all present).
  - **TypeScript pinned to 6.0.3, not the template's `~7.0.2`.** create-vite 9.3.3's `--eslint` path means to set `~6.0.3`, but a bug overwrites it. TS 7 ships no JS compiler API, and typescript-eslint 8.72.1 peers `typescript <6.1.0`, so npm fails with ERESOLVE. npm 10.8.2 first crashed with `Cannot read properties of null (reading 'edgesOut')` on the same conflict.
  - **Vitest 4.1.12, not the latest 5.0.5.** Vitest 5 needs Node ≥22.12, while 4.1.12 supports Node 20 and Vite 8.
  - Exact pins: react/react-dom 19.3.1, vite 8.3.5, @vitejs/plugin-react 6.1.2, typescript 6.0.3, vitest 4.1.12, eslint 10.13.0, typescript-eslint 8.72.1, @eslint/js 10.0.1, eslint-plugin-react-hooks 7.1.1, eslint-plugin-react-refresh 0.5.7, globals 17.13.0, @types/node 24.19.2, @types/react 19.3.0, @types/react-dom 19.3.0.
  - `typecheck` = `tsc -b`, matching the template's project references (app + node configs, so `vite.config.ts` is checked too). Verified that it fails on a type error.
  - `vite.config.ts` imports `defineConfig` from `vitest/config` so the `test` key is typed.
  - Page styles are inline in `index.html`: a black page with full-viewport `#stage` and `#ui`. Template `src/index.css`, `src/assets/`, `App.*` and `public/icons.svg` were deleted. `favicon.svg` and the README were kept.

### S1.2 `[x]` Throwaway `?probe` page (R1, R2, R5, R6, R9) — the USER runs it on the M4
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** one page that prints the numbers the design needs before worklet, recorder and governor steps are implemented.
- **Files:** `web/src/probe/probe.ts`, `web/src/probe/probe.worklet.ts`, `web/src/main.tsx` (if `location.search` contains `probe`, `import('./probe/probe')` and skip React).
- **Behaviour:** renders a `<pre>` with, in order:
  1. **R1 codecs:** `MediaRecorder.isTypeSupported` for `video/mp4;codecs=avc1.640028,mp4a.40.2`, `video/mp4;codecs=avc1.64002A,mp4a.40.2`, `video/mp4;codecs=avc1.42E01E,mp4a.40.2`, `video/mp4;codecs=avc1,mp4a.40.2`, `video/mp4`, `video/webm;codecs=vp9,opus`, `video/webm;codecs=vp8,opus`, `video/webm` (level strings ⚠️ candidates; the output tells which matter).
  2. **R1 size:** `document.documentElement.clientWidth/Height × devicePixelRatio`, re-printed on `fullscreenchange` (button "Fullscreen").
  3. **R1 timer query:** `gl.getExtension('EXT_disjoint_timer_query_webgl2') !== null` (informational).
  4. **R6 autoplay:** `new AudioContext().state` at load with no gesture.
  5. **R5 worklet bundling:** `ctx.audioWorklet.addModule(new URL('./probe.worklet.ts', import.meta.url))` where `probe.worklet.ts` does `import FFT from 'fft.js'` and imports a tiny TS helper from `probe.ts`'s folder (e.g. `export const hann = …`). Print OK/error. The user runs this both in `npm run dev` and in `npm run build && npm run preview` (bundled path).
  6. **R9 message latency:** the worklet posts `{ctxTime: currentTime}` every 8 blocks for 10 s; main computes `performance.now() − (ot.performanceTime + (msg.ctxTime − ot.contextTime)·1000)` with `ot = ctx.getOutputTimestamp()`; print median and p95 in ms. Also print `ctx.baseLatency`, `ctx.outputLatency`, `ctx.sampleRate`.
  7. **R2 recording cost:** button "Rec test": a raw-WebGL2 fullscreen fragment shader with a ~200-iteration loop (GPU load) on a canvas at ½ base then at full base; for each size: 15 s plain, then 15 s with `MediaRecorder` on `canvas.captureStream()` (first supported MP4 type, 12 Mbps, no timeslice) + a silent audio track from an `OscillatorNode` → `MediaStreamAudioDestinationNode`; print median rAF delta, count of frames >1.5× median, `performance.memory` ⚠️ (Chrome-only; skip if absent) before/after, and the resulting Blob size. Then resize the canvas mid-recording (button) and report whether the file still plays (user opens it in QuickTime).
- **Tests:** none (throwaway; excluded from lint via the path if it needs any `any`, otherwise lint clean).
- **Done-check:** gates green. **Manual:** the user pastes the `<pre>` output into the chat; the lead records the numbers in STATE. Deleted in S6.1.
- **Conditional fallbacks recorded for later steps:** R5 fails → S2.2 writes a self-contained worklet (own ~40-line radix-2 FFT inlined; no imports) — fallback A. R9 median > ~20 ms ⚠️ or R5 still fails → **α analysis**: S2.2 is skipped and S2.3 runs `createDetector` on the main-thread `AnalyserNode` 1024 frames, stamping `t = audioNow()` (receipt time). R1 has no MP4 → S4.3 simply falls through to WebM. R2 full-size recording cannot hold 60 fps → S4.3 note "REC at 60F is best-effort; 60A is the recording mode".
- **Deps:** `fft.js@4.0.4` (MIT on npm; GitHub has no LICENSE file, per design S7).
- **Depends on:** S1.1.
- **Changed during implementation:**
  - **R5 as specified cannot pass in `build`/`preview`. This was verified locally.**
    - Vite 8.3.5 treats `new URL('./probe.worklet.ts', import.meta.url)` as a plain asset. `dist/` inlines the raw, untranspiled TS as `data:video/mp2t;base64,…`: under 4 KB it is inlined, and `.ts` maps to the MPEG-TS MIME type.
    - So `addModule` must reject. Fallback A as written (a self-contained `.ts` worklet loaded the same way) would fail for the same reason.
    - In dev the same form works: it is served as JS with `fft.js` and `./hann` rewritten.
  - **Added R5b:** the same worklet via Vite's bundled-worker import `./probe.worklet.ts?worker&url`, loaded on its own `AudioContext`, because one scope can't register `'probe'` twice.
    - Build: it emits `assets/probe.worklet-*.js`, an IIFE with fft.js and hann bundled and no `self`, `importScripts` or DOM references. Executed in Node with stub worklet globals, it registers `probe` and posts `fft.js size 1024, hann(2,4) = 1`.
    - Dev: it serves `?worker_file&type=module`, prefixed with `import env.mjs`, which uses `globalThis`.
    - If the user's run confirms R5b OK in preview, S2.2 can bundle its worklet this way instead of fallback A or α. This is the planner/lead's call.
  - Extra helper file `web/src/probe/hann.ts`: the "tiny TS helper", which must not be `probe.ts` itself because that file has DOM side effects. The worklet evaluates `new FFT(1024)` and `hann` at module scope, so a broken import makes `addModule` reject.
  - Additions for the user: a header line (dev vs build/preview, timestamp, UA), a **Copy output** button (clipboard), a busy guard so only one test runs at a time, and an `ERROR:` line instead of a hang if `MediaRecorder` errors.
  - R2 uses the `#stage` canvas. "½ base" means half of each axis. The resize test is its own button: 5 s at ½ base, then 5 s at full base, after which a download link appears.
  - Dev-only: the first time dev discovers `fft.js`, Vite re-optimizes deps and reloads the page once (`optimizeDeps` does not crawl `new URL` worklets). The local cache now holds fft.js. S2.2 may want `optimizeDeps.include: ['fft.js']`.

- **Probe results (2026-10-27, Chrome 156 on the M4; the user's manual dev run plus the lead's Playwright run on the installed Chrome, dev + preview):**
  - R1 codecs: every `video/mp4;codecs=avc1.*` and WebM type is supported, so S4.3 goes MP4 first (`avc1.640028` picked). The timer query is present.
  - R1 DPR: the user's profile reports 1.8 (zoom ≠100% or another display ⚠️); a fresh profile reports 2.0. Always use live `devicePixelRatio`.
  - R6: `suspended` at load in a normal profile, so the one-click Start (S1.4) is required. Under automation it read `running`, which is not representative.
  - R5/R5b: plain `new URL('…worklet.ts')` works in dev and FAILS in preview. `?worker&url` works in BOTH.
    - **S2.2 loads its worklet via `?worker&url`.** Fallback A and α are dropped. Add `optimizeDeps.include: ['fft.js']`.
  - R9: median −43.4 ms vs audible time (base 5.8 + output 40 ms), so the message lag is ≈2–3 ms (derived). **H stands.** sampleRate 44100.
  - R2: heavy shader at 2400×1754 (window size; Playwright fullscreen did not enlarge it), 15 s per phase.
    - Plain: 1/892 frames >1.5× median. With REC: 4/896. At ½ size: 0/901 both. **REC holds 60 fps.** Thermal behaviour is untested.
    - Actual bitrate is ~21–23 Mbps against 12 requested (ffprobe 21.4 Mbps). S4.3 must check whether `videoBitsPerSecond` is honoured; 30 min ≈ 5 GB.
  - **Resizing mid-REC corrupts the MP4.** ffmpeg shows decode errors after the resize and the container keeps the first size. So freezing the output size during REC is MANDATORY, and the recording size must be even (877 was cropped to 876).

### S1.3 `[x]` `energy.ts` pure band math + auto-gain, with tests
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** (a) energy as pure functions over a magnitude array; no Web Audio imports.
- **Files:** `web/src/audio/energy.ts`, `web/src/audio/energy.test.ts`, `web/src/frame.ts` (the `FrameInput` type + `ZERO_SYNC` import from a stub `audio/sync.ts` exporting only `Sync` and `ZERO_SYNC` for now — 3 files + the 6-line stub ⚠️ allowed; the stub is replaced in S5.2).
- **Behaviour:** `bandEdges(sampleRate, fftSize, count=32, lo=30, hi=16000)` → bin index pairs, log-spaced; every band has ≥1 bin (low bands clamp, may share bins ⚠️ coarse 46.9 Hz bins, design S2). `createEnergy(sampleRate, fftSize)` returns `{ update(magDb: Float32Array, fps: number): Energy }`: converts the `AnalyserNode` dB array to linear, fills `bands` (mean per band, 0..1-ish), sums bass/mid/treb over 20–320 / 320–2800 / 2800–11025 Hz, then auto-gain per Butterchurn (audio §4 constants, design S2): `imm` = band sum; `avg` smoothed with rate 0.2 when rising, 0.5 when falling; `longAvg` with rate 0.992 (first ~50 frames: 0.9 so it seeds fast); each rate rescaled `rate ** (30 / fps)`; `level = imm / longAvg`, `att = avg / longAvg`; guard division by ~0. Reuses one `Energy` object (no per-frame allocation).
- **Tests (synthetic fixtures):** edges monotonic and within [30 Hz, 16 kHz]; each band non-empty; a single-bin spike at 100 Hz → bass > 0, mid = treb = 0; spike at 1 kHz → only mid; 5 kHz → only treb; constant input for 600 frames at 60 fps → `level.bass` → 1 ± 0.05; a 2× step → `level` jumps ≈2 then returns to < 1.2 within 4.2 s·2; after a step `att` < `level` (attack smoothing); at 60 fps the effective rate equals `sqrt(rate)` at 30 fps (two frames at 60 ≈ one at 30, ±1e-6).
- **Done-check:** gates green.
- **Depends on:** S1.1.
- **Changed during implementation:**
  - Added a 1-line stub `web/src/audio/onset.ts` exporting only `Onset`, because the frozen `FrameInput` type needs it now. S2.1 fills that file.
  - **Silence re-seed:** the 50-frame fast seed (0.9) restarts whenever the bass + mid + treb sums are exactly 0 (digital silence: no source yet, paused file). The app always starts silent, before Start and the device pick. Without this, the first sound reads ≈250× average at 60 fps and takes ~4 s to settle. Covered by an extra test.
  - `avg`/`longAvg` start at 0, not Butterchurn's 1. That 1 is negligible in Butterchurn's large FFT units but not in AnalyserNode linear magnitudes (~1e-4…0.2 per bin). The guard returns 0, not Butterchurn's 1, when `longAvg` is 0. 0/0 is the only NaN case: after any sound, `level ≤ 1/(1 − rate)`.
  - `bands` = mean linear magnitude, as specified, so the values are small (loud bass ~0.03–0.2, highs ~1e-4). Scenes map them: the tunnel uses a dB window. S3.3 needs to know this.

### S1.4 `[x]` `audio/input.ts` + `store.ts`: context, devices, sources, fan-out, Start fallback
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** one `AudioContext` singleton, device list, line-in and file sources, the fan-out nodes, persistence.
- **Files:** `web/src/audio/input.ts`, `web/src/store.ts`, `web/src/audio/input.test.ts` (only for the pure helpers; see tests).
- **Behaviour:** `ctx = new AudioContext({ latencyHint: 'interactive' })` at import. Fan-out hub: a `GainNode` the current source connects to; the hub feeds (i) `analyser` (`fftSize 1024`, `smoothingTimeConstant 0`), (ii) `recDest = ctx.createMediaStreamDestination()`; (iii) the worklet is attached in S2.2. **Device:** `getUserMedia({ audio: { deviceId: { exact: id }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } })` → `MediaStreamAudioSourceNode` → hub; **not** connected to `ctx.destination` (no monitoring). `console.info('input', track.getSettings())`. **File:** `drop` on `document` (`dragover` preventDefault) → `URL.createObjectURL` → one reusable `<audio>` element (not in DOM) → `MediaElementAudioSourceNode` (created once) → hub, and the element also → `ctx.destination`; `audio.play()`. `setSource` stops old tracks / pauses the element, disconnects the old node. `listDevices()` = `enumerateDevices().filter(audioinput)` refreshed on `devicechange` and after permission. **Start (R6 fallback):** `needsStart = ctx.state !== 'running'`; `actions.start()` → `await ctx.resume()`, then reconnect `localStorage['vjw.device']` if it is still in the list. `store.ts`: module-level snapshot + `subscribe/getSnapshot/patch`; `patch` replaces the snapshot object only if a value changed (S1 cached-snapshot rule). Export `audioNow()` = `ot.contextTime + (performance.now() − ot.performanceTime) / 1000` with `ot = ctx.getOutputTimestamp()`.
- **Tests:** `store.patch` returns the same object for a no-op patch and a new one for a change; `pickSaved(devices, savedId)` returns the saved device only if present. (Web Audio itself is not unit-tested.)
- **Done-check:** gates green. **Manual:** console prints `getSettings()` with `channelCount: 2` (or whatever the card reports) and `sampleRate`.
- **Depends on:** S1.1, S1.3 (for `FrameInput` only).
- **Changed during implementation:**
  - `pickSaved` lives in `store.ts` and the test file is `web/src/store.test.ts`, not `input.test.ts`. `input.ts` creates the `AudioContext` and DOM listeners at import, so Vitest in Node can't import it.
  - Added a 1-line stub `web/src/quality.ts` exporting only `QualityMode`, which `UiSnapshot` needs. S4.1 fills it.
  - There is no `actions` object. `input.ts` exports `start`, `selectDevice`, `allowDevices` and `listDevices` as named functions. A name like `useDevice` would trip the rules-of-hooks lint.
  - `devices` holds labeled `audioinput`s only, because labels stay empty until permission (MDN). An empty list means the picker shows "Allow audio input…".
  - `needsStart` follows the context's `statechange`. If the context is already `running` at load (autoplay allowed, e.g. under automation), the saved-device reconnect runs without a click.

### S1.5 `[x]` `gl/engine.ts` (minimal) + `scenes/tunnel.ts` + `app.ts` loop
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the rAF loop reads (a) and draws the tunnel straight into `#stage`.
- **Files:** `web/src/gl/engine.ts`, `web/src/scenes/tunnel.ts`, `web/src/app.ts` (plus `web/src/gl/scene.ts` holding the 2 contract types ⚠️ 4th file, types only).
- **Behaviour:** `engine.ts`: `gl = stage.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false })`; `webglcontextlost` → `location.reload()`; a shared fullscreen-triangle buffer and `fullscreenProgram(fs)` helper via twgl (`createProgramInfo`, `createBufferInfoFromArrays`, `setUniforms`, `drawBufferInfo`); `setOutput(w, h, scale)` sizes `#stage` (CP1: scale is 1, output = `clientWidth·dpr/2` measured on `resize`/`fullscreenchange`); CP1 `render(shot, f)` just binds the default framebuffer and calls `scenes[shot.from].draw(f)`. `tunnel.ts`: one fragment shader (polar tunnel, bass swells the radius via `energy.att.bass`, treb adds sparks via `energy.level.treb`, bands drive stripes); exports `params` (e.g. `{ speed, twist, glow }`) read as uniforms. `app.ts`: imports singletons, `requestAnimationFrame` loop: `analyser.getFloatFrequencyData(buf)` → `energy.update(buf, fps)` → build `FrameInput` (`onsets: []`, `lastOnset: null`, `sync: ZERO_SYNC`, `audioNow: audioNow()`) → `engine.render({ from: 'tunnel', to: null, mix: 0 }, f)`. One module-level `keydown` listener (empty switch for now; `F` fullscreen toggle). HMR: engine/scene edits must full-reload (default Vite behaviour when no importer accepts; ⚠️ verify in the manual check, never a second GL context).
- **Tests:** none new (GL); the loop's pure parts live in other modules.
- **Done-check:** gates green. **Manual:** tunnel reacts to music; edit `tunnel.ts` → the page fully reloads (console cleared) with no "too many active WebGL contexts" warning.
- **Deps:** `twgl.js@7.0.0` (MIT).
- **Depends on:** S1.3, S1.4.
- **Changed during implementation:**
  - Added a 2-line stub `web/src/director.ts` exporting only `OwnSceneId` and `Shot`, which `render(shot, f)` needs. S3.6 fills it.
  - **No import cycle:** scene modules import `fullscreenProgram` from the engine, so the engine can't import them. Instead, `engine.ts` exports a `scenes` registry that `app.ts` fills at startup (`scenes.tunnel = tunnel(gl)`).
  - `setOutput(w, h)` has no `scale` parameter yet: CP1 has no FBOs, and an unused parameter fails `noUnusedParameters`. S3.1 adds it.
  - `app.ts` measures on `resize` + `fullscreenchange` and reads `devicePixelRatio` live (`BASE = 0.5` knob).
    - A DPR change without a resize, e.g. moving the window to another display, is not caught. S3.1 ("measured base size") can add a `matchMedia` resolution listener.
  - `main.tsx` now dynamic-imports `./app` in the non-probe branch. The loop needs this to run and to land in the build, and `?probe` still never loads the app.
  - `keydown` ignores repeats and modifier chords, so Cmd+F stays the browser's Find.
  - **Tunnel look:**
    - Bands go through a −90…−30 dB window with a +1.3 dB/band tilt.
    - Stripes attack instantly and release at 0.85 per 60 Hz frame (`BAND_RELEASE`), so raw per-frame bands don't flicker.
    - Bass swell clamps `att.bass` to [0, 3].
  - **Not verified here:** there is no local GLSL validator and no browser, so shader compilation and HMR behaviour wait for the lead's Playwright run.
  - `npm run build` passes: the app chunk with twgl is 26.3 kB (9.7 kB gz).

### S1.6 `[x]` Overlay: Start, source picker, file hint, auto-hide
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the minimal React overlay (spec §2.6) with the CP1 subset.
- **Files:** `web/src/ui/Overlay.tsx`, `web/src/ui/overlay.css`, `web/src/main.tsx`.
- **Behaviour:** `useSyncExternalStore(store.subscribe, store.getSnapshot)`. Centered **Start** button while `needsStart`. Top bar: `<select>` of devices (labels; "allow microphone" prompt handled by requesting permission on first open), "Drop an audio file anywhere" hint, scene name placeholder. Auto-hide: visible on `mousemove`, hidden 2.5 s later (CSS opacity transition, `pointer-events: none` when hidden). Dark, calm styling; no component library. Overlay never subscribes to per-frame values.
- **Tests:** none (UI; no jsdom dep added).
- **Done-check:** gates green. **Manual:** CP1 demo passes end to end.
- **Depends on:** S1.4, S1.5.
- **Changed during implementation:**
  - `main.tsx` dynamic-imports both `./app` and `./ui/Overlay` (top-level await), so `?probe` never loads the singletons. S6.1 can make these static imports when it deletes the probe.
  - The picker blurs itself after a change. Otherwise a focused `<select>` eats later hotkeys (`F` now, the CP3/CP5 keys later) as type-ahead and can switch devices.
  - The hint shows `▶ <file name>` while a dropped file is the source.
  - The Start button is centred and stays visible while `needsStart`, so it never auto-hides.
  - **Not done:** the cursor doesn't hide with the bar, because the step doesn't ask for it. S3.7's "auto-hide polish" can add `cursor: none` on the same idle state.
  - **HMR verified on the dev server without a browser.** Only `Overlay.tsx` self-accepts. Vite logged `page reload` for edits to `tunnel.ts`, `engine.ts` and `input.ts`, and `hmr update` for `Overlay.tsx`. So engine, scene and audio edits never create a second GL or audio context.

### S2.1 `[x]` `onset.ts` pure DSP (spectral flux + causal peak-pick), with tests
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** (b) detection as a pure stateful closure usable from the worklet and Vitest.
- **Files:** `web/src/audio/onset.ts`, `web/src/audio/onset.test.ts`.
- **Behaviour:** `createDetector({ hopSeconds, threshold = 1.5 knob, meanWindow = 16 hops knob, minGap = 0.05 s knob })`. `detect(mag, t)`: flux = Σ max(0, mag[k] − prev[k]) (half-wave rectified; log-compressed magnitudes `log1p(mag·k)` so loud and quiet inputs behave alike); ODF history ring; causal peak-pick with `post_max = 0`: a hop is an onset when `odf > mean(last N) · threshold + ε` and `odf ≥ max(prev 3 hops)` and `t − lastOnset ≥ minGap`; `strength = odf / mean` clamped to [0, 4]. Exposes `odf` (latest value) for the (c) ODF batch.
- **Tests (synthetic):** identical spectra → flux 0; rising spectrum → positive, falling → 0; a click train (impulse every 20 hops in noise of 1% amplitude) → exactly one onset per click, `t` equal to the click hop's `t` (causal, same hop); two clicks 1 hop apart → one onset (minGap); scaling all magnitudes ×10 → identical onset set (level independence); silence → no onsets.
- **Done-check:** gates green.
- **Depends on:** S1.1.
- **Changed during implementation:**
  - No `hopSeconds` option: nothing in the detector reads it, because minGap compares the stamped `t` in seconds. The hop length only travels in the worklet's `odf` message.
  - Knobs at the top of `onset.ts`, beyond the three named in the step:
    - `COMPRESS = 1000`, the `k` in `log1p(mag·k)`. It is calibrated for raw fft.js magnitudes (a full-scale sine ≈ 128), so bins above ~1e-3 sit in the log regime and a line-in's ~1e-4 noise floor stays near 0.
    - `FLOOR = 1`, the ε. It is an absolute ODF floor, so digital silence and a bare noise floor never fire.
    - `PEAK_HOPS = 3` and `MAX_STRENGTH = 4`.
  - The adaptive mean covers the previous `meanWindow` hops; the current hop is excluded. When an onset fires, `strength` is therefore > `threshold`, i.e. in (1.5, 4].
  - `prev` is a `Float64Array`. Float32 rounding made identical spectra read a flux of ≈1e-5.
  - The minGap test also runs with `minGap: 0` and expects 2 onsets, so it fails if minGap stops doing the blocking. The click test also checks that strength is in (1.5, 4].

### S2.2 `[x]` `onset.worklet.ts` + wiring in `input.ts`
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the AudioWorklet that runs `createDetector` at hop 256 / FFT 512 and posts onsets stamped with `currentFrame`, plus ODF batches.
- **Files:** `web/src/audio/onset.worklet.ts`, `web/src/audio/worklet.d.ts` (10 lines: `declare class AudioWorkletProcessor`, `registerProcessor`, `currentFrame`, `currentTime`, `sampleRate`; no `@types` dep), `web/src/audio/input.ts`.
- **Behaviour:** processor accumulates mono (mean of channels) into a 512-sample ring; every 256 samples: Hann window → `fft.js` real transform ⚠️ (check its `realTransform`/`completeSpectrum` API in the package README) → magnitudes (257 bins) → `detector.detect(mag, t)` with `t = (currentFrame + 128) / sampleRate` of the block that completed the hop ⚠️ (end of window; the design's 5.3 ms centre offset is handled by the `lead` knob in S5.3). On onset: `port.postMessage({ kind: 'onset', t, strength })`. Every 8 hops: `{ kind: 'odf', t0, hop: 256/sampleRate, values }` (copy of the last 8 ODF values). `process()` returns `true`. `input.ts`: after `ctx.resume()`, `await ctx.audioWorklet.addModule(new URL('./onset.worklet.ts', import.meta.url))` (the S1.2 R5-verified form), `new AudioWorkletNode(ctx, 'onset', { numberOfOutputs: 0 })` ⚠️ (if `process` is not called with 0 outputs, use 1 output into a muted `GainNode` → destination), hub → node; `port.onmessage` pushes onsets into `onsetQueue` and ODF batches into `odfQueue`.
- **Conditional (from S1.2):** R5 failed → fallback A (self-contained worklet: inline a ~40-line radix-2 FFT in `audio/fft.ts`, tested against a naive DFT, and have the worklet import only our own files; if even that fails, inline everything in the worklet file). R9/R5 both bad → α: skip this step; S2.3 stamps onsets from the main-thread analyser.
- **Tests:** none new (`onset.ts` is already tested; if `fft.ts` is written, `fft.test.ts` vs naive DFT on a 512-sample sine, max abs error < 1e-6).
- **Done-check:** gates green. **Manual:** console logs onsets with increasing `t` while a track with kicks plays.
- **Depends on:** S1.2 numbers, S1.4, S2.1.
- **Changed during implementation:**
  - **Loading:** the worklet loads via `import onsetWorklet from './onset.worklet.ts?worker&url'`, per the probe decision (R5b), not via `new URL(…)`. Fallback A and α are dropped. `vite.config.ts` gets `optimizeDeps.include: ['fft.js']`.
    - The build emits `dist/assets/onset.worklet-*.js`, 6.5 kB. It is a plain-JS IIFE with fft.js and `onset.ts` bundled, and no `import`, `export`, `self` or DOM references.
  - **No `worklet.d.ts`:** the worklet globals are declared inside `onset.worklet.ts` (module-scoped, as the probe does). A global `.d.ts` would make `sampleRate` and `currentFrame` typecheck in main-thread code too.
  - `WorkletMsg` is exported from `onset.worklet.ts`, where the contract places it. `input.ts` imports it type-only.
  - **When it loads:** `addModule` runs once at `input.ts` import, not after `ctx.resume()` in `start()`. `addModule` works on a suspended context (R5), and loading at import covers both the autoplay path and the Start path with no double registration.
  - **`numberOfOutputs: 0` works.** Headless installed Chrome on `vite preview` calls `process()` and onsets reach the page, so the muted-gain fallback is not needed.
  - **`odfQueue` is capped at 64 batches (≈3 s, `ODF_KEEP`),** because nothing drains it before S5.3. Without the cap it would grow by ~21 batches/s.
  - **Logging:** onset console lines (`onset <t> <strength>`, `console.info`) appear only with `?debug`, so normal runs don't log several lines per second. `onprocessorerror` and an `addModule` rejection both log `console.error('onset worklet', …)`.
  - An input with zero channels (no source yet) is processed as silence, so the worklet's time and the ODF batches stay continuous.
  - **Verification:**
    - The built chunk was run in Node with stub worklet globals on a synthetic 120 BPM kick train. It gave one onset per kick, stamped 0.7–4.7 ms after the kick (within one 5.3 ms hop), with `t` increasing and the ODF batches contiguous (`t0` steps of 8 hops).
    - Headless Chrome on the built preview, with a dropped synthetic WAV under `?debug`: onsets logged with increasing `t`.
  - **Finding, synthetic WAVs only:** with digital silence between hits, a hard cut at a kick's end fires; it is a real broadband transient. 16-bit quantisation in a decaying tail now and then fires weakly, at strength 1.6–1.7.
    - `COMPRESS = 100` was tried and was worse (strength 2–3 extras), so it stays at 1000.
    - A line-in always has an analog noise floor. If real tracks show extras, the knobs are `FLOOR` and `threshold`.

### S2.3 `[x]` Onsets in the loop: queue drain, `lastOnset`, age envelope, `?flash`
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** scenes receive `onsets`/`lastOnset`; the tunnel flashes; the lag method exists.
- **Files:** `web/src/app.ts`, `web/src/scenes/tunnel.ts`, `web/src/gl/engine.ts`.
- **Behaviour:** each frame `app.ts` splices `onsetQueue` into `f.onsets`, sets `f.lastOnset`; tunnel adds `flash = strength · exp(−(audioNow − t) / 0.12)` (age-based, so a 30 fps frame still shows the right decay). `?flash`: when `location.search` has `flash`, `engine.render` clears to white and returns on any frame with `f.onsets.length > 0` (no scene draw), else draws normally. Drop onsets older than 1 s on drain (protects against a stalled tab).
- **Tests:** `ageEnvelope(strength, age, tau)` is a one-liner: skip (YAGNI).
- **Done-check:** gates green. **Manual:** kicks flash; `?flash` white frames on a click track. The user films the 240 fps lag video per Q8 and reports the number for STATE (spec §7.2).
- **Depends on:** S2.2 (or α).
- **Changed during implementation:**
  - **The age is clamped at 0:** `flash = strength · exp(−max(0, audioNow − t) / 0.12)`. When an onset arrives, its `t` (processing timeline) is ahead of `audioNow` (output timeline) by about the output latency (R9: ≈43 ms on the M4). Unclamped, the flash would start at ≈1.4× strength. So the flash shows at full strength from receipt, then decays.
  - **Tunnel look:** `fl = strength / 4`. The walls brighten by `1 + 1.5·fl` and the end light bursts by `1 + 6·fl`. `FLASH_TAU = 0.12` s is a knob.
  - `f.lastOnset` is the newest onset seen and persists across frames, so the decay keeps running between onsets.
  - The drain is one line (`onsetQueue.splice(0).filter(…)`, with `STALE = 1` s). It allocates two small arrays per frame.
  - **Verified headlessly** (installed Chrome on the built preview, dropped synthetic 120 BPM kicks, a pixel read after each app frame):
    - No console errors, so the tunnel shader compiles. 60 fps (210 frames in 3.5 s).
    - `?flash&debug`: 9 white frames in 3.5 s.
    - `?debug` alone: 0 white frames, and a wall pixel's luma reaches 715 on hits against a median of 161.
  - **T1 (lead, 2026-10-28): file onsets wait until audible.** For a file, an onset's `t` arrives ≈ the output latency before the speakers play that sample, so the visuals led file audio by ~45 ms. Line-in is heard live in the room at capture time, so its onsets still apply on arrival.
    - **Where:** the queue drain in `app.ts`. For a file source, it splices only the onsets with `t ≤ audioNow` and leaves the rest queued (the queue is in `t` order). That is 2 lines plus the source check (`store.getSnapshot().source?.kind === 'file'`). The tunnel's `max(0, age)` clamp stays for line-in.
    - **Why there and not in the age formula:** the drain is the one place onsets enter `FrameInput`, so the fix also covers `f.onsets` (particle bursts, the `?flash` white frame) and every later scene.
      - A per-scene "negative age → flash 0" rule would replace `lastOnset` ~45 ms early, which would cut the previous hit's decay to black before each new hit.
      - It would also have to be repeated in each scene.
    - **Verified** (installed Chrome, dev, `?flash&debug`, `kicks128n.wav`): 31 onsets gave 31 white frames. The onset age at its white frame was +2.4…+18.2 ms (median +10.5), i.e. within the first frame where the hit is audible. With T1 patched out of the served `app.ts`, the same run gave −44.3…−15.7 ms (median −35.8).

### S2.4 `[x]` `?debug` readout: L/R meters + `getSettings()`
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the spec §2.1 channel check.
- **Files:** `web/src/audio/input.ts`, `web/src/ui/Overlay.tsx`, `web/src/store.ts`.
- **Behaviour:** when `?debug` is present: hub → `ChannelSplitterNode(2)` → two `AnalyserNode`s (`fftSize 256`), RMS from `getFloatTimeDomainData` 10×/s → `store.patch({ debug: { l, r, settings } })` ⚠️ (10 Hz, not per frame, so the overlay re-render stays cheap). Overlay shows two bars and the `getSettings()` JSON when `debug` is set.
- **Tests:** `rms(Float32Array)`: sine of amplitude 1 → 0.707 ± 0.01.
- **Done-check:** gates green. **Manual:** test tone on input 1 moves only L, input 2 only R.
- **Depends on:** S1.6, S2.3.
- **Changed during implementation:**
  - `rms` lives in `audio/energy.ts`, and its test in `energy.test.ts`. `input.ts` creates the `AudioContext` at import, so Vitest can't load it.
  - **Store:** `UiSnapshot.debug` is `{ l, r, settings: MediaTrackSettings | null } | null`, with `l`/`r` as linear RMS. `settings` is read from the current device track on every 10 Hz tick, and is `null` while a file plays.
  - **Overlay:** a native `<meter>` per channel in dBFS (−60…0) plus the number, and the `getSettings()` JSON in a `<pre>`. The panel sits bottom-left and stays visible; it does not auto-hide with the bar. Its `.debug` styles are in `ui/overlay.css`, a 4th file.
  - **What the meters show:**
    - The splitter takes channels 1–2 of whatever the hub carries.
    - A mono source leaves R at −60 dBFS (discrete up-mix), so a device that opened as mono shows up as such. `channelCount` is in the JSON.
  - **Verified headlessly** (installed Chrome, built preview, fake media device):
    - The device JSON shows (`channelCount: 2`, `sampleRate: 44100`).
    - A stereo WAV with a tone on L only reads L −15 dBFS / R −60, and R only reads the reverse (a 0.25-peak sine is −15 dBFS RMS).
    - No console errors.

### S3.1 `[x]` Engine FBOs + mix/upscale pass + measured base size
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** scenes render into internal targets at `base × scale`; one final pass crossfades and upscales.
- **Files:** `web/src/gl/engine.ts`, `web/src/app.ts`.
- **Behaviour:** two FBOs (RGBA8, linear filtering) resized on `setOutput`; `render(shot, f)`: draw `shot.from` into FBO A; if `shot.to`, draw it into FBO B; final pass to `#stage` with `mix(texA, texB, shot.mix)` (when `to` is null, skip B and the mix). Base size = `stage.clientWidth·dpr` by `clientHeight·dpr`, measured on `resize` and `fullscreenchange` (S4.2 adds the per-mode factor and REC freeze). `f.width/height` = internal size. `app.ts` still passes a fixed shot until S3.6.
- **Tests:** none (GL).
- **Done-check:** gates green. **Manual:** tunnel looks identical to CP1 but through the FBO; resize the window → no stretching.
- **Depends on:** S2.3.
- **Changed during implementation:**
  - **The ½ factor stays.** `app.ts` keeps `BASE = 0.5`, the 60-adaptive default from design S4. Output = ½ × base, and scale = 1 until the governor exists. Dropping it now would make CP3 run at 60-full size until S4.2 put it back. S4.2 turns `BASE` into the per-mode factor.
  - **DPR change:** design S4 also asks for a re-measure on a DPR change. A `matchMedia('(resolution: …dppx)')` watcher re-arms itself on each change (the MDN pattern), so moving the window to another display re-measures with no resize event. `ResizeObserver` was not used: it fires after rAF, so every resize would paint one cleared frame.
  - `render()` sets `f.width/height` to the internal size before drawing scenes, so `app.ts` no longer writes them.
  - **`renderTarget(hdr)` in `engine.ts`:** a color-only target (linear filtering, clamped) with `fit(w, h)`. It is RGBA8, or RGBA16F when `hdr` is set and `EXT_color_buffer_float` is present. The two shot FBOs use it, and so do bloom and the scenes' offscreen passes (S3.2–S3.4).
  - When `to` is null, the final pass samples A twice with `mix = 0`, so it needs only one program. Scene B is not drawn.
  - **Verified** in the installed Chrome (headed, DPR 2, dev, 1200×800 viewport, `kicks128n.wav` dropped):
    - The canvas is 1200×800 and looks like the CP2 tunnel.
    - After a resize to 800×800 the canvas is 800×800 and the tunnel stays round.
    - 301 frames in 5 s: median 16.7 ms, 0 late frames. Tunnel GPU time is 0.61 ms (timer query).
    - No console or GL errors.

### S3.2 `[x]` `gl/bloom.ts` dual-filter blur
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** ~100-line glow pass reused by spectrum and particles.
- **Files:** `web/src/gl/bloom.ts`.
- **Behaviour:** `createBloom(gl, levels = 4)` → `{ apply(srcTex, w, h, strength): WebGLTexture }` using a downsample/upsample chain of half-size FBOs (dual-filter Kawase taps, written from the design's description; no copied code) and an additive combine. Threshold knob.
- **Tests:** none (GL).
- **Done-check:** gates green; used in S3.3.
- **Depends on:** S3.1.
- **Changed during implementation:**
  - **Targets:** the chain and the output are half-float via `renderTarget(true)` (RGBA8 when `EXT_color_buffer_float` is missing). Bright overlaps don't clip before the scene's tone map.
  - **Multi-scale glow:** the up pass adds each wider level onto the sharper one (additive blend), and the combine divides `strength` by `levels`.
  - **Knobs:** `THRESHOLD = 0.5` is a soft threshold (glow = c·(b − T)/b), and `SPREAD = 1` is the tap offset in source texels.
  - `apply` leaves its own target bound. Callers re-bind their own: the scenes save `FRAMEBUFFER_BINDING` at the start of `draw`.
  - **Verified through S3.3:** a glow is visible around the bar tips. Spectrum GPU time (bars + bloom + composite) is 1.1–1.9 ms at 1200×800 on the M4.

### S3.3 `[x]` `scenes/spectrum.ts`
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** styled spectrum: 32 bars in a ring or line with glow and a reflection, smooth motion.
- **Files:** `web/src/scenes/spectrum.ts`, `web/src/gl/engine.ts` (register the factory).
- **Behaviour:** instanced bars (one quad, `gl.drawArraysInstanced`, per-instance height from `energy.bands` uploaded to a 32×1 texture or uniform array), heights eased with per-bar attack/release (knobs), mirrored reflection with a vertical fade, `bloom.apply` on the bar pass, onset `lastOnset` brightens the ring; exports `params`.
- **Tests:** `easeBars(prev, target, up, down)` pure helper: rising uses `up`, falling uses `down` (2 assertions).
- **Done-check:** gates green. **Manual:** bars move smoothly, glow visible, no steppy bass bars (if steppy: add the design's 4096-point second analyser for this scene only ⚠️ later).
- **Depends on:** S3.2.
- **Changed during implementation:**
  - **Line, not ring:** 64 mirrored bars (bass in the middle) stand on a floor line at 30 % height. An onset brightens the bars and the floor line; there is no ring.
    - The reflection samples the bloomed bars mirrored at the floor line, with a depth fade and a faint ripple.
  - **No vertex buffers:** heights come from a uniform array, the quad corners from `gl_VertexID` and the bars from `gl_InstanceID`.
  - **Passes:** the bars render into the scene's own half-float target, then `bloom.apply`, then a composite (reflection, floor line, tone map `1 − exp(−c·exposure)`) into the engine's target.
    - The scene saves and restores the engine's `FRAMEBUFFER_BINDING`, because the `Scene` contract draws "into whatever is bound".
  - **Heights:**
    - Band dB with a +1 dB/band tilt, mapped through a −75…−15 dB window (knobs `DB_LO`, `DB_HI`, `TILT`).
    - `easeBars` with `ATTACK 0.6` / `RELEASE 0.1` per 60 Hz frame, rescaled by `dt`.
    - The `params` look knobs are `glow`, `reflect`, `hue` and `exposure`.
  - `easeBars` lives in `audio/energy.ts`, with its test in `energy.test.ts`. `spectrum.ts` imports the engine, which touches the DOM at import, so Vitest can't load it (same reason as `rms`).
  - **Registered in `app.ts`** (`scenes.spectrum = spectrum(gl)`), not in `engine.ts`: this is the S1.5 registry that avoids an import cycle. `app.ts`'s analyser buffer was renamed from `spectrum` to `magDb`, because the name clashed with the scene factory.
  - **Steppy bass (open, the plan's ⚠️ later):** the 1024-point analyser gives bands 0–7 only 4 distinct bins (0 = 1, 2…5, 6 = 7).
    - Those bars move in groups of 2–4, with a slight ramp from the tilt.
    - The fix, a 4096-point analyser for this scene only, is not done.
  - **Verified** in the installed Chrome (headed, DPR 2, dev, shot patched to `spectrum`, `kicks128n.wav`):
    - The bars rise on kicks and sink smoothly. The glow halos the tips, and the floor reflection fades with depth.
    - At 800×800 the layout holds.
    - 300 frames in 5 s: median 16.7 ms, 0 late. No console or GL errors.
    - The first ripple (0.002 × sin(400·y)) read as a jagged zig-zag. It is now 0.0015 × sin(150·y), fading in below the line, and `glow` went from 1.5 to 3.

### S3.4 `[x]` `scenes/particles.ts` (transform feedback)
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** thousands of GPU points that burst on onsets and breathe with bass.
- **Files:** `web/src/scenes/particles.ts`, `web/src/gl/engine.ts` (register).
- **Behaviour:** N = 65 536 points (knob), ping-pong position/velocity buffers via twgl's transform-feedback helpers; update vertex shader integrates velocity, adds a radial impulse `strength` when `lastOnset` age < 1 hop-frame (`age < dt`), damps, respawns at the centre; the draw pass renders `gl.POINTS` sized by `energy.att.bass`, additive blending, optional `bloom.apply`. Exports `params`.
- **Donor authorisation:** may adapt twgl's "transform feedback particles" example from the twgl repo (MIT). Keep a header line `// adapted from twgl.js examples (MIT, https://github.com/greggman/twgl.js)` in the file.
- **Tests:** none (GL).
- **Done-check:** gates green. **Manual:** bursts on kicks, size breathes with bass, steady 60 fps in 60A.
- **Depends on:** S3.2.
- **Changed during implementation:**
  - **Burst trigger: `f.onsets`** (onsets new this frame), not `lastOnset` age < `dt`.
    - For line-in the age stays negative for ≈ the output latency, so `age < dt` would hold on 2–3 frames in a row and fire repeated impulses.
    - A file's onsets now reach the frame once audible (T1, under S2.3). Both sources therefore burst exactly once per onset, on time.
  - **Burst size:** `(strength − 1.5) / 2.5 × params.burst`. The detector fires above its 1.5 threshold and caps at 4, so prominent hits burst fully and weak (hat) onsets barely push.
  - **Motion model:**
    - Each point has a rest radius in a disc, 0.06–0.72 scene units (uniform per area), which breathes with `att.bass` (×0.8…1.4).
    - A spring (`SPRING = 40`/s²) pulls each point back, and drag (`DRAG = 3`/s) damps it.
    - The swirl is a near-rigid rotation with per-point shear.
    - Points flung beyond radius 3 respawn at the centre. With the spring this is rare; it is a safety net.
    - Tuning history: with a 4/s² spring, onsets at ≈4.4/s (kick + hat) pumped the cloud apart, leaving most points off-screen. A 1/(0.25 + d) swirl flung the inner points out centrifugally, leaving an empty centre. Both are fixed by the model above.
    - Repeated onsets still hold the disc out by about their mean impulse / `SPRING`, so the centre is sparser than the rim while music plays.
  - **One pass** integrates and draws, as in the twgl example. Velocity is a second transform-feedback varying.
    - Point size scales with `att.bass` and the target height.
    - Colour follows radial speed: the calm swirl is blue, bursting points are orange/white.
    - Points blend additively into a half-float target, then go through `bloom.apply` (`params.glow`) and a tone-mapped composite.
  - **Knobs:** `params = { burst, swirl, size, glow }`. `N`, `SPRING`, `DRAG` and `EXPOSURE` are module constants.
  - **Attribution:** the header names `examples/transform-feedback-particles-va.html`, Gregg Tavares and MIT, and quotes the example's original license header. Registered in `app.ts`.
  - **Verified** in the installed Chrome (headed, DPR 2, dev, shot patched, `kicks128n.wav`):
    - Kicks throw a white-hot shell with a peach rim, which overshoots outward and contracts back to a blue disc between hits. No console or GL errors.
    - At 1200×800: 300 frames in 5 s, median 16.7 ms, 0 late. Particles GPU time is 3.5 ms.
    - **Crossfades** (shot patched to `mix: 0.5`) render both scenes blended: tunnel→particles and spectrum→particles, the latter with two blooms in one frame.
    - At the M4's fullscreen 60A size (1728×1117 internal), spectrum→particles holds 60 fps (0 late). GPU time is 4.1 + 5.6 ms median, p95 ≈ 12 ms.

### S3.5 `[x]` `scenes/glitch.ts`
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** pixels/glitch: pixel-art quantisation, block fragmentation and RGB split on hits.
- **Files:** `web/src/scenes/glitch.ts`, `web/src/gl/engine.ts` (register).
- **Behaviour:** fullscreen shader over a procedural base pattern (e.g. the tunnel's shader reused as `tunnel.fragmentBody` export ⚠️ or a simple plasma); pixel size driven by `energy.att.mid`; on onset age < 0.15 s: random block offsets (hash seeded by `floor(f.audioNow·20)`), chromatic split, scanline tear. Exports `params`.
- **Tests:** none.
- **Done-check:** gates green. **Manual:** hits glitch, calm otherwise.
- **Depends on:** S3.1.
- **Changed during implementation:**
  - **Base = an own plasma** inside `glitch.ts` (4 sines, bright ridges over black valleys, the cosine palette), not the tunnel's shader. The scene then looks unlike the tunnel, and `tunnel.ts` stays untouched.
  - **Pixel art:** a mosaic grid centred on the screen, so the cell size breathes from the centre rather than the corner. The cell is `params.pixel × (0.6 + 0.4·min(att.mid, 3))` px at a 1000 px tall target. Colours are posterised to `params.levels` per channel with a 4×4 ordered (Bayer) dither in cell units.
  - **Hit amount** = `(strength − 1.5) / 2.5 × (1 − age / 0.15)`, the particles' strength mapping, so weak onsets (hats) barely glitch. The age is clamped at 0 for line-in, as in the tunnel.
    - The hit scales every effect: torn rows (≤ 30 %), jumped blocks (≤ 40 %, a new grid size per pattern, channels swapped `gbr`), the RGB split (`params.split` px), scanline darkening and a +60 % flash.
    - The seed is `floor(audioNow·20) % 1000`. The wrap keeps the sin hash away from large inputs.
  - Bass zooms the plasma slightly (`/ (1 + 0.06·att.bass)`). `params = { pixel, levels, split, hue }`.
  - **Registered in `app.ts`** (`scenes.glitch = glitch(gl)`), not in `engine.ts`: the S1.5 registry.
  - **Verified** in the installed Chrome (headed, DPR 2, dev, shot patched to `glitch`, `kicks128n.wav`):
    - No console or GL errors. 300 frames in 5 s: median 16.7 ms, 0 late. Glitch GPU time is 1.04 ms median at 1200×800.
    - Out of 8 screenshots, 3 caught a hit (tears, jumped blocks, split) and 5 were calm. That matches a 150 ms window per 469 ms beat.
    - At 800×800 the plasma stays round.
    - The first look had a 12 % brightness floor in the valleys, which dithered into a busy olive checker. The valleys are now black.
  - **Fixed in the S3.7 run:** a stray block could jump while the scene was calm. `step(hash, 0.4·g)` is 1 at g = 0 whenever the sin hash returns exactly 0, and its fraction is quantised to about 1/256 in float32. The test is now strict (`hash < 0.4·g`), like the row tear. Calm frames after the fix show no stray blocks.

### S3.6 `[x]` `director.ts` + `playlist.ts`, pure, with tests
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the autopilot per S3: bar lines when confident, otherwise time.
- **Files:** `web/src/director.ts`, `web/src/director.test.ts`, `web/src/playlist.ts`.
- **Behaviour:** `createDirector(playlist, { barsPerShot = 16, barsTransition = 1, confidentTheta = 0.6 knob (Q4 accepted default ⚠️ value lives here), confidentBars = 2, fallbackSeconds = 30, fallbackTransition = 2 })`. `update(now, sync)`: "confident" = `sync.confidence ≥ θ` continuously for 2 bars (tracked by bar count). Confident: start a transition when `floor(sync.bar) − lastSwitchBar ≥ 16` and `fract(sync.bar) < small`; `mix = clamp((sync.bar − startBar) / barsTransition)`. Otherwise: start when `now − lastSwitch ≥ 30`; `mix = clamp((now − start) / 2)`. When `mix` reaches 1: `from = to`, `to = null`. `next()/prev()` start an immediate transition (1 bar if confident else 2 s), wrapping. `setHold(true)` blocks auto switches (manual still works). `now` is seconds.
- **Tests (synthetic `Sync` fixtures):** time mode (`ZERO_SYNC`): no switch before 30 s; transition starts at 30 s, `mix` 0.5 at 31 s, completes at 32 s, order sequential and wraps after 4; `setHold` stops switching but `next()` works; confident mode (fixture `bar` advancing 1/s, confidence 0.9): no switch during the first 2 bars of confidence, switch at bar 16 on the bar line, `mix` ramps over exactly 1 bar; confidence dropping to 0 mid-run falls back to the 30 s rule; `prev()` from index 0 wraps to 3.
- **Done-check:** gates green.
- **Depends on:** S1.3 (`Sync` type).
- **Changed during implementation:**
  - **Bar line = the first frame past it,** not `fract(sync.bar) < small`. A 30 fps frame can step over a "small" window. The fade starts already advanced by the part of the bar that has passed (`mix = bar − line`), so it ends on the next bar line at any frame rate. Eligibility that begins mid-bar waits for the next line.
  - **The fade advances per update:** by `Δbar / barsTransition` while confident, else by `Δt / fallbackTransition`. The deltas sum to the anchored formula, so it stays exact at any frame rate. Two edge cases this covers:
    - A backward bar jump never rewinds a fade (`Δbar` is clamped at 0).
    - A fade begun on bars still finishes on seconds if confidence drops. ZERO_SYNC's frozen `bar` would otherwise stall it.
    - So the rate follows the current mode, not the mode the fade began in.
  - **Time rule:** the fade starts at the exact due time `lastSwitch + 30`, so the period is exact. When overdue (after a lock), it starts from the previous frame, so unlocking fades on at once, from mix ≈ 0.
  - **Sync reset guard:** `switchedBar = min(switchedBar, floor(bar))`. A bar count that jumps back (a new track, a tracker reset) restarts the 16-bar count instead of stalling the autopilot until the old count is reached.
  - **`next()`/`prev()` take no time** (the contract), so a press is applied on the next `update`. A press mid-fade makes the incoming scene current at once, then fades to its neighbour: `←` mid-fade fades back. With 2 FBOs the rest of that fade is a cut.
  - `update` returns the same `Shot` object every frame (no allocation). `DirectorOpts` is exported.
  - **Tests** (`director.test.ts`, 15):
    - The plan's list: the time rule at 30/31/32 s and the order with the wrap, lock + `next()` + unlock, `prev()` wrap and keys mid-fade, bar 16 on the line with a 1-bar fade, confidence that starts mid-bar waiting 2 bars and then the next line, and confidence loss falling back to 30 s.
    - Added: a sync reset mid-fade, and **fps independence**. Every frame's shot must equal the analytic schedule at 24, 60 and 144 fps and with jittered 4–40 ms frames, for both the time rule and bar lines at 128 BPM.
    - **Mutation-checked:** each of these, broken one at a time, fails at least one test: the time anchor, the reset guard, the bar-line crossing, a per-frame mix step, the 2-bar confidence hold, and the mid-fade snap.

### S3.7 `[x]` Keys + overlay for scenes: `←/→/Space/F`, scene name, Lock, auto-hide polish
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** CP3 demo: autopilot runs, keys work, overlay shows scene and lock.
- **Files:** `web/src/app.ts`, `web/src/ui/Overlay.tsx`, `web/src/store.ts`.
- **Behaviour:** `app.ts` creates the director with `playlist`, calls `director.update(performance.now()/1000, f.sync)` each frame and passes the shot to `engine.render`; keydown: `ArrowLeft/ArrowRight` → prev/next, `Space` → toggle hold, `F` → fullscreen (ignore keys when the event target is an input/select). `store.patch({ sceneName, hold })` only when they change (not per frame). Overlay shows scene name and a "Lock" badge.
- **Tests:** none new.
- **Done-check:** gates green. **Manual:** CP3 demo.
- **Depends on:** S3.3, S3.4, S3.5, S3.6.
- **Changed during implementation:**
  - **Files:** `store.ts` is unchanged, because `UiSnapshot` already has `sceneName` and `hold`. `ui/overlay.css` gets the Lock badge and the cursor rule (a 4th file, as in S2.4).
  - **Clock:** `director.update(f.time, f.sync)`. `f.time` is the rAF timestamp / 1000, the same `performance.now()` clock the step names, as one value per frame.
  - **Scene name:** the overlay shows the incoming scene as soon as a fade starts, i.e. the scene `→` just asked for.
    - Each frame compares the name with the snapshot (no allocation) and patches only on a change.
    - The startup `store.patch({ sceneName })` is gone; the first frame sets it.
    - `Space` patches `hold` on the key press.
  - **Keys** use `e.code`: physical keys, so they work in the Russian layout too. Repeats and modifier chords stay ignored.
  - **Auto-hide polish:** the cursor hides with the bar through CSS alone, `:root:has(.bar.hidden) { cursor: none }`.
    - The Lock badge sits in the bar and hides with it: the screen is the show output.
    - **Not done:** keys don't wake the overlay. After `Space` with the bar hidden, "Lock" shows on the next mouse move.
  - **Verified** in the installed Chrome (headed, DPR 2, dev, 1200×800, `kicks128n.wav`, scratchpad `cp3-demo.mjs`):
    - **Patching:** the script route-patches only the served `app.ts`. It adds a per-frame shot log and a GPU timer around `render()`, and for the cycle runs a test-only `fallbackSeconds: 4`. The product default stays 30 s.
    - **Autopilot (4 s override):** tunnel→spectrum 4.0 s, →particles 8.0, →glitch 12.0, →tunnel 16.0, →spectrum 20.0, wrapping. Every fade took 2.00 ± 0.02 s and started at mix ≤ 0.009.
    - **Default, no override:** the first switch is at 30.01 s, tunnel→spectrum, a 2.00 s fade, 0 late frames.
    - **Keys:**
      - `→`/`←` fade on the next frame, starting at mix 0, and the overlay names the target.
      - `Space` shows LOCK and holds glitch for 8.5 s (2× the interval) with 0 fades; `←`/`→` still work while locked.
      - `Space` again removes the badge, and the overdue autopilot fades on at once.
      - `F` sets and clears `document.fullscreenElement`.
      - Idle for 2.5 s hides the bar and sets the cursor to `none`; a mouse move brings both back.
    - **Timing:**
      - Glitch held with kicks: 511 frames, 0 late, GPU 1.39 ms/frame median (max 1.65).
      - Crossfades: 0 late in 3 of 4 runs (≈550 crossfade frames each). One run had a single 33 ms frame, which did not recur in the run that logs late frames.
      - GPU per fade, median/p95/max ms: tunnel→spectrum 2.5/2.8/7.1, spectrum→particles 5.8/6.7/9.9, particles→glitch 4.6/5.0/5.1, glitch→tunnel 2.0/2.2/2.7. Each max is a single outlier; their cause was not traced.
    - **Errors:** none on the console, no page errors, and `gl.getError()` stayed 0 every frame.

### S4.1 `[x]` `quality.ts` governor, pure, with tests
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** frame-time governor per S4 with the §7.5 drop counter.
- **Files:** `web/src/quality.ts`, `web/src/quality.test.ts`.
- **Behaviour:** `createGovernor({ min = 0.6, max = 1, down = 0.85, up = 1.1, lateFactor = 1.5, windowSeconds = 2, lateN = 3, jsBudgetMs = 10, probeSeconds = 10 })`. `frame(now, jsMs)`: delta since last; `refreshMs` = running median of the last 120 deltas (never hard-coded 16.67); late = `delta > lateFactor · refreshMs`; `drops` counts late frames (cumulative, for the badge); step down when a 2 s window has > `lateN` late frames and median `jsMs` < 10 (GPU-bound) → `scale = max(min, scale·0.85)`, window reset; step up after `probeSeconds` without late frames → `scale = min(max, scale·1.1)`; a late frame within 2 s after a step-up marks the probe failed → the next `probeSeconds` doubles (cap 160 s). `reset()` on mode change. Also export `QualityMode`, `nextMode(m)` (cycle), and `outputFor(mode, baseW, baseH)` → `{ w, h, everyOtherFrame }` (60A: ½ base rounded to even; 60F and 30: base; 30 → `everyOtherFrame: true`).
- **Tests (synthetic delta sequences):** 60 Hz clean 10 s → scale stays 1, drops 0; 33 ms deltas (Energy Saver) → `refreshMs ≈ 33`, drops 0; 2 s with 5 late frames and jsMs 4 → scale 0.85, then floor at 0.6 after repeated windows; late frames with jsMs 14 (CPU-bound) → no step down; 10 s clean after a step-down → ×1.1 capped at 1; failed probe → next probe needs 20 s; `nextMode` cycles 60A→60F→30→60A; `outputFor('60-adaptive', 2880, 1864)` → 1440×932.
- **Done-check:** gates green.
- **Depends on:** S1.1.
- **Changed during implementation:**
  - **`Governor` gains `reset()`.** The step calls `reset()` on a mode change, but the frozen CP4 contract lists only `frame`, `scale`, `drops` and `refreshMs`. The addition is additive.
    - `reset()` also clears the delta ring. Otherwise, after `Q` to 30, the old 16.7 ms median would mark every 33 ms frame as late for about a second.
  - **Units:** `now` is the rAF timestamp in ms, like `jsMs` and `refreshMs`.
  - **The window slides.** A step-down fires on the (`lateN`+1)th late frame within the last 2 s, not at the end of a fixed 2 s block. A run of late frames that straddles a block boundary still counts. The window resets after each step.
  - **Median JS time** is taken over the same last 120 frames (≈ the 2 s window at 60 Hz), and only when a step-down is due.
  - **Probes:**
    - A probe that holds keeps the current interval; only `reset()` restores 10 s. The plan leaves success open, and keeping the interval avoids a 10 s ↔ 20 s step-up/step-down cycle under steady load.
    - A failed probe is not reverted at once. The step-down rule handles sustained overload.
  - **`outputFor` rounds 60F and 30 to even too**, not only 60A. S1.2 showed the H.264 recorder crops odd sizes (877 → 876).
  - **Tests** (`quality.test.ts`, 8): the plan's list. Added: an even size for odd bases, `everyOtherFrame` for 30, and `reset()` followed by 33 ms frames giving 0 drops.
    - **Mutation-checked:** each of these, broken one at a time, fails at least one test: the measured refresh, the GPU-bound check, the 0.6 floor, the window reset, the probe backoff, backoff on success, the ×1.1 cap, `lateN` off by one, the even rounding, and `reset()` keeping the ring.

### S4.2 `[x]` Quality modes in the engine + `Q` key + badge + localStorage
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the three modes are selectable; 60A adapts; the overlay shows `60A · 0.80× · 3 drops`.
- **Files:** `web/src/app.ts`, `web/src/gl/engine.ts`, `web/src/ui/Overlay.tsx`.
- **Behaviour:** `app.ts`: mode from `localStorage['vjw.quality']` (default `60-adaptive`); per frame `jsMs = performance.now() − frameStart` after `render`, then `governor.frame(now, jsMs)`; `engine.setOutput(w, h, governor.scale)` when any of them changes (internal FBOs at `w·scale`); mode `30` renders every other rAF (skip frames; the governor is fed only on rendered frames). `Q` → `nextMode`, persist, `governor.reset()`. Store patch of `{ quality, scale, drops }` at most 4×/s. Overlay badge formats `60A|60F|30 · scale× · N drops`. `setOutput` is a no-op while `recording` (frozen size, S5) and `Q` is ignored then.
- **Tests:** `badge(snapshot)` formatter: `'60A · 0.80× · 3 drops'` (1 assertion).
- **Done-check:** gates green. **Manual:** `Q` cycles; in 60A, open `?debug` and watch scale drop under load (e.g. a second heavy tab) and recover.
- **Depends on:** S3.7, S4.1.
- **Changed during implementation:**
  - **Files:**
    - `badge()` lives in `quality.ts`, and its test in `quality.test.ts`. `Overlay.tsx` imports the audio singletons, so Vitest can't load it (the `easeBars` reason). One drop reads "1 drop".
    - `engine.ts` is unchanged: `setOutput(w, h, scale)` already sizes the FBOs at `w·scale`.
    - `ui/overlay.css` gets the badge style (tabular digits).
  - **The frame applies the output.** `measure()` (resize, fullscreen, DPR) now only computes `outputFor(mode, base)`.
    - Each rendered frame, before `render`, compares that with the canvas size and the applied scale, and calls `setOutput` on a difference unless `store.recording` is set.
    - So the REC freeze lives in one place in `app.ts`, the only caller of `setOutput`. A resize, fullscreen or DPR change during REC is deferred to the first frame after the stop.
  - **Scale per mode:** the governor runs in every mode, so the badge counts drops everywhere, but its scale applies only in 60A. 60F and 30 read `1.00×`. The badge shows the applied scale.
  - **Saved mode:** an unknown `vjw.quality` value falls back to 60A.
  - **Verified** in the installed Chrome (headed, DPR 2, dev, `kicks128n.wav`, scratchpad `cp4-quality.mjs`; it route-patches a frame log, a GPU timer and `window.__gov`):
    - **Modes (1200×800):**
      - `Q` gives 60A 1200×800 → 60F 2400×1600 → 30 2400×1600. The badge and `localStorage` follow.
      - A reload keeps 30, and `Q` returns to 60A.
      - 30 renders 30.0 fps (Δ median 33.3 ms).
      - Every mode boots with "1 drop": the page-load hitch.
    - **Drops per mode, 30 s each with a crossfade every 4 s (test-only `fallbackSeconds: 4`):**

      | Base | 60A | 60F | 30 |
      |---|---|---|---|
      | 2880×1864 (this M4 Air's native "looks like 1440×932") | 0 drops; crossfade GPU p95 6.2 ms | 1 drop; GPU p95 17.7 ms | 0 drops |
      | 3456×2234 (looks like 1728×1117) | 0 drops; crossfade GPU p95 9.3 ms | 1 drop; GPU median 13.3, p95 20 ms | 0 drops |

      - 60F at 3456×2234 run alone for 90 s: 0 late frames over 2751 crossfade frames. GPU p95 is 21 ms, yet the cadence holds; Apple's GPU pipelines frames.
      - 60F's drops come right after the `Q` switch: 2 in total, either during the 2 s warm-up or at the first spectrum→particles fade.
        - The likely cause is the 4× reallocation: the canvas and the FBOs, then particles' own targets on their first draw at the new size. This was not traced.
        - It holds crossfades after that.
    - **Governor under a synthetic GPU load** (a per-pixel loop drawn into FBO A at the internal size, ramped until frames went late, at 1440×932):
      - At 0.3 s, 4 late frames step it to 0.85.
      - At +8.6 s the probe to 0.935 fails, so it steps to 0.79 and the probe interval goes to 20 s.
      - It holds 0.79 with 0 late frames. After the load is removed, it probes 0.87 → 0.96 → 1.00, 20 s apart.
      - 8 drops for the overload in total.
    - No console, page or GL errors.

### S4.3 `[x]` `recorder.ts` + `R` key + REC indicator
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** REC produces a playable MP4 (or WebM) with picture and sound.
- **Files:** `web/src/recorder.ts`, `web/src/app.ts`, `web/src/ui/Overlay.tsx`.
- **Behaviour:** `pickMimeType()` returns the first `isTypeSupported` hit from the S5 list using the exact `avc1` string that S1.2 reported as supported ⚠️ (`video/mp4;codecs=avc1.<level>,mp4a.40.2` → `video/webm;codecs=vp9,opus` → `vp8,opus` → `video/webm`). `startRecording(canvas, audioTrack, 12_000_000)`: `new MediaStream([...canvas.captureStream().getVideoTracks(), audioTrack])`, `new MediaRecorder(stream, { mimeType, videoBitsPerSecond })`, `start()` with **no timeslice**; returns `stop()` which resolves on `onstop`, builds one Blob, triggers `<a download="veejay-<ISO date>.<mp4|webm>">`, revokes the URL. `app.ts`: `R` toggles; sets `store.recording`; while recording `setOutput` is frozen and `Q` ignored (S4.2). Audio track = `recDest.stream.getAudioTracks()[0]`. Memory ceiling (R2): note in a `// ponytail:` comment that long takes are held in memory; add `timeslice` chunking only if R2 shows memory trouble (Chrome ≥140 drops WebM duration with timeslice, render §5).
- **Conditional (S1.2):** no MP4 → list falls through; full-size REC can't hold 60 → document 60A as the recording mode in the overlay tooltip.
- **Tests:** `pickMimeType` with an injected `isTypeSupported` stub: returns the first accepted entry, `undefined` when none.
- **Done-check:** gates green. **Manual:** CP4 demo; the file plays in QuickTime with sound; the 30-min 60A run.
- **Depends on:** S4.2.
- **Changed during implementation:**
  - **Files:** `recorder.test.ts` holds the `pickMimeType` test, and `ui/overlay.css` styles a red "● REC" in the bar, which hides with it (the Lock precedent).
  - **`pickMimeType(isTypeSupported?)`** takes an optional check, for the Vitest stub. The addition is additive to the contract.
  - **MP4 string:** the probe's `avc1.640028` is kept. Chrome sets the real level itself (4.0 at 1440×932, 5.1 at 2880×1864 and 3456×2234), so no per-size level is needed.
  - **Saving a take:**
    - `onstop` is set at start, so a recorder that stops itself after an error still downloads the take. `stop()` on an already-stopped recorder resolves at once.
    - Each take stops its canvas capture track. The shared `recDest` audio track is never stopped.
  - **File name:** `veejay-YYYY-MM-DDTHH-MM-SS.mp4` in local time, with dashes instead of colons. ISO UTC would read 3 h off here. The URL is revoked 40 s after the click, FileSaver.js's delay.
  - **`R` while a take is finishing:**
    - A press between the stop and the hand-over is ignored.
    - `recording`, and with it the size freeze, clears only after the file is handed to the download.
  - **Bitrate:** `VIDEO_BPS` stays 12 Mbps (plan), but Chrome's H.264 delivers ≈2× the request at 60 fps and 1× at 30.
    - At 60A: 12 → 23.7 Mbps and 6 → 11.8 Mbps. In mode 30: 12 → 12.07 Mbps. At 60F: 24–25.7 Mbps.
    - `captureStream(60)` did not change it (23.4 Mbps).
    - So the knob works, but at a factor of 2 at 60 fps.
  - **Memory (no timeslice, R2):** the renderer holds the take until the stop.
    - Physical footprint grew 241 → 487 MB over 100 s at 60A (≈2.5 MB/s, i.e. the bitrate), so ≈180 MB/min and ≈5.4 GB per 30 min.
    - At the stop the blob moves to the browser process (renderer −286 MB, browser +347 MB, for a 362 MB file).
    - **Tested, not applied:** a 1 s timeslice, test-only route patch, 90 s take.
      - The renderer stayed flat (240 → 190 MB) while the chunks went to the browser's blob storage.
      - The MP4 stayed valid: 90.23 s, 5412 frames, 0 decoder errors, AVFoundation decodes every frame. It has no trailing `mfra` box.
  - **Conditional (S1.2) does not fire.** Full-size REC holds 60 fps, so there is no tooltip.
    - 60F REC at 2880×1864: 1 late frame in 30.9 s.
    - 60F REC at 3456×2234: 1, 0 and 0 late frames in three runs of 30, 15 and 30 s.
  - **Verified** in the installed Chrome (headed, DPR 2, dev, `kicks128n.wav`, a crossfade every 4 s, scratchpad `cp4-rec.mjs`; Playwright saves the download):
    - **Stress, 60A, 20 s:**
      - The canvas stayed 1440×932 for the whole take. `Q` mid-REC was ignored (the badge stayed 60A).
      - A viewport resize to 1200×800 and F ×2 changed only the CSS size.
      - The download arrived 0.2 s after the stop. The deferred resize to 1200×800 applied on the next frame.
      - 0 late frames during REC.
    - **Files:**
      - Every take is H.264 High + AAC LC 44.1 kHz stereo (mean −19 dB, max −3 dB: picture and sound), at ≈60 fps (e.g. 7209 frames in 120.18 s).
      - **Decoder errors:** `ffmpeg -v error -i f -f null -` shows 0 h264/aac errors on every take. Contrast: the probe's resize-corrupted file shows 7 `h264 error while decoding MB` lines.
      - **DTS lines:** the null muxer prints 0–184 "non monotonically increasing dts" lines per take. The source DTS are strictly increasing; these lines come from re-timing the variable-frame-rate capture (deltas down to 14.3 ms) onto a 59.94 fps grid. `-enc_time_base demux` makes every take print nothing.
      - **QuickTime proxy:** macOS AVFoundation (`avconvert`) transcodes a take with all 1217 frames and the audio, with error 0.
    - **Long takes:** 2 min = 362 MB and 3 min = 541 MB, with 0 and 1 governor drops.
    - **30 mode:** 623 frames in 20.8 s (30.0 fps), clean.
    - **Regression:** a CP3 key and autopilot run (`cp3-demo.mjs`) passes unchanged, with 0 late frames.
    - No console, page or GL errors.
- **Changed during implementation:** (lead/user, 2026-10-28) **MP4 records with a 1 s timeslice** (user: yes).
  - `recorder.ts`: `timeslice(mimeType)` gives 1000 for MP4 and none for WebM (Chrome ≥140 writes a WebM duration only for an unchunked take); `rec.start(timeslice(rec.mimeType))`. `recorder.test.ts` covers it (MP4 → 1000, WebM → none, mutation-checked).
  - `VIDEO_BPS` stays 12 Mbps on purpose: the user wants ~24 Mbps real, and Chrome's H.264 encodes ≈2× the request at 60 fps (one-line comment in `app.ts`).
  - **Verified** (2 min at 60A, `cp4-rec.mjs`):
    - The renderer footprint stays at 240 → 190–210 MB for the whole take (unchunked: 241 → 487 MB in 100 s). The chunks build up in the browser process instead (79 → 428 MB).
    - The file: 362 MB, 120.28 s, H.264 High 23.8 Mbps + AAC LC, 7215 frames. `ffmpeg -i f -enc_time_base demux -f null -` prints nothing. AVFoundation (`avconvert`) exits 0 with all 7215 frames and the audio.
    - 0 late frames, 0 governor drops, no console errors.
  - Chrome cuts the MP4 into ~1.68 s fragments (a keyframe every 100 frames) with or without the timeslice; the timeslice only sets how often `dataavailable` fires.
- **Changed during implementation:** (lead/user, 2026-10-28) **The REC dot stays visible while the bar hides.**
  - CSS only (`ui/overlay.css`; `Overlay.tsx` unchanged). The bar now fades item by item instead of as a group, and its gradient moved to `.bar::before`. `.rec` is exempt: when the bar hides, the word goes transparent and only the small red ● stays, where it was.
  - **Verified:** with the bar hidden, `.rec` has opacity 1, transparent text and a `rgb(255, 77, 77)` dot; every other item and the gradient are at 0. The shown bar looks as before. The `cp3-demo.mjs` regression passes (auto-hide, cursor, F, fades, 0 late frames).
- **Changed during implementation:** (lead/user, 2026-10-28) **Letterbox during REC:** `#stage { object-fit: contain }` in `index.html`. Outside REC the canvas matches its box, so it is a no-op.
  - **Verified:** viewport 1440×932 → 1440×700 mid-REC (canvas frozen at 1440×932) gives black 179 px bars left and right and an undistorted picture; F does the same. After the stop the deferred resize fills the frame again.
- **Changed during implementation:** (lead/user, 2026-10-28) **A file's REC audio waits like its onsets (T1).**
  - `audio/input.ts`: hub → `DelayNode` → `recDest`. `setSource` sets `delayTime` to `baseLatency + outputLatency` for a file (5.8 + 40.0 = 45.8 ms on the M4) and to 0 for line-in.
  - A `ponytail:` note: the latency is read once per source, and `outputLatency` reads 0 until the output has run ~0.3 s.
  - **Measured** (`?flash`, `kicks128n.wav`, 10 s takes; line-in = Chrome's fake capture fed the same WAV; scratchpad `av-rec.mjs`, `av-offset.mjs`, `av-avf.swift`). Offset = white frame − audio onset, median per take, ms (> 0: the picture trails):

    | take | ffmpeg (whole take) | AVFoundation (first second) |
    |---|---|---|
    | file, before | −1.3, −5.0 | +42.3, +42.1 |
    | file, after | −45.6, −43.5 | +8.2, +7.4 |
    | line-in, before | −48.6, −53.4, −45.8 | −2.1, −5.5, −2.3 |
    | line-in, after | −52.4, −48.6, −58.2 | −4.0, −2.6, −13.4 |

  - **Why the two readers differ by ≈48 ms:** Chrome's MP4 carries the AAC encoder priming (~2048 samples) with no edit list.
    - AVFoundation trims it, so the decoded audio starts on the signal.
    - ffmpeg plays it as ~46 ms of leading silence, so in ffmpeg-based players every take's audio is ~48 ms late.
    - Before the fix, file and line-in disagreed by ~45 ms in both readers. After it they agree within a frame: both ≈ in sync in AVFoundation, and both show the picture ~45–55 ms early in ffmpeg (the container, not the app).
  - A `DelayNode` at 0 passes samples through exactly (offline impulse test: 1000 → 1000; at 45.8 ms, 1000 → 3020). So line-in is unchanged; its run-to-run spread is ±5 ms.
  - **Found, not fixed (reported to the lead):**
    - At each fragment boundary, Chrome writes the last frame's duration as 999 ticks (1/30 s) instead of the real gap (~500).
    - AVFoundation follows sample durations, not `tfdt`, so it runs the video ~15 ms later per fragment: +1.05 s by the end of the 2 min take. ffmpeg is correct.
    - `captureStream(60)` does not change it.
- **Changed during implementation:** (user, 2026-10-28) **REC quick fix: 60 s keyframes for MP4, auto-split every 20 min.**
  - `recorder.ts`:
    - `recorderOptions(mimeType, bps)` adds `videoKeyFrameIntervalDuration: 60_000` for MP4 only (name and unit per `research_recording_mp4.md` §2). TS 6.0's DOM types lack the option, so the return type widens for that field. A Chrome without it ignores the member: no version sniffing.
    - `SPLIT_MS = 20 * 60_000` (one constant). Every `SPLIT_MS`, `startRecording` starts the next take (a fresh `captureStream` track and a new MediaRecorder on the shared audio track), and only then stops the current one, which downloads as before. WebM splits too (no branch; harmless).
    - Its `stop()` resolves once every part is handed over. So `app.ts` and `Overlay.tsx` are unchanged: `recording`, the size freeze and the REC dot span all parts.
    - **File name:** `fileName()` → `veejay-<stamp>[-partN].<mp4|webm>`. The stamp is now the recording's **start** (local time), shared by its parts; before, it was the stop time. A single take keeps the plain name. A split recording numbers every part, `-part1` included, so the parts sort together.
  - **Tests:** `recorderOptions` (MP4 → 60 000; WebM and no type → no option) and `fileName` (plain vs numbered, mp4/webm). Both are mutation-checked. The split itself is a `setInterval`, covered by the smoke rather than a unit test. 45 tests.
  - **Verified** (the user cut this to one smoke): scratchpad `rec-split.mjs`, a TEST-ONLY route patch with `SPLIT_MS` → 30 s, a 57 s take at 60A, `kicks128n.wav`.
    - Two downloads: `veejay-2026-10-28T13-05-27-part1.mp4` at +30.18 s, then `-part2.mp4` 0.02 s after the stop. The REC dot stayed on and the canvas stayed 1440×932 across the split.
    - part1 is 29.98 s / 88.9 MB, part2 27.24 s / 80.2 MB. Both are H.264 High 1440×932 at ≈23.6 Mbps + AAC LC 44.1 kHz stereo. ffprobe is OK, and `ffmpeg -v error -i f -enc_time_base demux -f null -` prints nothing on either.
    - Each part has exactly 1 keyframe and 1 `moof`, where the 100-frame default gives ~18 per 30 s. So Chrome 156 honours the option.
    - The parts add up to 57.21 s against 57.29 s of wall-clock REC. This is not a gap measurement.
    - There were 2 late frames around the split (badge 1 → 3 drops between +25 and +35 s) and none otherwise. No console errors.
  - **Not measured (cut by the user):** fragment count and AVFoundation drift on a 3-min take, renderer memory, the inter-take gap, `avconvert`.
    - Expected (§2, derived): ≈20 fragments per 20-min part, ≈0.5 s drift per 30 min.
    - The renderer now holds up to one 60 s fragment (≈180 MB at ~3 MB/s) before it leaves as a chunk. Whether that flush costs a late frame mid-part is unmeasured.
    - 20 min at the 60F rate (≈25.7 Mbps) is ≈3.9 GB, under the 4 GiB crash point.

### S5.1 `[x]` `tempo.ts`: ACF tempo on the ODF + least-squares refine, with tests
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** own (c) source, coarse ACF + fine fit, no library.
- **Files:** `web/src/audio/tempo.ts`, `web/src/audio/tempo.test.ts`.
- **Behaviour:** `createTempoSource({ windowSeconds = 6, minBpm = 90, maxBpm = 180, updateEveryHops = 32 })`. `pushOdf(values, t0, hop)` appends to a ring of `windowSeconds/hop` samples (ODF mean-removed, half-wave). Every 32 hops: ACF over lags for 90–180 BPM, weighted by a mild log-Gaussian prior centred at 128 BPM (knob), peak lag refined by parabolic interpolation → `bpmCoarse`. Octave folding into [90, 180). **Fine:** the beat phase from the ACF-period comb over the ODF (max of Σ odf at phase φ + k·period); then a least-squares fit of `push`ed onset times within ±⅛ beat of the predicted grid over the last ≤21 beats → `period`, `anchor` (design S2: ≲0.05 BPM). `confidence` = ACF peak prominence (peak / mean of ACF) mapped to 0..1 × fraction of strong onsets within ±⅛ beat over the last 16 beats (design S2 ⚠️). `read()` returns the latest `{ bpm: 60/period, anchor, confidence }` or `null` before 2 windows.
- **Tests (synthetic ODF + onset trains at 48 kHz / hop 256):** 128.0 BPM clicks → bpm within ±0.2 after 8 s; 174 BPM → 174 (not 87); 85 BPM → 170 (folded); 3 ms jitter + 10% dropped + 10% spurious onsets → within ±0.5 BPM and anchor within 10 ms of a true beat; silence → `confidence` < 0.2; `read()` is `null` before data.
- **Done-check:** gates green.
- **Depends on:** S2.1.
- **Changed during implementation:**
  - **The (c) ODF is now the bass band** (`onset.worklet.ts`, 3 lines; the message type is unchanged).
    - Why: the real detector, run on `kicks128n.wav`, scores the off-beat hats as high as the kicks. Hats read 410–912 in the full-band log-flux ODF and kicks 400–840, and both fire at strength 4.0. The source locked to the off-beat (phase 0.50).
    - What: the `'odf'` batch now carries the flux of a second `createDetector` over the lowest 4 FFT bins (`BASS_BINS` knob, 0–330 Hz at 48 kHz). The (b) onsets are unchanged. The same track now locks at phase 0.00.
  - **The confidence fraction is counted per beat.** It is the share of the last 16 grid beats that have an onset within ±⅛ beat. The plan counted the share of strong onsets on the grid instead.
    - On real tracks, off-beat hats and claps fire at 4.0 like kicks, so the per-onset share read about 0.35 on a steady house test track. That is below the director's θ (0.6). Per beat it reads 0.88–1.0.
  - **No strength filter: every detector onset counts.**
    - The plan's `strength ≥ 1` knob already passes all of them, because they fire above 1.5.
    - A 2.5 cut dropped real weak kicks (strength 1.63 and 2.06). Off-beat onsets fall outside ±⅛ anyway.
  - **Prominence is mapped as `(peak/mean − 2) / (7 − 2)`, clamped.** The knobs `PROM_NONE` and `PROM_FULL` come from the worklet ODF on test tracks:
    - steady 4/4: 6.6–9.4;
    - a non-beatmatched overlap: 2.5–4.7;
    - a clap-only break: about 2.9;
    - arrhythmic hits: 1.4–3.0.
  - **The ACF searches an octave past the fold range each way (45–360 BPM),** so 85 BPM still peaks and folds to 170.
    - The prior is load-bearing. Without it, the 3P peaks fold to ⅔ tempo: 140 → 93.3 and 174 → 116.
  - **"`null` before 2 windows" is read as one full window (6 s).** Two windows (12 s) would contradict the step's own "after 8 s" test.
  - **The fit is one pass.** A second re-gating pass changed no case.
  - **The reading is folded again after the fit,** which can land a hair past the edge (90 → 180.0000000000001).
  - **Comb and fit sizes:** the comb sums the last 8 beats (`COMB_BEATS`). The fit needs at least 4 onsets (`MIN_FIT`). With fewer, the reading keeps the ACF period and the comb phase.
  - **Tests (13):**
    - 120/128/140/174 within ±0.05 BPM after 8 s, with the anchor on a click, confident and ≤ 1;
    - octaves: 174 → 174, 85 → 170, 200 → 100, 90 → 90;
    - the ACF alone within ±0.5 BPM (140; the integer lag gives 140.6);
    - jitter + drop + spurious;
    - strong off-beat onsets;
    - an off-beat onset never stands in for a missing kick;
    - arrhythmic onsets below 0.2;
    - a non-beatmatched 128 + 133 mix below θ;
    - silence and a noise ODF;
    - `null` before data and until a full window.
  - **The fixture copies the measured bass-band shape:** an exponential floor with mean 1, and a kick at 13 + 5 over two hops.
  - **Mutation-checked.** Each of these, broken alone, fails at least one test: the fit, the fold, the comb phase, the per-beat fraction, the prominence factor, the fit gate, the prior, the parabolic step, the full-window gate, the 16-beat span and the hit gate.
  - **Real streams.** The worklet chunk ran in Node over synthesized house tracks (kick, clap on 2 and 4, open hat, 16th hats, off-beat bass), in the scratchpad `cp5/`:
    - steady 128 → 128.0 at confidence 1.00;
    - a cut from 128 to 140, re-read as 140.3 after 5 s at 0.88;
    - a non-beatmatched 133 overlap at 0.17–0.65, back to 1.00 afterwards;
    - a clap-only break at 0.24–0.42;
    - arrhythmic hits at 0.00–0.05.

### S5.2 `[x]` `sync.ts` controller: PLL, hold, manual keys, hysteresis, with tests
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the always-ours controller behind the S8 `Sync` contract; replaces the S1.3 stub.
- **Files:** `web/src/audio/sync.ts`, `web/src/audio/sync.test.ts`.
- **Behaviour:** `createSync(source, { lead = 0 s, phaseGain = 0.25, periodGain = 0.02, holdBars = 16, holdDecayPerBar = 0.05, relockBeats = 8, confidenceSmoothBeats = 1, nudgeMs = 10 })`. State: `period`, `anchor`, `downbeatOffset` (beats), `confidence`. `feed(o)`: if `|o.t − nearestPredictedBeat| ≤ ⅛ period` (strong onsets only, `strength ≥ 1` knob): `anchor += err · phaseGain` (the beatfinder-style EMA phase nudge, research §4, reference only) **and** `period += err · periodGain / beatsSinceLastCorrection` (second-order term so 1 BPM of error does not drift 1 beat/min, spec §7.2); else count it for a competing grid (`err` folded to the half-beat): after `relockBeats` consecutive beats where the competitor explains strong onsets better, re-anchor to it (hysteresis, design S2). Source readings: adopt `source.read()` when `confidence` is 0 (fresh lock) or the reading differs from the running grid by < 3% (gentle merge); larger differences go through the same hysteresis counter. **Hold:** no strong onsets for > 1 bar → keep the grid, decay `confidence` by `holdDecayPerBar` per bar, up to `holdBars`, then `bpm = 0`. `tap(t)`: median of the last ≤4 tap intervals (reset after 2 s) → `period`, `anchor = t`, `confidence = 1`. `double()/halve()`: scale `period`, keep `anchor`. `nudge(ms)`: `anchor += ms/1000`. `downbeat(t)`: `downbeatOffset = floor(beatAt(t)) mod 4`; bar "1" heuristic when `B` was never pressed: the beat position (mod 4) whose strong onsets have the highest bass-weighted mean strength over the last 8 bars ⚠️ (design: best-effort). `at(audioNow)`: `beat = (audioNow + lead − anchor) / period`, `bar = (beat − downbeatOffset) / 4`, `confidence` smoothed with a 1-beat time constant; `bpm = 0` and `ZERO_SYNC` shape when no period.
- **Tests (synthetic, 48 kHz timing):** `at()` phase math (fract 0 at anchor, 0.5 half a period later); `tap` ×4 at 500 ms → 120 BPM, anchor = last tap; `double/halve/nudge/downbeat` arithmetic; PLL: onsets 20 ms late for 8 beats → anchor moves ≥ 15 ms toward them, no period change beyond 0.5%; period error of 1 BPM with onsets on the true grid → corrected within 16 beats to ±0.1 BPM; 8-bar break at 128 BPM → grid continues, phase error on resume ≤ ⅛ beat, confidence decayed but > 0, no `bpm = 0` before 16 bars; competing grid offset by half a beat for 4 beats → no re-anchor; for 8 consecutive beats → re-anchor; confidence smoothing: a step 1→0 reaches < 0.4 only after ~1 beat.
- **Done-check:** gates green.
- **Depends on:** S5.1.
- **Changed during implementation:**
  - **The competing grid comes from confident source readings, not from off-grid onsets.**
    - Why: on real tracks, off-beat hats and claps fire at 4.0, as strong as kicks (S5.1). An onset competitor at the half-beat would explain as many onsets as the kicks. In any kick-less break it would win 8 beats and re-anchor onto the hats.
    - A reading disagrees when its tempo is more than 3% off at any octave, or its phase more than ⅛ beat off.
    - It replaces our grid only if the same rival grid persists for `relockBeats` of its own beats; otherwise the wait restarts.
    - While a rival waits, the target confidence is `min(conf, 1 − its confidence)`, so a wrong grid is never shown as confident.
  - **Hold means no onset within ±⅛ of the grid for more than 1 bar,** at any strength (S5.1: `strength ≥ 1` passes every onset).
    - Readings below `LOCK` never move the grid. Since S5.4 they decay the confidence like a hold does. Confident readings still count during a hold, since they may be a new track.
  - **`LOCK = 0.3` knob.** Below it, a reading never starts a grid and never competes. "Adopt when confidence is 0" is read as "no grid yet".
  - **Gentle merge:**
    - an agreeing reading closes 10% of the period gap (`MERGE_GAIN` knob) and sets the target confidence;
    - agreement is checked at our octave, so ×2 and ÷2 stick.
  - **`periodGain` is 0.03, not 0.02.**
    - At 0.02 the plan's own test fails: still 0.27 BPM off after 16 beats.
    - At 0.03 the same case ends 0.07 off, and the 20 ms-step test moves the period 0.32% (the limit is 0.5%).
    - Under 3 ms jitter: grid p95 2.9 ms, maximum BPM deviation 0.12.
  - **The beat count never jumps when the period changes.**
    - The PLL rebases the anchor onto each beat it corrects.
    - `double`, `halve` and the merge rebase onto the beat under the last time seen. The plan's "keep anchor" is taken as "keep that beat".
  - **`nudge` moves `lead` (the shown grid), not the anchor.** The PLL keeps the grid on the kicks and would pull an anchor nudge back within a few beats.
    - There is no `nudgeMs` opt: `nudge(ms)` takes the amount, and the 10 ms lives with the key in `app.ts`.
  - **`downbeat` rounds instead of flooring,** so a press just before the 1 marks it.
  - **No bar "1" heuristic.**
    - Onset strength saturates at 4.0 on kicks and claps alike (p50 = 4.00 on every test stream), so a per-position mean has nothing to rank.
    - Bar 1 is beat 0 of the lock until `B` is pressed. Add a bass-ODF accent from `tempo.ts` if wanted.
  - **When the hold expires, the downbeat resets too.** The next lock counts from beat 0, and the director's reset guard absorbs the jump.
  - `at()` returns the same object every call, like the director's `Shot`.
  - **Tests (14):**
    - phase math and `ZERO_SYNC`, with the `LOCK` gate;
    - tap ×4 to 120, with the median and the 2 s reset;
    - double and halve counting on, with `downbeat`;
    - `nudge` persisting under the PLL;
    - PLL: a 20 ms step, ±1 BPM within 16 beats, and the since-division after a break;
    - off-beat hats and a hat-only break;
    - an 8-bar break: slow decay, a weak reading ignored, back on the beat, expiry after 16 bars;
    - smoothing: 1 → 0 crosses 0.4 between 0.9 and 1.1 beats;
    - a half-beat rival: none at 4 beats, re-anchor at 8 or more;
    - a new-tempo re-lock after 8 of its beats, with no jump and no confident wrong grid;
    - flip-flopping rivals never re-lock;
    - ×2 sticks.
  - **Mutation-checked: 23 single mutations, each fails at least one test.** They include the plan's 0.02 gain, the since-division, the gate, hold decay and expiry, the hysteresis wait, the rival confidence cap, octave folding, both rebases, tap median and reset, `nudge` via the anchor, `floor` in `downbeat`, smoothing, `LOCK`, the merge, the hold's weak-reading rule, phase in agreement, and same-rival.
  - **End to end on real detector streams** (scratchpad `cp5/`, tempo + sync at 60 fps):
    - house and `kicks128n.wav`: confident at 6.7 s; grid vs onset p50 1.4–1.8 ms, p95 3.3–3.9 ms;
    - clap-only break: grid held, confidence 0.15–0.26 (the source sees weak rhythm);
    - non-beatmatched overlap: grid kept, confidence 0.12–0.53;
    - 128 → 140 cut: re-locked about 8 s after the cut (about 6 s of source window plus 8 beats), confidence 0.66–0.8 on that section;
    - arrhythmic hits: never locks.

### S5.3 `[x]` Wire (c): worklet ODF → tempo → sync, keys `T [ ] , . B`, pulses × confidence, overlay BPM
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** CP5 demo end to end.
- **Files:** `web/src/app.ts`, `web/src/ui/Overlay.tsx`, `web/src/scenes/tunnel.ts` (pulse example; other scenes get a one-line `pulse` uniform in the same step only if it fits ≤3 files, otherwise in S5.4).
- **Behaviour:** `app.ts` drains `odfQueue` → `tempo.pushOdf`, feeds each onset to `tempo.push` and `sync.feed`, computes `f.sync = sync.at(f.audioNow)`; `lead` knob defaults to 0 and is tuned from the CP2 lag number ⚠️. Keys: `T` → `tap(audioNow())`, `[` → `halve()`, `]` → `double()`, `,`/`.` → `nudge(∓10)`, `B` → `downbeat(audioNow())`. Scenes: `pulse = (1 − fract(sync.beat))^k · sync.confidence` as a uniform (tunnel first). Store patch `{ bpm: round(bpm·10)/10, confident: confidence ≥ θ }` at most 4×/s; overlay shows `BPM 128.0` and dims it when not confident. Director already consumes `sync` (S3.6), so bar-line switching turns on by itself.
- **Tests:** none new (all logic tested in S5.1/S5.2/S3.6).
- **Done-check:** gates green. **Manual:** CP5 demo; the user reports tempo-lock time and BPM vs rekordbox on 5 tracks (Q4 metric).
- **Depends on:** S5.2, S4.3.
- **Changed during implementation:**
  - **(c) runs on "heard" time, as T1 does.**
    - `f.sync = sync.at(heard)`, and `T`/`B` use `heard()` as well. For a file, heard time is `audioNow`. For line-in it is `audioNow + baseLatency + outputLatency`, since line-in is heard live at capture.
    - Without this, the line-in grid would trail the line-in flashes by the output latency (about 43 ms).
    - `lead` stays 0 and is kept for the CP2 lag number.
  - **Onsets reach (c) after the T1 drain** (`f.onsets`), the one place onsets enter the frame. Their stamps carry the timing.
  - **θ = 0.6 lives in `app.ts` (`CONFIDENT`) and is passed to the director,** so the dimmed BPM and the bar-line rule share one knob.
  - **`pulse(sync, k = 4)` lives in `sync.ts`,** so S5.4's other scenes reuse it. In the tunnel, on each beat:
    - the walls brighten by 50%;
    - the end light by 3×;
    - the flight surges ×3 (`SURGE = 2` knob).
  - **Overlay:**
    - `BPM 128.0` sits next to the scene name;
    - it dims to opacity 0.35 when not confident and is hidden at bpm 0 (`overlay.css` is a 4th file, as in S2.4 and S3.7);
    - BPM and `confident` ride the 4×/s badge patch.
  - **`input.ts`:** the `ODF_KEEP` and `odfQueue` comments now say that `app.ts` drains the queue (2 comment lines).
  - **Browser smoke.** Installed Chrome, headed, with `--mute-audio` so nothing reached the speakers during the live set, against our own dev server on 5173.
    - `kicks128n.wav`: BPM 128.0 at 5.6 s after the drop, confident at 6.4 s.
    - A 46 s house test track: 127.7 at 5.5 s, confident at 6.2 s, then 128.0.
    - Bar-line switching, with a test-only `barsPerShot: 4` patch: fades at bars 4, 8 and 12, each 0.2–0.3 frames past the bar line, first mix ≤ 0.003, 1.007 bars long.
    - Keys:
      - `]` 256, `[` 128, `[` 64, `]` 128;
      - `.` moved the grid 10.5 ms later, and `,` moved it back;
      - `T`×4 read 118.8, from Playwright's ~505 ms key spacing. The confident source took the music's 128 back after 3.8 s (8 beats), as designed.
    - The tunnel's centre is brighter on the beat (luma 185) than half a beat later (149).
    - 0 GL errors, 0 console errors.

### S5.4 `[x]` Synthetic bench test + `?debug` (c) metrics
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** the Q4 bench (p95 ≤ 20 ms, 0 slips, 0 flips over 5 simulated minutes) and the on-rig metrics readout.
- **Files:** `web/src/audio/bench.test.ts`, `web/src/app.ts`, `web/src/ui/Overlay.tsx`.
- **Behaviour:** the bench drives `createTempoSource` + `createSync` with a generated 5-minute 4/4 EDM-like ODF/onset stream at 128 BPM (kick every beat, hats on 8ths at half strength, 3 ms jitter, two 8-bar breaks, one 16-bar beatmatched overlap at the same tempo); asserts: bpm within ±0.3 after 10 s, |grid beat − kick| p95 ≤ 20 ms after lock, no octave flip, no beat-index slip through the breaks. `?debug` readout: for each strong onset, distance to the nearest grid beat; show rolling median/p95 (ms) over the last 64 and seconds-to-confident since the last `bpm = 0` → `store.patch` at 4×/s. Also multiply the remaining scenes' beat terms by `confidence` if S5.3 did not.
- **Tests:** the bench file itself (mandatory; keep it < 2 s runtime by stepping at hop rate without real FFTs).
- **Done-check:** gates green. **Manual:** `?debug` numbers on the rig for the Q4 metrics (tempo accuracy, pulse offset, recovery, hold).
- **Depends on:** S5.3.
- **Changed during implementation:**
  - **The bench fixture.** Five minutes at 128 BPM, as specified, then a cut to 140 for one minute, so the bench can report recovery after a tempo change.
    - The stream mimics the worklet as measured in S5.1:
      - a bass-band ODF with an exponential floor (mean 1), and kicks at about 13 + 5 over two hops;
      - onsets stamped at hop ends, at most one per 50 ms (the detector's `minGap`).
    - The "hats at half strength" are onsets at strength 2 (kicks are 3.5–4) with little bass (ODF 0.5; kicks 13).
    - The beatmatched deck sits 6 ms late, so the 50 ms gap hides it, as on the real detector.
    - It runs in about 0.6 s. Vitest prints the metrics with `npx vitest run src/audio/bench.test.ts --reporter=verbose`; the default reporter hides a passing test's output.
  - **Bench numbers:**
    - time to confident: 5.87 s after the first kick;
    - tempo error from 10 s on: max 0.083 BPM, p95 0.057 (limit ±0.3);
    - pulse offset |grid − kick onset| after lock: median 1.83 ms, p95 5.47, max 9.86 (limit p95 ≤ 20);
    - 0 octave flips and 0 beat slips, through both breaks and the overlap;
    - the first kick after each 8-bar break is −0.8 and −2.1 ms off, and the confidence at each break's end is 0.16 and 0.18;
    - after the 128 → 140 cut: recovered in 7.02 s (16.4 beats), confident while wrong for 1.47 s;
    - the asserts are the four in the plan, plus the hold at ≤ ⅛ beat, recovery under 15 s, and confident-while-wrong under 4 s.
  - **`sync.ts` changed, because the bench caught it.** A weak reading (below `LOCK`) is no longer merged.
    - It now starts a "weak streak", and the target confidence decays at the hold rate, 0.05 a bar after the first bar, as in an onset-free hold.
    - Before: on a hat-only break, a weak reading that happened to agree pulled the period (a 0.9 BPM excursion) and dropped the confidence to about 0 at once.
    - The bpm-0 expiry still follows only onsets on the grid.
    - New test: the weak streak. The 4 new mutations each fail it, and the S5.2 set still fails as before.
    - The smoothing test now steps the target through a sure rival.
    - Found on the final read: `lock()` now clears the weak streak, so a tap after a long stretch of ambience starts confident instead of decaying at once from the old streak. New test; the mutation fails it.
    - Final gates: lint and tsc clean, 75 tests in 10 files (in 0.8 s), `npm run build` OK.
  - **`?debug` (c) readout:**
    - The plan's "strong onset" is taken as an onset within ±⅛ beat of the grid, measured before it corrects the grid. Off-beat hats fire at 4.0 and would fill the p95 with about 234 ms.
    - "Seconds to confident" counts from the first onset after the grid was last gone. The moment bpm leaves 0 is the lock itself, which would only measure the 1-beat smoothing.
    - The confidence is shown too, for the `PROM_*` and `LOCK` knobs.
    - `store.ts` gains a `debugSync` field.
  - **The other scenes get `uPulse = pulse(f.sync)`** (3 more files, as the step allows):
    - spectrum: the bars and the floor line;
    - particles: the disc radius and the point size;
    - glitch: the brightness.
  - **The CP5 browser check.** Installed Chrome, headed, `--mute-audio`; our own `vite` on 5173, stopped afterwards; scratchpad `cp5/cp5-check.mjs`. The served `app.ts` is route-patched only to log each frame.
    - `kicks128n.wav` with `?debug`: BPM 128.0 at 5.8 s after the drop, confident at 6.4 s. The debug panel read `1.8 / p95 3.8 ms · confident after 6.2 s · conf 0.99`.
    - A 90 s house test track at the product defaults: 127.6 at 5.0 s (within ±1), confident at 6.0 s.
    - The first autopilot switch landed on bar 16.001, 0.09 frames past the line, with a 1.004-bar fade.
    - Keys:
      - `] [ [ ]`: 256 / 128 / 64 / 128;
      - `.` moved the grid +10.0 ms, and `,` moved it back 9.6 ms;
      - `B` set the downbeat offset to the predicted value, twice;
      - `T`×4 read 119.1, and the music's 128 returned after 3.9 s.
    - Line-in path (Chrome's fake capture device playing the track, 44.1 kHz): 127.8 at 5.1 s, confident at 5.9 s, `1.5 / p95 4.4 ms`, and a bar-line fade on bar 4.000 (test-only `barsPerShot: 4`).
    - Every run had 0 GL errors and 0 console or page errors.

### S6.1 `[x]` Closeout: `THIRD_PARTY.md` (R4), delete the probe, final gates
Invoke the `ponytail` skill (full) before writing code.
- **Goal:** licenses recorded; throwaway code removed.
- **Files:** `web/scripts/licenses.mjs`, `web/THIRD_PARTY.md`, delete `web/src/probe/` (+ the `?probe` branch in `main.tsx`).
- **Behaviour:** `licenses.mjs` reads `web/package.json` `dependencies` + `devDependencies`, then each `node_modules/<name>/package.json` → prints `| name | version | license |` sorted; the coder pastes the table into `THIRD_PARTY.md` under "Runtime" (react, react-dom, twgl.js, fft.js) and "Toolchain" (vite, @vitejs/plugin-react, typescript, vitest, eslint and plugins), and adds the note "fft.js: MIT per npm metadata; the GitHub repo has no LICENSE file" and the twgl example attribution (S3.4). No shaders are ported from third parties in the pilot; if any were, list them here with author/URL/license.
- **Tests:** none.
- **Done-check:** gates green; `npm run build` succeeds; `THIRD_PARTY.md` lists every entry in `package.json`.
- **Depends on:** all previous steps.
- **Changed during implementation:**
  - **`main.tsx` imports are static now**, as the S1.6 note allowed: `import './app'` and `import { Overlay }`, with no top-level await. The dynamic imports only existed so `?probe` never loaded the singletons.
    - The build used to split the app into `index`, `app`, `Overlay`, `quality` and `jsx-runtime` chunks. It now emits one `index-*.js` (298.8 kB, 94.8 kB gz), `onset.worklet-*.js` and the CSS. The worklet hash is unchanged.
    - `app.ts` and `engine.ts` only touch the static `#stage` canvas at load, so the module order does not matter.
  - **One comment-only edit outside the step's file list:** `audio/onset.worklet.ts` said "(as the probe does)". The reference dangled once the probe was gone, so it was dropped.
  - **`vite.config.ts` is untouched.** `optimizeDeps.include: ['fft.js']` stays: `onset.worklet.ts` imports `fft.js` and the dep scanner does not crawl worklet imports.
  - **`licenses.mjs` prints one sorted table**, as the step says. `THIRD_PARTY.md` splits it by `package.json` section: `dependencies` → Runtime, `devDependencies` → Toolchain (`playwright-core` is the lead's verification tool and stays there). Checked by script: the doc's 18 rows equal the script's 18 rows, so every `package.json` entry is listed.
  - **Attribution checked against the repo:** `examples/transform-feedback-particles-va.html` exists in greggman/twgl.js and its header matches the one quoted in `particles.ts`. `THIRD_PARTY.md` names `src/scenes/particles.ts` as the adapting file. fft.js also gets its author and repo URL, and the note that its README says MIT.
  - **No other leftovers:** the S1.2 extras (`hann.ts`, the copy button, the download link) all lived inside `src/probe/`. A repo-wide search found no other `probe`-named files, and `dist/assets` has no `probe` chunk after a fresh build.
  - **Final gates:** `npm run lint` and `npm run typecheck` clean, `npm test` 75/75 in 10 files, `npm run build` OK.

## Acceptance mapping
| Spec §7 | Proven by |
|---|---|
| §7.1 line-in in the picker, visuals react; file drag-and-drop | CP1 (S1.4, S1.5, S1.6); channel routing check S2.4 (`?debug` meters + `getSettings`) |
| §7.2 (a) energy bands + (b) timestamped onsets exposed; lag measured on the rig | S1.3 (`Energy`), S2.1–S2.3 (`Onset.t` from `currentFrame`), `?flash` + 240 fps video in CP2 demo; the number is recorded in STATE, ≤50 ms stays a hypothesis |
| §7.2 bonus (c): tempo accuracy, pulse offset, recovery | CP5: S5.1/S5.2 tests, S5.4 bench + `?debug` metrics; on-rig numbers from the CP5 demo |
| §7.3 all 4 scenes in the playlist; autopilot smooth, bar lines when confident else time; all keys | CP3 (S3.1–S3.7: FBO crossfade, director tests, `←/→/Space/F`); `Q`/`R` in CP4; `T [ ] , . B` in S5.3 |
| §7.4 REC playable with picture and sound | S4.3 (CP4 demo, QuickTime) |
| §7.5 60A holds 60 fps for 30 min; 60F and 30 selectable | S4.1 governor tests, S4.2 modes + badge; the 30-min run in the CP4 demo (≤1 late frame/min, Q7) |
| §7.6 ESLint, tsc, Vitest pass | every step's done-check; S1.1 fixes the commands; S6.1 final gates |

## Research gaps
None blocking the plan. R1, R2, R5, R6, R9 become user-reported numbers from S1.2; the affected steps (S2.2, S2.3, S4.2, S4.3, S5.3) carry the conditional fallbacks. R4 is S6.1. R3 is not needed (B + heuristic accepted). R8 does not apply; R10 skipped.
