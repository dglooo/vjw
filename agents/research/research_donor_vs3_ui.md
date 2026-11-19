# Donor scan: vs3 UI, configuration model, multi-scene engine

## TL;DR
- The donor is one global "look" over one active scene: 4 macros (react/chaos/trails/heat) + a fixed post chain (mirror → feedback → bloom → lens → finish) + 24 palettes × 5 shared colour slots + per-scene art direction (`FX_DEFAULTS`, 32 entries). The panel is lil-gui 0.19.2, dressed into a glass "console" with 6 tabs, a pinned scene/preset header, and full-screen scene and preset browsers with thumbs, search and favourites.
- Multi-scene = one second scene as a "layer" (4 blends: screen/over/under/mask) at half the pixels, plus a dissolve that the original uses only for auto-cycle (3 s). A manual switch is a 240 ms dip to the background colour. The kit uses a 0.8 s dissolve for every switch.
- Configuration = presets (a full look snapshot as JSON): 173 factory `★` presets, user presets in localStorage + host `presets.json`, preset morph (0–2000 ms), 128 automation slots, 16 device macros, MIDI learn, auto-cycle by seconds or bars, and a per-track automation timeline.
- Ours is a different model: up to 4 layers per scene, each a generator + effect chain with 7 blends and per-param audio bindings, a director autopilot with 13 transitions, and a library in IndexedDB. We have no global post chain, no palettes, no macros, no presets/morph, no MIDI, no text layer, and no second-scene layer across scenes.

## Freshness
- 2026-11-19, researcher, source commit `6cfffb6` (master). Donor read as text only; nothing in `donor/` executed.
- Donor versions (from the donor's own text): app v0.4.3 (`O/../report.md:1`), three.js r170, lil-gui 0.19.2 (`report.md:16`). Kit deps: react + three@0.170.0 (`K/../README.md:94`).
- Path keys used below: `K/` = `donor/vs3/visual_kit/src/`; `O/` = `donor/vs3/visual_system_3/renderer/`; `W/` = `web/src/`.
- No UI screenshots exist in the donor. Images: 35 scene thumbs at 800×500 (`O/vendor/thumbs/*.jpg`) and 172 preset thumbs at 320×180 (`O/vendor/thumbs/presets/*.jpg`). The look in §6 comes from CSS.

## §1 UI map

### §1a Original (`O/index.html` + `O/main.js` + `O/lib/menu-lab*.js`)
The UI is built at runtime: `index.html` holds only empty shells (`#fade`, `#status`, `#hud`, `#scenegrid`, `#palgrid`, `#hint`, `#flashnote`; `O/index.html:969-990`). Everything else comes from `main.js` and the menu-lab modules.

| Control group | What the user sees / does | Source |
|---|---|---|
| Tune panel root | lil-gui titled "app · tune (g)". Version footer + update link. A click on a folder title scrolls it into view. | `O/main.js:10835-10905` |
| Pinned header `#tn-head` | Scene · mode, the loaded preset name, "· modified", and actions `update` / `save copy` / `revert`. It stays in view while the panel scrolls. | `O/main.js:11722-11780` |
| Tabs | `tune · fx · scene · media · presets · output`. A click shows one tab. Shift-click adds a tab beside the others. Rows are sorted into tabs by label (FX_ROWS set). | `O/lib/menu-lab-more.js:154-245` |
| Macros (tune) | 4 sliders `react, chaos, trails, heat` 0..1, default 0.5. A double-click on any slider resets it (`bindReset`). | `O/main.js:10930-10933` |
| Response (tune) | `decay` 0..1, `brightness` 0.6..2.4, `input gain` 0..1 (stored in localStorage). | `O/main.js:10934-10939` |
| Input EQ (tune) | One row: a lit band on a 20 Hz–20 kHz log track. A click opens a floating editor: drag to move the window, drag an edge to resize, double-click for "full mix". | `O/main.js:6493`, `O/index.html:468-505` (`.listen-row`, `#listen-fly`); kit port `K/ui/EffectPanel.jsx:37-127` |
| Look rows (fx) | `symmetry` 0..12, `tiles` 0..6, `twist` ±3, `slice` 0..1, `lens` 0..1, `lens style` (7), `spin` ±3 (shown only when symmetry > 0), `hue drift` 0..1, `vignette` 0..0.8. `lens style` dims at lens 0. Bipolar sliders grow from the centre. | `O/main.js:10948-10970`; CSS `O/index.html:577-671` |
| Palette | A dropdown row in the panel + a palette card `#palgrid` (key `P`): groups classic/bold/earth/rainbow, fold state in localStorage, a 5-colour strip per palette, a "custom" palette from an image. | `O/main.js:11028`, `O/main.js:8395-8470`, `O/index.html:150-302` |
| Randomize | `build from scratch`, `randomize scene` (primary), `randomize look`, `undo randomize` (appears after a roll), `reset all → scene defaults`. | `O/main.js:11240-11306` |
| Scene folder | `scene · <name>`: the scene's `mode` dropdown + its params as sliders. Rebuilt on every scene change. | `O/main.js:7472` |
| Presets folder | `morph ms` 0..2000, `auto-cycle` (off, 2.5 s … 30 min, 4/8/16/32 bars), `cycles` (presets / scenes), a library browser (folders, click to load, × to delete, right-click to bind MIDI, slot chip), `preset name`, `folder`, `save preset`, `bring back factory presets`, sub-folder `preset library…` (save/load library file, copy this look as text). | `O/main.js:11318-11635` |
| Layer folder | `layer · second scene`: `scene` (off or any), `opacity`, `blend`, `randomize layer`, and a sub-folder `controls · <layer scene>` with the layer scene's own params. | `O/main.js:11847-11925` |
| Media folders | `image · photo or video`, `image · emblem` (logo, also 3D model), `text` (look, transition, own font, sync lines to the song, previous/next line `[` `]`, palette ↔ white, clean). Drag-drop of a track, photo, video or logo anywhere. | `O/main.js:11925-12217`, `O/main.js:14452-14455` |
| Output (recording + device) | `recording settings`: frame (a key), for socials (30 fps), lock screen to 30 fps, start/stop with the DAW, quality, frame rate. `device macros`: 16 macro slots, each mapped to one target (exclusive). | `O/main.js:12218-12260` |
| HUD (bottom bar) | Chips: `‹` scene `›`, `tab · scenes`, `q · presets`, `g · tune`, `p · <palette>`, `x · shuffle`, `a · <frame>`, `s · shot`, audio in / track, `o · output`, preview mode, rec. It fades with the pointer idle. | `O/main.js:8202-8275`, `O/lib/menu-lab.js:158-170` |
| Scene browser | `Tab` (or HUD chip): a card with a rail to narrow by launch, a search field, tiles with the scene still, its number, the count of its looks (opens those looks), and a favourite star. Locked tiles (lite) and "heavy" tiles (AMD Mac, click twice). | `O/lib/menu-lab-scenes.js:1-40`, `O/main.js:8290-8345`, `O/index.html:166-218` |
| Preset browser | `Q`: filters all / this scene / folder / scene; tile preview = the preset's own still, else the shipped thumb, else a still grabbed after it played (localStorage), else the scene still. Favourites. A save dialog (name, pick or start a folder). | `O/lib/menu-lab-more.js:249-300`, `:509-606` |
| Favourites | A star on every scene and preset tile; one localStorage set per kind (`app.fav.scenes`, `app.fav.presets`). | `O/lib/menu-lab-fav.js:7-35` |
| Panel placement | `right` (flush, full height), `left`, `float` (drag by the title). Size 0.75 / 1 / 1.25 via CSS zoom. Stored in `app.menulab`. | `O/lib/menu-lab.js:1-60`, `:206-245` |
| Shortcut card `#hint` | First-run card: G tune, Tab scenes, P palettes, X shuffle, Space play, F fullscreen; `H` shows it again. | `O/main.js:14437-14462` |
| Right-click menu | On a panel row: automation lane, device macro slot, MIDI learn for that target. | `O/main.js:12290-12305` |
| Photosensitivity note `#flashnote` | Shown once per machine. | `O/index.html:977-990` |

Keyboard (`O/main.js:15010-15050`): `1`–`9`/`0` scene N, `←`/`→` prev/next, `Tab` scene browser, `Esc` close grids, `P` palettes, `A` frame aspect (full/16:9/9:16/1:1), `R` record, `S` still, `[`/`]` text line, `X` shuffle (new scene + palette, macros kept), `E` shader code panel, `N` randomize scene, `L` randomize look, `B` swap with the previous look (through the morph), `O` output window, `C` next camera, `G` panel, `H` hint, `D` debug meters, `F` fullscreen. In the plugin every key needs Shift (`O/main.js:14440`).

MIDI (`O/main.js:7165-7200`, `:8968-8987`): Web MIDI (or host CoreMIDI), CC learn onto 43 macro targets + 6 emblem ranges, bindings in localStorage `app.midiMap`; keys/pads/program change can also bind a scene or a preset (`O/main.js:11711-11713`). Gestures: canvas drag edits scene params through `dragPose` (`O/lib/scene-gestures.mjs:12-40`).

### §1b Kit reproduction (`K/`)
| Control group | What it is | Source |
|---|---|---|
| Panel | One React column "app · tune (g)", the same row order as the original, no tabs, no header, no presets folder. | `K/ui/EffectPanel.jsx:143-271` |
| Sections | react (4 macros) → response (decay, brightness, input gain, input EQ row) → look (symmetry … vignette) → palette (24 cards + custom from image) → scene · name (mode + params, all 0..1) → layer (scene/mix/blend) → look (copy look, reset all) → source (microphone, audio file). | `K/ui/EffectPanel.jsx:153-269` |
| Slider | label + range + value; double-click = default. | `K/ui/Slider.jsx:1-21` |
| Scene grid | Shift+Tab overlay: a card per scene with its thumb and name; click launches, Esc closes. | `K/ui/SceneGrid.jsx:1-28` |
| HUD / hint | Top-left hint, bottom-left `scene · fps · src`, toast. Keys: `g` panel, `shift+tab` grid, `Esc`. | `K/App.jsx:103-118`, `:209-216` |
| Not ported | presets, morph, auto-cycle, MIDI, emblem/text, recording, timeline, tabs, favourites, AE, pixelBudget. | `K/../README.md:124-131` |

## §2 Configuration model
| Item | Shape / behaviour | Stored where | Source |
|---|---|---|---|
| Global macros | `react, chaos, trails, heat` 0..1, 0.5 = stock. Read by the analyser and by the scenes (`ctx.macros`). heat/chaos act through `drastic(p) = 4^((p-0.5)·2)` (0.25×..4×). | in the look / preset | `K/App.jsx:30-37`, `K/lib/common.js:6`, `K/engine/engine.js:147-149` |
| Post params (`BASE_POST`) | `mirror 0, persist .5, zoom 1.04, spin .5, bloomMul 1, aber 1, vignette .34, quality 1, brightness 1.4, hueDrift 0, lens 0, lensStyle 'glass ribs', tiles 0, twist 0, slice 0, decay .5, layer 'off', layerMix .7, layerBlend 'screen'`. Range clamp on load (`POST_RANGES`). | in the look / preset | `K/engine/post-shaders.js:17-37`, `O/main.js:10602-10620` |
| Per-scene art direction `FX_DEFAULTS` | 32 scenes, each sets `mirror, persist, zoom, spin, bloomMul, aber, vignette`. Merged into `post` on a scene switch except `FADE_KEYS` (mirror, spin, vignette), which keep the user's value. `LATE_TRAILS` (crystal/pearl/spiral .8): clean up to trails .5, trails fade in above. | code | `K/engine/post-shaders.js:40-152`, `K/App.jsx:25`, `:127-136` |
| Scene contract | `{ name, scene, camera, params, update(s,dt,t), resize, bloom{strength,gain,kick}, pixelBudget, renderFloor, edgeAA, msaa, fxHint, fxWet, modes, scratchParams, grain }`. `fxHint` lets a scene force mirror/persist/steady; `fxWet()` dry/wet for the whole post chain. | code | `K/../README.md:44-46`, `K/engine/engine.js:143-247` |
| Scene params | Flat numbers 0..1 on `scene.params` (+ `mode` index with `modes` labels). The kit draws every number as a 0..1 slider. | in the preset (`sceneParams` for every scene) | `K/ui/EffectPanel.jsx:217-233`, `O/main.js:10557-10558` |
| Palettes | 24 presets × 5 slots (`bg, shadow, mid, accent, glow`), 4 display groups. Slots are mutated in place so every scene recolours, including mid-morph (1.8 s). `hueDrift` rotates hue. Append-only order (index = automation value). Custom palette from an image: quantize to 48×48, 5 distinct dominant colours, sort by luminance. Only `#rrggbb` accepted. | name (+ `customColors`) in the preset | `K/lib/palette.js:1-61`, `:63-128`, `:178` |
| Preset (look snapshot) | `snapshotPreset()`: `scene, palette, customColors, post, macros, sceneParams{every scene}, emblem, text, media ids/dataURLs (<400 KB), shaderSource, shaderKnobs`. "Copy this look as text" = this JSON on the clipboard. Kit `copyLook` keeps only `macros, post, gain, listen, palette, scene, sceneParams`. | — | `O/main.js:10549-10575`, `K/App.jsx:154-173` |
| Factory presets | 173 `★ <scene> — <name>` entries in code; shipped thumb per preset. Removal is recorded in `__shipRemoved__`; "bring back factory presets" restores. | code + `vendor/thumbs/presets/index.json` | `O/main.js:9296-10345`, `O/lib/menu-lab-more.js:268-272` |
| User presets + folders | Keyed by name, optional `folder`; `update` / `save copy` / `revert` from the header; library export/import as a file. | localStorage `app.userPresets` + host `POST /presets` (`presets.json`, "source of truth"); blob also carries `__slots__`, `__macros__` | `O/main.js:8915-8918`, `:11348-11360`, `O/../report.md:145-146` |
| Preset morph | `morph ms` 0..2000 (0 = cut). Cosine ease over `post`, `macros`, `gain`, and the scene params when the scene is the same. | localStorage `MORPH_KEY` | `O/main.js:6823`, `:7044-7070`, `:11320-11328` |
| Automation slots | Slot 1..128 → preset name, so library edits never renumber DAW automation. | in the preset blob `__slots__` | `O/main.js:8920-8951` |
| Device macros | 16 knobs → one target each (exclusive), from 43 targets; default map 1 react … 16 fill. | blob `__macros__` | `O/main.js:8960-8990`, `:12238-12260` |
| Preset guard | Pure scrubber before data reaches DOM: 5×`#rrggbb` colours only, `data:image/` URLs only, `__proto__`/`constructor` keys dropped, folder names ≤120 chars and not an Object.prototype name. | — | `K/lib/preset-guard.js:1-102` |
| Projects / timeline | Per-track automation lanes (breakpoint curves, beat grid, marquee, Cmd-Z); discrete lanes (scene, preset, palette) step. 62 targets incl. every post knob, emblem, text lyrics cues, layer scene/opacity, scene params. Project file `{app:'project', v:2, name, dur, t, bpm, off, div, lanes:[{target,on,pts}]}`. | localStorage per track (name + duration) + host `/projects` (`projects.json`) + JSON file | `O/web/timeline.js:1-115`, `O/web/project.js:1-20`, `O/web/app-track.js:74-98` |
| Other per-machine settings | input gain, input EQ, preview mode, record quality/fps/socials/DAW sync, lock30, heavy-scene ok, panel place/size, palette folds, favourites, flash ack, MIDI map. | localStorage `app.*` via `store` wrapper | `O/main.js:74-84`, `:425-6802`, `:7110`, `:7168` |

## §3 Multi-scene
- **Layer (second scene).** `post.layer` names any scene or `off`; `layerMix` opacity; `layerBlend` one of `screen, over, under, mask`. The layer scene updates on the same signals and renders into its own target; `LayerShader` mixes it into the main frame right after the dissolve (`K/engine/engine.js:121-139`, `K/engine/post-shaders.js:464-491`).
  - Blend maths: `screen` = a + max(b − bg, 0)·(1 − a)·mix; `over` = b over a where b is "drawn" (distance from the palette bg colour, smoothstep 0.04..0.22); `under` = b shows where a is empty; `mask` = b only inside a's drawn area, bg elsewhere (`K/engine/post-shaders.js:479-488`).
  - The layer persists across scene switches and rides in presets (`K/engine/post-shaders.js:30-35`). The layer is off when it names the active scene or a too-heavy scene (`O/main.js:2999-3004`).
- **Cost control (original).** Layer target = `LAYER_AREA` 0.5 of the frame's pixels (≈0.71 per side), capped at the layer scene's `pixelBudget × gpuFactor`, half-float, the scene's MSAA (`O/main.js:2983-3030`). While a layer draws, the main scene keeps `LAYER_MAIN_SHARE` 0.8 of its budget (`O/main.js:3068-3073`). The kit renders the layer at full size (`K/engine/engine.js:84-85`).
- **pixelBudget.** A heavy scene declares target internal megapixels; scale = sqrt(budget / full-res MP), ≤ 1, floor `RS_FLOOR` 0.4 or the scene's `renderFloor` (`O/main.js:2731-2748`, `:3080-3090`). Kit: not ported, dpr capped at 2 (`K/engine/engine.js:68`, `K/../README.md:130`).
- **gpuFactor.** A boot probe times a yardstick raymarcher (ms per MP) against `REF_MS_PER_MP` 2.0 (M2 Pro); factor = clamp(REF/measured, 0.15, 1) in 0.05 steps, multiplies every budget live; recording ignores it or lifts it above 1 (`O/main.js:2863-2908`, `:16263-16264`). Kit: `ctx.gpuFactor = () => 1` (`K/engine/engine.js:37`).
- **Heavy-scene guard.** On AMD Macs crystal/pearl/spiral are greyed; arrows/shuffle/presets skip them; a double click opts in, stored (`O/main.js:2785-2798`).
- **Steady pacing.** `pace.js` holds every frame for k refreshes once most need k (120 Hz → steady 60 or 40), probes lighter steps, never below 40 fps (`O/lib/pace.js:1-25`).
- **Scene switch.** Original, manual: a 240 ms dip — `#fade` (bg colour, 0.22 s CSS opacity) goes to 1, the scene swaps under it, then fades out (`O/main.js:7848-7891`, `O/index.html:323-326`). Original, auto-cycle: `DissolvePass` crossfade of two live scenes, 3000 ms (1500 ms when the cycle is < 3 s) (`O/main.js:6881-6884`, `:6979-7028`). Kit: `DissolvePass` 0.8 s smoothstep on every `setScene` (`K/engine/engine.js:29`, `:94-123`). During a dissolve both scenes `update()` and render (`K/engine/post-shaders.js:516-524`).
- **Auto-cycle.** `every`: off, 2.5 s … 30 min, or 4/8/16/32 bars; `what`: presets (shuffled bag, no repeat until all played) or scenes (the `x` shuffle). Bars come from a kick-grid clock (80–160 bpm fold, 2 s per bar with no steady beat; change on a bar-closing kick) or the DAW transport. Any click or key skips the next change. Never stored; off each session (`O/main.js:6860-6920`, `O/lib/cycle.js:1-45`).
- **Shuffle / swap.** `x`: new scene (not current, not heavy, not the shader scene) + random palette, macros kept (`O/main.js:7083-7097`). `b`: ping-pong to the previous look through the morph (`O/main.js:7074-7078`).
- **Multi-window.** Control page + Output window (`?output`, key `O`), synced over the host wire; preview can be turned off while the output runs (`O/index.html:970`, `O/main.js:7144`, `O/../report.md:251`).

## §4 Post chain
Kit order (`K/engine/engine.js:47-60`): renderPass → edgeAA → dissolve → layer → mirror → feedback → bloom → lens → finish. The original adds emblem and text passes: layer → emblem → mirror → emblem3d → text → feedback → bloom → lens → emblemClean → finish → emblemAfter → textClean (`O/main.js:2651-2712`). Ours has no global chain: a scene is ≤ 4 layers, each a generator + an effect list, composited with a blend (`W/gl/live.ts:1-9`), then one fade between two scenes and a gain/flash post (`W/gl/engine.ts:202-229`).

| Pass | What it does · params | Closest in ours |
|---|---|---|
| renderPass | Draws the active scene (three.js scene + camera). MSAA per scene (`msaa` samples on the composer targets). `K/engine/engine.js:141`, `:206-210` | `drawScene()` into shot target A (`W/gl/engine.ts:178-189`); scenes draw at output × governor scale (`W/gl/engine.ts:145-149`) |
| edgeAA | Forked FXAA, `uSubpix` 0.85, only on scenes with `edgeAA: true` (the raymarchers), at internal resolution. `K/lib/fx.js:231-260` | none (no FXAA in `web/src`) |
| dissolve | `mix(new, old, uMix)`, the outgoing scene re-rendered each frame into its own target. 0.8 s smoothstep (kit) / 3 s (original auto-cycle). `K/engine/post-shaders.js:494-527` | the director fade: `fade` program between shot A and B by `shot.mix` (`W/gl/engine.ts:213-216`); 13 selectable transitions incl. crossfade (`W/fx/transitions/`, `W/gl/engine.ts:138-143`); timing in `W/director.ts:24-26` |
| layer | Second scene, 4 blends keyed on the palette bg colour, `layerMix`. `K/engine/post-shaders.js:464-491` | per-scene layer composite, blends normal/add/screen/multiply/max/difference/dodge + opacity + person/background mask (`W/gl/live.ts:120-130`, `W/doc.ts:8-13`); no layer that is another whole scene |
| mirror | n-fold symmetry 0..12 (1 = mirror-x, 2 = quad, ≥3 kaleido) with a 0.5 s cross-fade between fold counts (`stepSym`); `tiles` n×n mirror-repeat with a critically damped log-spring (`stepTiles`); `twist` radial vortex; `slice` shear slabs; rotation `spin·0.12·(0.5+mids)`; skipped when all off. `K/lib/fx.js:9-30`, `K/engine/post-shaders.js:155-198`, `K/engine/engine.js:151-169` | per-layer effects `isf/Mirror`, `isf/Kaleidoscope`, `isf/Kaleidoscope Tile`, `own/polar` (`W/fx/isf/`, `W/fx/own/`); no fold-count fade, not global |
| feedback | Warped frame history, half-float: `persist` (≤ .975, × trails·2), zoom (+ kick·heat push unless `steady`), rotate & swirl by spin·mids·chaos, wobble by chaos·sub, tint toward palette mid. `K/lib/fx.js:133-230`, `K/engine/engine.js:171-188` | per-layer `own/feedback-zoom` (MilkDrop-style, onset-punched zoom), `own/td-feedback`, `own/trails`, `own/diff-feedback`, `isf/Long Exposure`, `isf/Comet Tails`; MilkDrop presets carry their own warp feedback (Butterchurn) |
| bloom | three.js UnrealBloom, threshold 0.3, radius 0.4; strength = (scene `bloom.strength` + energy·`bloom.gain` + kick·`bloom.kick` (default .35)) × `bloomMul` × heat × wet. `K/engine/engine.js:57`, `:190-197` | dual-filter bloom `createBloom()` used inside natives (orb, particles, …) (`W/gl/bloom.ts:1-4`, `:44`); `own/bloom` as a layer effect |
| lens | One pass after bloom, 7 styles: glass ribs (44 vertical flutes), glass fan (flutes from bottom centre), anamorphic (breathing squeeze + x streak flares), melt (downward runnels, kick heat plumes in 6 ripple slots), glitch (slice tears re-rolled per kick), pixels (fixed LED-wall grid, posterized, kicks light it), fly eye (hex lenslets). `lens` 0..1 amount, prismatic edge dispersion; kicks re-seat the material, "never a flash". The header comment still lists older styles (water, crystal). `K/engine/post-shaders.js:265-462`, `K/engine/engine.js:199-224` | by file name only: `isf/VHS Glitch` (glitch), `isf/Pixellate`, `own/mosaic`, `own/led-grid` (pixels); none for ribs/fan/anamorphic/melt/fly eye ⚠️ unverified beyond file headers |
| finish | Chromatic aberration (r/b offset ∝ `aber`·.22 + kick·`aber`) × heat; gain = `brightness` × adaptive exposure (original only); soft tonemap `c /= 1 + luma·0.9`; vignette `1 − vig·r²·2.4`; film grain 0.028 (held during a take); faithful-photo path; trial watermark (`uMark`). `K/engine/post-shaders.js:202-263`, `K/engine/engine.js:232-246` | `postFor()` gain (heat +25 %, beat strobe ≤ .15, WCAG ≤ 3/s) and drop flash toward white (`W/gl/post.ts:26-33`), drawn as blended tints (`W/gl/engine.ts:217-228`); `isf/Chromatic Aberration` per layer; vignette inside some natives; no grain, no tonemap pass, no auto-exposure |
| adaptive exposure (original) | Servo τ ≈ 2.5 s on the final frame's luminance: washout → pull down, hot → ease down, muddy + loud → ease up ≤ 1.35×. `O/main.js:2361-2381` | none |

## §5 Comparison table
Gap size: S = a few files, no new concept; M = a new module or a new data field; L = a new subsystem or a data-model change.

| Their feature | Ours | Gap |
|---|---|---|
| **UI** | | |
| One tune panel, 6 tabs, shift-click to open several | effects panel with 2 tabs `Scene` / `Sources` (`W/ui/Panel.tsx:539-577`) | S |
| Pinned header: scene · mode, preset, "modified", update / save copy / revert | `SceneHead`: name, Save, Save as… (`W/ui/Panel.tsx:394-460`); undo/redo of edits (`W/undo.ts:1-4`); no "modified" flag | S |
| Scene browser: thumbs, number, search, launch rail, favourites, look count | editor library: baked live stills + hover preview, search, views All / ★ Favourites / Trash / Rework, rotation on/off (`W/editor/Library.tsx:9-122`, `W/editor/tiles.ts:1-5`, `W/library.ts:16-22`) | S |
| Preset browser with per-preset thumbs, folders, filters | missing (no visual presets; §2) | L |
| Panel placement right / left / float, size 0.75–1.25 | fixed right column (`W/ui/panel.css:4-23`) | S |
| HUD chip bar (scene ‹ ›, palette, shuffle, frame, shot, output, rec) | top bar: source, CLIP, camera, scene name, Editor · L, BPM, Lock, quality badge, REC + file transport (`W/ui/Overlay.tsx:28-112`) | S |
| Shortcut card (first run, `H`) | missing | S |
| Keys 1–9 scene, ←/→, Tab, P, X, N, L, B, A, S, O, C, G, H, D, F, R | L editor, E panel, Esc, ←/→, Space hold, T tap, [ ] halve/double, , . nudge, B downbeat, P play, −/= skip, F fullscreen, Q quality, R rec (`W/app.ts:127-205`) | S |
| MIDI learn (CC → 43 targets; key/pad → scene or preset) | missing (`agents/backlog.md:18`, no `requestMIDIAccess`) | M |
| Right-click row menu (lane / macro / MIDI) | per-param audio binding UI (`W/ui/Panel.tsx:89-213`) | S |
| Canvas drag gestures on scene params | missing | S |
| Double-click slider = default | missing (no `onDoubleClick` in `W/ui`, `W/editor`) | S |
| **Config** | | |
| Global macros react / chaos / trails / heat over all scenes | missing as user knobs; heat comes from the song shape (`W/gl/post.ts:20-33`); Auto-style overlay on sources (`W/gl/engine.ts:199-201`) | M |
| Global post params (`BASE_POST`) + per-scene `FX_DEFAULTS` | missing; post lives per layer in each SceneDoc | L |
| 24 palettes × 5 shared slots, morph 1.8 s, hue drift, image palette | missing as a global system; colours are per scene/shader (`W/scenes/builtin.ts:223`, `:428`) | L |
| Preset = full look JSON; 173 factory; user presets + folders | SceneDoc in IndexedDB + one JSON library file (`W/library.ts:1-4`, `:201`; `W/doc.ts:13-14`); a user scene plays the role of a preset | M |
| Preset morph 0–2000 ms | missing (scene change = transition fade only) | M |
| Randomize scene / look / layer + undo | missing | M |
| Preset guard (colour/URL/proto scrub) | doc validation on import (`W/doc.ts:23`, `fail()`) ⚠️ scope not compared | S |
| Input EQ window (20 Hz–20 kHz) | Sources tab: genre preset, Auto-style, custom bands with gain/mute (`W/ui/SourcesTab.tsx:92-160`) | S |
| Timeline / projects (automation lanes per track) | missing (`agents/backlog.md:20`, set list "groundwork") | L |
| **Multi-scene** | | |
| Layer = a second whole scene, 4 palette-keyed blends | 1–4 layers inside one scene, 7 blends + masks (`W/doc.ts:8-13`, `W/gl/live.ts:120-130`); no whole-scene layer | M |
| Layer at half pixels, main keeps 0.8 budget | per-layer `res` 0.25..1 (`W/ui/Panel.tsx:361`); global governor (`W/quality.ts:1-40`) | S |
| Manual switch 240 ms dip; auto 3 s dissolve; kit 0.8 s | director fade over 1 bar (confident) or 2 s; 13 transitions (`W/director.ts:24-26`, `W/gl/engine.ts:138-143`) | — (have) |
| Auto-cycle by seconds or 4/8/16/32 bars, presets or scenes | autopilot: 16 bars per shot on a confident beat, else 30 s (`W/director.ts:24-26`); playlist = library list (`W/app.ts:55-62`) | S |
| pixelBudget per scene + gpuFactor boot probe | governor on frame time: 3 modes, scale steps, GPU timer per scene (`W/quality.ts:1-40`, `W/gl/engine.ts:155-176`) | S |
| Steady pacing (hold k refreshes) | missing (grep for pacing/cadence: no frame-hold logic in `W/`) | S |
| Output window + preview off | missing (no `window.open` in `web/src`) | M |
| **Post** | | |
| edgeAA (FXAA) | missing | S |
| mirror / tiles / twist / slice with fold fades | per-layer ISF kaleido/mirror effects | M (to make global) |
| feedback (persist/zoom/swirl/wobble) | per-layer feedback effects + MilkDrop | M (to make global) |
| bloom with per-scene strength/gain/kick | `createBloom` in natives, `own/bloom` effect | S |
| lens rack, 7 styles | glitch/pixel-type effects only | M |
| finish: aberration, tonemap, vignette, grain, AE | gain + flash post (`W/gl/post.ts`), per-layer aberration | M |
| emblem / text layer | missing (`agents/backlog.md:17`) | M |

## §6 Look
**Original (tokens `O/index.html:31-62`; lil-gui skin `O/index.html:431-466`; console skin `O/lib/menu-lab-skin.js:1-30`).**
- Layout: a full-height glass strip flush to the right edge (`--panel-w: clamp(220px, 30vw, 300px)`), a hairline on its left (`O/index.html:62`, `:459-462`); optional left / floating card with 12–14 px radius (`O/lib/menu-lab.js:28-48`). Bottom centred HUD plate of chips; top-left status dot; full-screen browsers as an opaque card (`#0a1016`, radius 14 px, 56 px top bar, left rail) over a 60 % dark scrim (`O/lib/menu-lab-scenes.js:8-40`).
- Colours: bg `#030608`; ink `#f2f4ee`; dim `rgba(196,208,212,.62)`; faint `.4`; accent cyan `#6fd0e0` (+ soft .3 / faint .1); panel `rgba(6,10,14,.92)`, panel-deep `.95`; chip `rgba(196,208,212,.07)` / hover `.15`; line `rgba(111,208,224,.16)`; warn `#d64a4a`; automation amber `#d6a82f`; menu plate `#0d1620` (`O/index.html:31-58`). Console skin: glass `rgba(7,11,15,.78)`, well `rgba(255,255,255,.045)`, edge `.08`, key `rgba(111,208,224,.42)` (`O/lib/menu-lab-skin.js:20-28`). Rule: "cyan means state (on, loaded, modified), never decoration" (`O/lib/menu-lab-skin.js:10`).
- Typography: three self-hosted fonts — Inter (body/labels), Space Grotesk (display: wordmark, browser titles, uppercase letterspaced 0.16–0.22 em), JetBrains Mono (numbers, keys, counts, folder titles 10 px letterspaced 0.1 em) (`O/index.html:16-30`, `:59-61`, `:770-776`; `O/lib/menu-lab-skin.js:6`, `:78`). All panel labels lowercase, no caps (`O/main.js:10929`).
- Density: lil-gui rows 22 px, font 12.5 px, spacing 4 px, 12 px side padding, label column 36 % (`O/index.html:448-457`); a 4 / 8 / 12 px spacing grid (`O/lib/menu-lab-skin.js:11`). No hover boxes on rows; hairlines between rows, inset from both edges (`O/index.html:524-530`).
- Controls: slim 4 px rounded slider track with an accent fill and a 3×11 px ink playhead that grows on hover (`O/index.html:577-600`); bipolar sliders fill from the centre (`:624`); selects as chip buttons with an accent chevron (`:672`); buttons as chips, one "primary" (randomize) (`:715`); booleans as real switches (`:748`); chevron carets via SVG mask with a soft accent glow (`:780-790`). A beat dot (6 px accent, glows on beat) and an fps readout sit in the panel title (`O/lib/menu-lab-skin.js:79-81`).
- Motion: visible keyboard focus everywhere and `prefers-reduced-motion` honoured with near-zero durations (`O/index.html:898-910`); grids are display toggles (`O/index.html:157`).

**Kit (`K/styles.css`).**
- Tokens `K/styles.css:1-9`: bg `#030608`, ink `#e8eef0`, dim `#8a97a0`, chip `rgba(196,208,212,.08)`, line `.14`, accent **teal `#2fd6a8`** (not the original's cyan), glass `rgba(8,12,16,.82)`.
- Panel `K/styles.css:21-34`: 264 px card, top/right 14 px, radius 10 px, `backdrop-filter: blur(14px)`, shadow `0 12px 40px rgba(0,0,0,.5)`. Sections: 10.5 px dim labels with a top hairline (`:46-53`). Row: 74 px label column, flexible range, 34 px tabular value (`:55-58`). Range: 3 px track, 11 px round ink thumb, accent on hover (`:60-75`).
- Palette cards 4 per row, 26 px high, 120° gradient of the 5 slots, active = 2 px accent outline (`K/styles.css:113-121`, `K/ui/EffectPanel.jsx:199-205`). Scene grid: blurred 72 % scrim, `auto-fill minmax(170px,1fr)` cards with a 96 px thumb and 13 px bold name (`K/styles.css:133-157`).
- Fonts named but not bundled in the kit: Inter, SF Pro Text, Space Grotesk fall back to system UI (`K/styles.css:17`, `:38`).

**Ours, for contrast.** `W/ui/panel.css:4-23`: 292 px column at top 58 / right 14, `#0b0b0bf0` solid (no backdrop blur on purpose, to save GPU), border `#ffffff17`, radius 10 px, 12 px text, grey native sliders (`accent-color: #bdbdbd`). `W/ui/overlay.css:1-36`: system-ui 13 px, text `#d8d8d8`, a top bar over a black gradient that fades item by item when idle. No accent colour token, no custom fonts. implication: the donor's glass panel uses `backdrop-filter: blur`, which our panel avoids for frame cost (`W/ui/panel.css:15`).
