# Guide: port one vs3 scene (donor/vs3, the friends' three.js engine)

## TL;DR
- One scene = copy its file into `web/src/vs3/kit/scenes/`, review it, wrap it in a factory, add one `vs3(...)` line in `web/src/vs3/host.ts` (`VS3`), one built-in in `web/src/scenes/builtin.ts` (`VS3`), one row in `web/THIRD_PARTY.md` § vs3 scenes.
- The host (`vs3/host.ts`) does the rest: lazy load, the shared three r187 renderer (`three/host.ts three()`), PAL, the signal `s`, the screen redirect, the scene's `bloom`, the donor finish (aberration, BRIGHTNESS 1.4 + soft tone map, vignette).
- Proven on ink, relic, morphogen, then batch 1 (mandala, tendril, citadel, descent, oracle, idol) and batch 2 (spacetime, ingot, gate, synapse, anemone), 2026-11-19. Never run anything inside `donor/`.

## Freshness
2026-11-19, master 10408d2 + batch 2 (the ⚡ `mid` input, the texture trap, the kaleidoscope centre, the rotate sign). Sources: `agents/research/research_donor_vs3_scenes.md` §1-§6; FX_DEFAULTS and SCENE_PALETTE from the ORIGINAL `donor/vs3/visual_system_3/renderer/main.js` (L167-279, L7780).

## 1 Copy and review
1. Copy from the kit copy `donor/vs3/visual_kit/src/scenes/<file>.js` (bare `three` imports). Keep the relative paths: libs live in `vs3/kit/lib/`.
2. Grep the file and every lib it imports: `fetch|XMLHttpRequest|WebSocket|eval|new Function|import\(|localStorage|sessionStorage|indexedDB|postMessage|navigator|document\.|window\.`. A scene may touch three.js and its own uniforms only. Strip or stub the rest; mark each strip with `// vjw:` and list it in your report.
3. A lib not yet in `vs3/kit/lib/`: copy it the same way. Never copy `edition.js` (telemetry) or `preset-guard.js`.
4. Header, first two lines: `// Copied from donor/vs3/visual_kit/src/scenes/<file>.js (the friends' engine, used with permission, 2026-11-19).` and `// vjw: <what changed>`.

## 2 The factory (each layer owns its scene)
- After the imports: `export default function create() { // vjw`. Replace `export default {` with `return { // vjw: was \`export default {\``. Append `} // vjw: the factory`. Leave the indentation as it is.
- Why: a module singleton shared by two instances (the stage and a Library tile, a fade) doubles its clocks and fights over its sim targets.

## 3 Register
- `vs3/host.ts` `VS3`: `vs3('<name>', () => import('./kit/scenes/<file>.js'), { palette, bloomMul, aber, vignette })`. The id becomes `native/vs3-<name>`.
- `palette`: SCENE_PALETTE (`main.js:7780`: morphogen pearl, main stage vapor, morphogen 2.0 glacial), else `nocturne`. Names: `vs3/kit/lib/palette.js` PRESETS.
- `bloomMul`, `aber`, `vignette`: the scene's FX_DEFAULTS row (`grep -n "^  <name>:" main.js`; no row = BASE_POST 1, 1, .34).
- `mid: true`: only for a scene that reads `s.onMid` / `s.onHigh` (§5). Its built-in binds `KICK_SNARE` instead of `KICK_HIT`.
- `builtin.ts` `VS3`: `{ gen: { ref: 'native/vs3-<name>', bind: KICK_HIT }, fx: [...], res }`, `star: false` until the user has looked.
- Bare imports other than `three` (e.g. `three/examples/jsm/...`): add each to `vite.config.ts` `optimizeDeps.include`, or the scene's first load fails with a 504 (§ Traps).

## 4 The donor post chain → our fx (FX_DEFAULTS row)
| donor key | ours |
|---|---|
| mirror 1 / 2 | `isf/Mirror` (horizontal; + vertical for 2). ≥ 3 (kaleido): `isf/Kaleidoscope` sides = n, **`center: [0.5, 0.5]`** (the file's default is the corner) |
| persist ≥ .5, zoom ≠ 1 | `own/feedback-zoom`: decay = persist (per 60 Hz frame, like the donor), zoom = zoom^(1/60) − 1, the kick push as ink's `KICK_ZOOM` (max = (zoom + .165)^(1/60) − 1) |
| persist < .5 | leave out (a 2-3 frame ghost) |
| spin | `rotate` ≈ **−**0.001 turns/frame at spin **+**.25: the sign flips (the donor samples its history turned by −angle, `own/feedback-zoom` by +rotate). spin 0: `rotate: 0` (the effect's default is .004). The radial swirl and wobble have no equivalent |
| bloom, aber, vignette, brightness | the host (bloomMul, aber, vignette from `look`; BRIGHTNESS 1.4 fixed) |
| edgeAA, lens, grain, fxWet, fxHint, msaa | no equivalent; say so in the report |
Mirror before feedback (the donor mirrors the trails too).

## 5 Signal `s` (host.ts `signal()`)
- Filled: `kick` = ⚡ `hit` (bound to our kick, flash-gated), `onKick` = its rise × our `kickAccent` (velocity .7 / 1), `sub` ← syn_BassLevel, `mids` ← syn_MidLevel, `highs` ← syn_MidHighLevel, `energy` ← syn_Level (the donor-mode core runs in every mode).
- Grep the scene: `grep -o "s\.[a-zA-Z]*" <file> | sort -u`. A field outside that list reads `undefined` → NaN uniforms → black. Add it to `Signal` + `signal()` (research §4 table) and to `host.test.ts`. `specHi`, `wave`, `bands`: not provided yet.
- `onMid`, `onHigh` (synapse, anemone): both = the rise of ⚡ `mid`, the second flash-gated input (`look.mid`), bound to our snare. One input for the two: the flash budget is 3 onsets/s for the whole app, so hats at their own rate would take the kick's share.

## 6 Flash safety (I-FL1)
- Every kick-driven light term in the scene reads `s.kick` / `s.onKick`: both come from the gated ⚡ `hit`. The host's bloom kick term and the finish's kick aberration use `hit` too.
- `s.kick` is drawn with the natives' rise slew (`gl/post.ts heatStep`, 40 ms), so an allowed kick's light never lands in one frame. A scene with a big kick light (synapse's core swell): count its luma steps (`scratchpad/vs3/flash.mjs`, H2's counter).
- A new field that adds light on a hit (onMid, onHigh) must come from a flash-gated input, never a raw source. The app-wide gate (`gl/post.ts`, ≤ 3/s) stays last.

## 7 Check
- Gates: `npm run lint && npm run typecheck && npm test` (copied `.js` is not linted: `eslint.config.js` lints ts/tsx only; `vs3/kit.d.ts` types `*.js` imports as any).
- Still (Vite on your port, restarted first): `ARGS=--disable-audio-output HOLD=6000 node scratchpad/vs3/still.mjs <port> <tag> builtin:vs3-<name> 52` → not BLACK/FLAT, no console error. Compare with `donor/vs3/visual_kit/public/vendor/thumbs/<name>.jpg`: palette, symmetry, density.
- Cost: `ARGS=--disable-audio-output SEC=15 node scratchpad/vs3/cost.mjs <port> tracks/1-Kanine-Feel-The-Vibrat-EW6MXW.flac builtin:vs3-<name>` (`RES=` overrides res). The proofs ship res .5: ink 6.7, relic 7.1, morphogen 5.2 ms billed p95 (at .85: 25.4 / 26.2 / 14.5).

## 8 Traps
- `.gitignore` ignores every folder named `donor/` at any depth: the copies live in `vs3/kit/`, never `vs3/donor/`.
- `setRenderTarget(null)` and `getDrawingBufferSize()` mean the layer RT while the scene runs (`screen()`); never call `renderer.setSize`/`setPixelRatio` (they size OUR canvas).
- `resize(w, h)` gets RT px, not CSS px (the scenes read the aspect only; check the file).
- PAL is shared: the host copies the scene's palette into it before each update + render. A scene that writes PAL itself breaks its neighbours.
- `Math.random` stays (donor code): stills differ run to run.
- Disposal: the host frees every target the scene bound and the scene graph's geometries/materials. Sim materials outside the graph (FullScreenQuad) are left to GC (shared programs).
- A scene with textures, built-in materials (aurora, blob, chorus, echo, flow, signal, synapse, visage) or `ctx.*` fields beyond `renderer`: re-run the S1-T GL diff (three/host.ts RENDER_LIST covers units 0-2).
- Pointer scenes (anemone, morphogen's painting): `scenePointer` is a dead stub (`common.js`).
- A scene that builds a texture (anemone's bead sprite): keep it ABOVE the factory, one for every layer. The host frees geometries and materials, no textures. A detached 2D canvas as its source is fine (no I/O); mark it `// vjw:`.
- Assets (chorus, visage, limitless 3d, main stage): not covered by this recipe.
