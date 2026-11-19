# Donor scan: `donor/vs3/` scenes (three.js visual engine, 38 scene files)

## TL;DR
- 38 scene files, ~20.9 k lines (`visual_kit/src/scenes/*.js`). 32 are in the original ROSTER, plus `shader` (panel-only). The other 5 are dormant: aurora ("veil"), blob ("bloom"), flow ("drift"), fract, echo (`renderer/main.js:88-125`; `report.md:166-169`). The two copies are identical apart from import specifiers, asset URLs and CRLF line endings (§0). Either copy works as the port source; the kit copy uses bare `three` imports.
- Every scene is a three.js `{ scene, camera, params, update(s,dt,t), resize }` object (`ink.js:86-121`). It colours itself from the shared mutable `PAL` slots and leans on the engine's post chain: mirror → feedback → bloom → lens → finish (`engine.js:1-12`). The services it uses are `PAL`, `drastic`, `scenePointer`, `particleSprite`/`glowPointsMaterial`, `NOISE_GLSL` and `ctx.renderer` (§1).
- Our app already runs three r187 on OUR WebGL2 context, rendering into a render target that a native composites (`web/src/three/host.ts`, `web/src/scenes/model.ts`) (§3b).
- 14 scenes are full-screen fragment shaders (7 of them raymarchers). These are the cheapest ports: GLSL plus a small CPU update. 11 run multipass render-target work (their own sims, or recursive-flight). 9 are three.js mesh/particle scenes. 4 need binary assets: chorus, visage, limitless 3d, main stage (§2).
- The lowest-difficulty, asset-free batch (§6): ink, mandala (kaleido), tendril, relic, citadel, descent, oracle, idol. ink and mandala get their thumbnail look from engine mirror and feedback (§5).

## Freshness
- Scanned 2026-11-19. Donor: kit `visual_kit/package.json` v1.0.0, `three` 0.170.0 (L15). The original vendors three r170 (`renderer/vendor/three/build/three.module.js:6` `REVISION='170'`). App v0.4.3 (kit README).
- Our side: master `6cfffb6`, `three` 0.187.0 installed (`web/node_modules/three/package.json`). The exports keep `./examples/jsm/*` and `./addons/*`.
- Read: kit README (all); `lib/context.js`, `lib/common.js`, `engine/engine.js`, `engine/scenes-index.js`, `engine/post-shaders.js` L14-200, `core/analyzer.js` L44-62 and L425-504, `scenes/ink.js` (all), `relic.js` L150-224, `limitless.js` L1-125, the export blocks of the others (by grep), the original `main.js` ROSTER, `applyScene` and `FADE_KEYS`. The 35 thumbnails were viewed as a 240×150 contact sheet built in `/tmp`, not in the repo.
- Not read: the scene bodies beyond grep (imports, `new THREE.*`, `s.*`, export fields, `ctx.*`); `laser-stage.js` / `limitless3d-stage.js` internals; `report.md` beyond L160-175.
- Prior scan `research_donor_visual_system_2.md` covers a different app (GLSL `.synScene`). Its port path is our `fx/syn.ts`. Licence findings are skipped (user permission). Provenance: each asset folder carries a `LICENSE.txt` (`public/vendor/{models,visage,lasers}/LICENSE.txt`). The kit README names FaceKit (MIT) for `visage/head*.bin`. `shader-examples.js:1-5` lists 7 MIT/CC0 Shadertoy examples with their headers.

## §0 Kit copy vs original copy
- `diff --strip-trailing-cr` over all 38 scenes. The only changes are `import * as THREE from 'three'` (kit) vs `'../vendor/three/build/three.module.js'` (orig), the same for `three/examples/jsm/postprocessing/Pass.js`, and the asset URLs `vendor/visage/*.bin` vs `../vendor/visage/*.bin` (`chorus.js:48-50`, `visage.js:403`). Five files have 0 diff lines (crystal, lasers, limitless3d, pearl, spiral: they import three only through libs). The original files use CRLF line endings.
- The `lib/` modules are the same: import paths only (`fx.js`, `model-load.js` loaders L113-156, `model-scans.js` fflate, `model-shapes.js` BufferGeometryUtils, `common.js`, `palette.js`, `laser-stage.js`, `recursive-flight.js`, `limitless3d-stage.js`).
- **Kit deviations live outside the scenes.** (1) The kit `App.jsx:27,135` never applies FX_DEFAULTS `mirror`/`spin`/`vignette` on a scene switch. The original `applyScene` applies every FX_DEFAULTS key, except keys the user is holding or wrote during the fade (`main.js:7797-7800`). (2) `kickAttack` is declared by `limitless.js:997`. The original reads it per scene (`main.js:15649`). The kit wires it nowhere: `analyzer.js:219` `cfg.kickAttack` stays 0. (3) The kit has no `SCENE_PALETTE` (original `main.js:7780`: morphogen→pearl, main stage→vapor, morphogen 2.0→glacial).
- implication: the scene source is equal in both copies; take engine-side look facts (§5) from the original `main.js`, not from the kit `App.jsx`.

## §1 Scene contract and engine services
**Export fields** (default-export object; `ink.js:86-121` is the README's example):
- `name` is the roster key. FX_DEFAULTS, LATE_TRAILS and `layer` match on it (`engine.js:131,179`; FX_DEFAULTS via `App.jsx:133`). `scene: THREE.Scene` and `camera`: an ortho camera (-1..1) for full-screen quads, a perspective camera for 3D.
- `params`: flat 0..1 sliders, 0.5 = default, scaled by `drastic(p) = 4^((p-.5)·2)` (`common.js:6`). Optional `paramLabels`, `paramOrder`, `modes: string[]` (`params.mode` picks one).
- `update(s, dt, t)` runs every frame for the active scene, the outgoing scene and the layer scene (`engine.js:113-114,134`). `resize(w,h)` gets CSS px; most scenes set only `uAspect` (`ink.js:118`).
- `bloom: {strength, gain, kick?}`: UnrealBloom strength = (strength + energy·gain + kick·(bloom.kick ?? 0.35)) · bloomMul · heat · wet (`engine.js:193-196`). Threshold 0.3 (`post-shaders.js:200`).
- `edgeAA: true` enables the FXAA fork (`engine.js:226`). `msaa: n` sets composer RT samples (`engine.js:227-231`; only laser-stage, 4, `laser-stage.js:1515`).
- `fxHint: {mirror?, persist?, steady?}` overrides the look keys; `steady` drops the kick zoom and the wobble (`engine.js:153,180-186`; only laser-stage `{steady:true}`, L1517).
- `fxWet()` scales every global effect (only limitless, `limitless.js:1126`, = params.tilt). `grain` sets the finish grain multiplier (`engine.js:243`; lasers 0, recursive-flight 0).
- `trails: bool`: the kit engine never reads it (grep `engine.js`). `pixelBudget` (MP): the original downscales by it; the kit renders at full size (README "Чего нет"). `kickAttack`: see §0.
- The renderer is `antialias:false`; DPR is capped at 2 (`engine.js:35,73`).

**Signal object `s`** (built in `analyzer.js:443-460`, scaled by REACT at L463-473):
- `bands[8]`: centres 60·2^k Hz, peak-normalised, × the listen window.
- `sub` = bands[0]. `kick` = kickPunch envelope (attack 1 ms, release 0.14 s, ≤1.2). `mids` = mean(bands 2-4). `highs` = mean(bands 5-6). `air` = bands[7]. `energy` = band energy × loudness (≤1.1). `loud`.
- `onKick`, `onMid`, `onHigh`: one-frame onset impulses, `min(1, 4·(fast−slow))`, with a refractory gap (`analyzer.js:48-60`). `onKick` is × kick velocity (L403).
- `spec[30]` (50·1.22^i Hz). `specHi[192]` (35 Hz-18 kHz log display bins). `wave {l, r}` (stereo Float32Array).
- The engine reads `s.mids, s.kick, s.sub, s.energy, s.onKick, s.highs` (`engine.js:160-208`).

**Engine services the scenes import:**
- `lib/common.js`:
  - `PAL`: 5 mutable `THREE.Color` slots bg/shadow/mid/accent/glow (L10-16). Scenes pass them by reference as uniform values (`ink.js:22-26`), so a palette morph recolours with no per-frame code. `palette.js` has 24 palettes × 5 slots; the default is `nocturne` (`palette.js:16`).
  - `drastic` (L6).
  - `glowPointsMaterial()`: additive point sprites with per-vertex `aSize/aAlpha/aColor` (L20-48).
  - `particleSprite()`: a 64 px radial canvas texture (L122-135).
  - `scenePointer`: global NDC pointer, `held`, Shift+Space detach; window listeners filter `target.id === 'scene'` (L69-120).
- `lib/context.js:8` `ctx = { renderer, scenes, factoryPresets, gpuFactor:()=>1, logo, pickLogo }`. Scenes also read undeclared fields, all guarded with `?.` or `if`:
  - `ctx.renderScale`, `ctx.macros`, `ctx.emblemUniforms`, `ctx.emblemOn` (laser-stage only, L1616-1822);
  - `ctx.applyPixelBudget`, `ctx.renderFrozen`, `ctx.glLost` (shader only, L438-500).
  - `ctx.renderer` has 77 uses: the sims call `setRenderTarget`/`render` themselves (§3b).
- `lib/noise-glsl.js` (48 lines, `snoise`), prepended to fragment sources (`ink.js:36`). The kit README says ctx carries macros; `context.js:8` declares none, and only laser-stage reads `ctx.macros` (guarded, `laser-stage.js:1822`).

## §2 Inventory (38 files)
Sources:
- Counts: `wc -l`; `grep -c` of `new THREE.ShaderMaterial|Points|Mesh|InstancedMesh|Line`, `WebGLRenderTarget`, `new FullScreenQuad`, `PlaneGeometry(2,2)`.
- Audio: `grep -o 's\.<field>'`; for lib-driven scenes, the lib's own `update`.
- Export fields: grep. Look: the thumbnail (`visual_kit/public/vendor/thumbs/<roster-name with - for spaces>.jpg`; 35 files incl. retired `drift.jpg` and `echo.jpg`; no thumbnail for aurora, blob, fract).

Legend:
- Kind: **FS** = one ShaderMaterial on `PlaneGeometry(2,2)` + ortho camera; **RM** = raymarch; **RT** = own render-target sim through `ctx.renderer` + `FullScreenQuad`; **P** = Points; **M** = meshes; **I** = InstancedMesh.
- Libs: every row imports `three`. `PAL` + `drastic` unless noted; `nz` = noise-glsl; `ptr` = scenePointer; `spr`/`gpm` = particleSprite/glowPointsMaterial; `ctx` = context.js.
- Audio: oK/oM/oH = onKick/onMid/onHigh; k kick; sb sub; m mids; h highs; a air; e energy; sH specHi; w wave.
- Post: the scene's `bloom` strength/gain[/kick], flags, and the notable FX_DEFAULTS entry (full rows in §5).
- Diff (difficulty): 1 = one FS shader with a small update; 2 = FS/RM with more CPU state or uniform arrays; 3 = one sim or custom particles; 4 = several passes, 50 k+ instances or a big lib; 5 = binary assets plus a big lib.

| file (roster name) | lines | kind | libs | assets | audio | post / flags | diff · reason |
|---|---|---|---|---|---|---|---|
| anemone | 428 | P (1 SM) bead rings on a tilted plane | ptr | – | oK oH e m sb | .32/.35 · modes bloom/vortex/braid/veil · persist .72 | 3 · custom point shader + modes + pointer |
| aurora ("veil", dormant) | 114 | M+P noise ribbons (built-in materials) | nz spr | – | a e h k m sb | .28/.35 | 2 · small; not in ROSTER, no thumb |
| blob ("bloom", dormant) | 108 | M+P blob + particle shell | nz spr | – | a e h k m sb | .3/.45 | 2 · small; not in ROSTER, no thumb |
| chorus | 1092 | M+I (3 I, 5 SM) 20 carved heads | ptr nz | `vendor/visage/head_lo.bin` 372 KB, `head.bin` fallback (L48-50) | e h k | .3/.35/.04 · edgeAA · pB 4 | 5 · asset + 1 k lines |
| citadel | 233 | FS RM Mandelbox lattice | – | – | oK e h k m sb | .22/.3 · edgeAA · pB 1.3 | 2 · RM + gated random walk on kicks |
| crystal | 570 | RM via `recursive-flight` (split passes, float RTs, hull meshes) | recursive-flight (498) | – | oK e h (lib L472-489) | lib .16/.16 · edgeAA · grain 0 · LATE_TRAILS .8 | 4 · multipass lib |
| descent | 245 | FS RM Menger room | descent-motion (20) | – | oK e h | .18/.22 · edgeAA · pB 1.2 · modes multicolor/tonal · persist 0 | 2 · 3 RM loops |
| echo (retired) | 131 | P+M kick rings (PointsMaterial) | spr | – | oK oM oH a e k sb | .32/.32 | 2 · small; retired |
| flow ("drift", retired, `main.js:95`) | 191 | 2 P comets in a flow field | spr gpm | – | oK oM oH e k m | .45/.5 | 2 · CPU particles |
| fluid | 652 | RT Navier-Stokes + P | ctx | – | oK oH e k m sb | .4/.45 · persist .4 | 4 · multipass sim (we have `native/fluid`) |
| forge | 733 | RT boids ping-pong, 65 k shards | ctx | – | oK a e h k m sb | .4/.4 | 4 · GPGPU + instancing |
| fract (dormant) | 307 | FS Julia dive, CPU steering | – | – | oK e h k m sb | .35/.4 | 2 · 89-line steering update; no thumb |
| gate | 481 | FS RM A-frame corridor | – | – | oK e h k m sb | .12/.15 · edgeAA · pB 1.5 | 2 · 28 uniforms, 108-line update |
| grove | 1313 | M+I (6 I, 8 SM) fractal forest; baked canvas ground (L155) | ptr ctx | – | oK oH e m sb | .28/.38 | 4 · 1.3 k lines of procedural geometry |
| idol | 269 | FS RM Mandelbox mandala | – | – | oK e h k m sb | .22/.3 · edgeAA · pB 1.3 | 2 · RM + gated walk |
| ingot | 350 | FS RM chrome blades | – | – | oK e h k m sb | .18/.25 · edgeAA · pB 2 | 2 · 28 uniforms, 97-line update |
| ink | 121 | FS domain-warped fBm | nz | – | oK k sb m h e | .22/.3 · pB 5 · mirror 2, persist .97, zoom 1.11, aber 4 | 1 · one shader, 19-line update |
| kaleido ("mandala") | 121 | FS kali fractal | – | – | oK e h k m sb | .35/.5 · mirror 9, persist .75, zoom 1.29, spin −.8, bloomMul 2.5 | 1 · one shader, 20-line update |
| lasers ("main stage") | 24 + laser-stage 1907 + laser-rig 657 | M laser room, haze volume; its LED wall renders another roster scene (`laser-stage.js:1454-1469`) | laser-stage laser-rig ctx | `vendor/lasers/plants.bin` 268 KB (`laser-stage.js:968`) | oK e k sb bands | .26/0/0 · msaa 4 · fxHint steady · grain 0 · pB 3.7 · palette vapor | 5 · 2.6 k-line lib + asset + `ctx.scenes` |
| limitless | 1294 | FS image filter, 21 modes (L70-72), sim ping-pong, 3D terrain sub-scene | nz ctx KickRise | procedural `defaultPhoto()` canvas (L82-99); user photo/video optional | oK k sb e h m | .3/.35 · fxWet · kickAttack · persist .85 | 4 · 21 modes; acts as a filter |
| limitless3d ("limitless 3d") | 66 + stage 1276 + model-* 840 | M models, 6 modes (L49) | limitless3d-stage model-shapes/-scans/-load | `vendor/models/{skull,hand,bust}.lm3d` 1.2 MB (`model-scans.js:87`) | oK e h k m sb (stage) | .25/.3 · edgeAA · pB 3.5 | 5 · assets + 2 k-line lib |
| locus | 1610 | RT particle formations (34) + 2 P | ptr ctx | – | oK e h k m sb | .42/.45/.06 · persist .45 | 4 · GPGPU + 1.6 k lines |
| morphogen | 525 | RT Gray-Scott + FS display | ptr ctx | – | oK e h k sb | .14/.06/.05 · palette pearl | 3 · one RD sim |
| morphogen2 ("morphogen 2.0") | 1280 | RT RD lit relief | ptr ctx (`ctx.logo/pickLogo` L902-1032) | – (optional logo) | oK e h sb | .12/.05/.04 · grain · modes · pB 3.7 · palette glacial | 4 · sim + DOM UI (11 refs) |
| oracle | 250 | FS RM pseudo-kleinian | – | – | oK e h k m sb | .22/.3 · edgeAA · pB 1.5 · mirror 1 | 2 · RM + gated walk |
| pearl | 443 | RM via recursive-flight | recursive-flight | – | oK e h | as crystal | 4 · multipass lib |
| pelt | 691 | RT brush + ~110 k instanced ribbons | ptr ctx | – | oK oH e h m sb | .22/.25 | 4 · the mouse brush is the concept |
| relic | 228 | FS RM Mandelbulb | – | – | oK e h k m sb | .22/.3 · edgeAA · pB 4 | 2 · RM + gated power walk (L177-224) |
| sand | 404 | FS Chladni; `uModes[K]`, `uPhi[K]` picked from specHi peaks (L104-105) | – | – | oK oM e h sb sH | .25/.35 | 3 · needs a 192-bin log spectrum |
| shader (panel-only) | 672 | FS RawShaderMaterial: user Shadertoy GLSL, 7 bundled examples, localStorage, DOM | ctx shader-examples | – | w sH a e h k m oK sb | .2/.3 · edgeAA | 2 · our toy path does the same job (§3) |
| signal | 943 | mixed: 6 lines, 2 P, 3 M, data textures; modes analyzer/waterfall/scope/vector/lissajous (L592) | – | – | oK e h k sb sH w (stereo, L624) | .3/.4 · persist .25 | 4 · 5 modes, 326-line update |
| spacetime | 333 | FS light-ray streams, `uHero[HERO_MAX]` CPU array (L62) | – | – | oK e h k m sb | .42/.65 · modes forward/reverse · persist .55 | 2 · uniform array |
| spiral | 233 | RM via recursive-flight | recursive-flight | – | oK e h | as crystal | 4 · multipass lib |
| synapse | 199 | P + lines node constellation | gpm | – | oK oM oH e h k m | .5/.45 · mirror 1, persist .9, spin .8 | 2 · small CPU graph |
| tendril | 203 | FS Julia orbit-trap tubes | – | – | oK e h m sb | .3/.4 · pB 1.5 · modes | 1 · one shader, 26-line update |
| vesica | 972 | M+P compass strokes | ctx vesica-geometry (599) | – | oK oM oH e h m sb | .3/.45 · 7 modes (L600) | 4 · 1.6 k lines incl. lib |
| visage | 2083 | M (11 M, 10 SM, 1 I) living carved head | ptr nz | `vendor/visage/head.bin` 1.47 MB (L403) | oK e h k m sb | .3/.35/.04 · edgeAA · pB 4 | 5 · asset + 2 k lines |
| wisp | 1046 | RT + 2 P + lines particle creature | ptr spr ctx | – | oK(15) oH e h m sb | .4/.45 · pB 2.2 · persist .5 | 4 · sim + 1 k lines |

Looks (thumbnails): ink is blue quad-mirrored smoke. mandala is a dark kaleido starfield. relic is a blue Mandelbulb. citadel is a blue lattice city. idol is a white/teal star carving. oracle is a dark ornate temple. gate is a teal triangle corridor. ingot is a white chrome blob. tendril is grey orbit-trap filaments. descent is a purple/orange Menger room. spacetime is green/orange light streaks. sand shows faint Chladni lines. fract and the dormant files have no thumbnail.

## §3 Port paths into our app
**(a) GLSL rewrite. Our shader paths:**
- `syn/*` (`fx/syn.ts:1-12`): GLSL 330 → ES 3.00, multipass `PASSES` with self-feedback, inputs fed by bindings. The donor `script.js` never runs; its clocks are restated as data in `VJW_CLOCK` (`syn.ts:8-10,150`; `Clock` at `fx/types.ts:23`).
- `own/*.fs` / `isf/*.fs` ISF (`fx/catalog.ts:30-36`, ES 1.00 `fx/isf.ts:148`).
- Shadertoy toy: a `mainImage` paste → ES 3.00 (`fx/glsl.ts:63-65`, `catalog.ts:68-76`). Its `iChannel0` is the 512×2 audio texture (FFT row and wave row; `gl/live.ts:78-86`). That is the same contract as the donor `shader` scene (`shader.js:1-5`).

Donor full-screen shaders are three `ShaderMaterial`s: WebGL1-style `gl_FragColor`/`texture2D`, which three rewrites to GLSL3 (`node_modules/three/src/renderers/webgl/WebGLProgram.js:779`). Their state lives in a JS `update`:
- smoothed accumulators (`phase += dt·…`);
- gated random walks on `onKick`: `Math.random` + a `t − lastJump > 3.2` gate in relic, citadel, idol, oracle, gate, ingot, spacetime, sand, descent (grep counts; `relic.js:194-201`);
- CPU-built uniform arrays (sand `uModes[K]`, spacetime `uHero[]`).

The syn/ISF paths have bindings and linear clocks, but no per-frame script.

**(b) three.js inside our pipeline. It already exists:**
- `web/src/three/host.ts` runs three r187 `WebGLRenderer({ canvas, context: gl })` on OUR WebGL2 context (L145). It is lazy, via a dynamic `import('../three/host')` (`scenes/model.ts:21`).
- It never sizes the canvas. It renders only into `WebGLRenderTarget`s, where r187 neither tone-maps nor encodes sRGB (L1-7).
- Every GL-touching call runs in `guard()`: `resetState()` before and after, then a restore of a tuned key list (L124-140, `RENDER_LIST` L31). The comment on L29-30 says: "A material with more samplers touches more units: re-run the S1-T diff".
- The RT colour texture is handed over through `R.properties.get(rt.texture).__webglTexture` (L190; undocumented, pinned to r187). `native/model` composites it with ACES + sRGB, assuming premultiplied linear (`model.ts:29-40`), and declares `alpha: 'straight'` (L49).
- `load()` is coupled to one GLB URL and one scene graph (L121). three is untyped (`three/three.d.ts:3-4`).
- Donor scenes, by contrast:
  - output display-referred colour from raw `ShaderMaterial` (no `colorspace_fragment`; built-in materials appear only in aurora, blob, chorus, echo, flow, signal, synapse, visage and the model libs);
  - run their own RT passes through `ctx.renderer` and then `setRenderTarget(null)` (fluid, forge, limitless, morphogen, morphogen2, pelt, wisp);
  - or restore `getRenderTarget()` (locus, recursive-flight, laser-stage, limitless3d-stage) (grep).
  - In our shared context, `null` is the canvas framebuffer, not the layer's FBO.
- r171-r187 migration notes (three.js wiki Migration Guide) name: MultiplyBlending/SubtractiveBlending needing premultipliedAlpha (r178), `setViewport/setScissor` with an RT bound (r187), `inverseTransformDirection` (r185), `pixelStorei` (r184). A grep of donor scenes/lib finds none of these.
- The donor engine's EffectComposer, UnrealBloomPass, ShaderPass, RenderPass and Pass/FullScreenQuad still ship in r187 (`node_modules/three/examples/jsm/postprocessing/`).

**(c) A TS native with a full-screen program:**
- `NativeDef.create(gl)` → `draw(f, v, src, s: Sources, blend)` (`gl/scene.ts:9,20`) receives every source id per frame. `fullscreenProgram(fs)` (`gl/engine.ts:61-64`) is used by 18 files in `web/src/scenes/` (vortex, orb, tunnel, lasers…; `scenes/orb.ts:1-20` keeps CPU state such as `shatterEnv`).
- The shared bloom is `gl/bloom.ts`. `milkdrop/native.ts` is another native host.
- A native can take a donor fragment shader plus its JS `update` (accumulators, gated walks, uniform arrays) without three.
- Filter-kind natives get the previous layer as `src` (`gl/scene.ts:6-8`). That is limitless's role (it filters a source picture).

**Path fit per scene (facts from §2 kind):**
- (a) or (c), one FS shader: ink, kaleido, tendril.
- (c) native fits better, because of gated random walks / CPU arrays: relic, citadel, idol, oracle, gate, ingot, descent, spacetime, fract. sand also needs specHi (§4).
- `shader`: (a) — our toy path already covers it.
- (c) with multipass RTs, or (b): morphogen, fluid (overlaps `native/fluid`), crystal, pearl, spiral (recursive-flight split passes + hull meshes, `recursive-flight.js:383-443`), limitless (filter, 21 modes).
- (b) three host, or a rewrite of the geometry: anemone, synapse, aurora, blob, echo, flow, signal (overlaps `native/spectrum` / `native/scope`), vesica, grove, forge, pelt, locus, wisp, morphogen2.
- (b) + assets: chorus, visage, limitless 3d, main stage. main stage also renders other roster scenes onto its wall (`laser-stage.js:1454`).

## §4 Audio mapping (donor `s` → our sources)
Our ids: `SOURCE_IDS` (`web/src/bind.ts:34`) and `DONOR_GROUPS` (31 ids, `web/src/audio/donor.ts:51-57`). Donor-mode band edges: all 30-16k, Bass 30-150, Mid 250-2000, MidHigh 2000-6000, High 6000-16000 Hz (`donor.ts:24`).

| donor field (`analyzer.js:443-460`) | definition | nearest ours (definition) | gap |
|---|---|---|---|
| `bands[0..7]` | 0..1, centres 60·2^k Hz (60…7680), 6 s peak-normalised | `band0..band31`: 32 log bands 30 Hz-16 kHz, dB window −75..−15 + tilt (`energy.ts:3`, `bind.ts:66`). `syn_*Level`: 5 bands, 10 s z-score | no 8-band octave set; resample from band0-31 |
| `sub` | = bands[0] (~60 Hz) | `syn_BassLevel` (30-150). `sub` (ours: a sustained kick-gated ratio to a running mean, `features.ts:2-3`) | ours `sub` has different semantics |
| `kick` | kickPunch envelope, attack 1 ms, release 0.14 s, ≤1.2 (`analyzer.js:75`) | `kick`: 1 on a hit, decay τ 0.12 s, 40-150 Hz (`features.ts:16`, `drums.ts:13`) | close match |
| `mids` | mean bands 2-4 (240-960 Hz) | `mid` (320-2800, Butterchurn, `energy.ts:8`), `syn_MidLevel` | ranges differ |
| `highs` | mean bands 5-6 (1.9-3.8 kHz) | `treb` (2800-11025), `syn_MidHighLevel` (2-6 k) | ranges differ |
| `air` | bands[7] (~7.7 kHz) | `syn_HighLevel` (6-16 k), `band~27-31` | – |
| `energy` | band energy × loudness, ≤1.1 | `syn_Level`, `syn_Intensity`. NOT ours `energy` (section level, .5 = track mean, `arrange.ts:25`) | ours `energy` has different semantics |
| `loud` | 30 s-referenced loudness | `syn_InputLevel`, `syn_Level` | – |
| `onKick` | one-frame impulse min(1, 4·(fast−slow)) × velocity, refractory gap (`analyzer.js:48-60,403`) | `kick` hit edge (`FrameInput.onsets`, `frame.ts:9`); velocity ≈ `kickAccent` (0.7 at the kicks' running-mean dB, 1 from +3.1 dB, `donor.ts:39-42`) | no one-frame impulse source; derive from the onset events |
| `onMid` | mid-band onset impulse | `snare` hit (1-5 kHz), `syn_MidHits` | impulse vs envelope |
| `onHigh` | high-band onset impulse | `hats` hit (7-16 kHz), `syn_HighHits` | impulse vs envelope |
| `spec[30]` | 50·1.22^i Hz, linear | band0-31 | no 30-bin array (no scene reads `s.spec`, grep) |
| `specHi[192]` | 35 Hz-18 kHz log display bins, AGC (sand, signal, shader) | `audioTex.fft` 512 linear bins, `audioTex.donor` 512 RGBA (`gl/engine.ts:103-127`) | no 192-bin log spectrum |
| `wave {l, r}` | stereo raw −1..1 (signal L624, shader L639) | `audioTex.waveLR` 512×2 (row 0 L, row 1 R; `gl/engine.ts:103-109`); `audioTex.wave` mono | as textures only, not CPU arrays in `Sources` |
| (REACT macro) | scales every field by react·2 (`analyzer.js:463-473`) | our per-source `gain(sens, mute)` (`bind.ts:79`) | – |

- 35 of 38 files read `onKick` (directly or via their lib); aurora, blob and chorus do not. 10 read `onMid`/`onHigh` (§2 audio column).
- implication: a port picks donor-mode `syn_*` or our drum/band ids per field; no field lacks a stand-in except the one-frame onset impulses, `specHi` and the 8 octave bands.

## §5 Engine-coupled scenes
**The chain** (`engine.js:59-67`): render → edgeAA → dissolve (0.8 s) → layer (2nd scene, 4 blends) → **mirror** → **feedback** → **bloom** → lens (7 styles) → finish (gain/aber/vignette/grain).
- Mirror `uSegments`: 0 off, 1 bilateral, 2 quad, ≥3 kaleido (`fx.js:12`). It runs BEFORE feedback, so the trails are mirrored too.
- Feedback = `max(cur, hist·persist·tint·edge)`, history zoomed/rotated/swirled/wobbled (`fx.js:156-170`). Effective persist = min(.975, persist·min(2, 2·trails)); at the default trails .5 it equals persist (`engine.js:177-179`).
- History zoom per second = (zoom−1 + kick·(.15+.8·heat)·.3)·(.1+1.8·trails) (`engine.js:181-183`). spin drives the rotate and swirl (× mids); chaos·sub drives the wobble (L184-186).
- Kick-driven light: bloom +kick·0.35 unless `bloom.kick` is set (L193-196); aberration +kick·aber (L237). implication: these per-kick global brightness terms fall under our flash gate rule (I-FL1, `post.ts` WCAG 3/s) if ported.

**Our counterparts** (paths only):
- feedback: `own/feedback-zoom.fs`, `own/trails.fs`, `own/td-feedback.fs`;
- mirror/kaleido: `isf/Mirror.fs`, `isf/Kaleidoscope.fs`, `isf/Kaleidoscope Tile.fs`;
- bloom: `own/bloom.fs`, `gl/bloom.ts`;
- aberration: `isf/Chromatic Aberration.fs`;
- lens-like: `isf/Pixellate.fs`, `isf/VHS Glitch.fs`;
- dissolve: `fx/transitions/`.
- There is no vignette effect: `grep vignette web/src` hits only 5 `fx/syn/*.glsl` scenes.

**FX_DEFAULTS** (`post-shaders.js:40-148`, row line in brackets; = original `main.js:167+`; BASE_POST `mirror 0, persist .5, zoom 1.04, spin .5, bloomMul 1, aber 1, vignette .34`, L17-24). Columns: mirror · persist · zoom · spin · bloomMul · aber · vignette. **Bold** = look visibly engine-dependent (mirror ≥1, persist ≥ .5 or zoom ≥ 1.05).

| scene [L] | values | scene [L] | values |
|---|---|---|---|
| **ink** [41] | 2 · .97 · 1.11 · .25 · 1.85 · 4 · 0 | **mandala** [42] | 9 · .75 · 1.29 · −.8 · 2.5 · 1.6 · .8 |
| **limitless** [43] | 0 · .85 · 1.06 · 0 · 1.1 · 2 · .3 | **synapse** [44] | 1 · .9 · 1.06 · .8 · 1.7 · 1.5 · .3 |
| fluid [45] | 0 · .4 · 1 · 0 · 1.3 · 1.4 · .3 | signal [48] | 0 · .25 · 1 · 0 · .9 · .6 · .12 |
| relic [51] | 0 · .35 · 1 · 0 · 1.15 · 1.4 · .5 | citadel [52] | 0 · .35 · 1 · 0 · 1.1 · 1.4 · .45 |
| sand [56] | 0 · .3 · 1 · 0 · 1.5 · 1.2 · .35 | idol [60] | 0 · .35 · 1 · 0 · 1.2 · 1.6 · .5 |
| **oracle** [64] | 1 · .35 · 1 · 0 · 1.4 · 1.4 · .55 | **anemone** [67] | 0 · .72 · 1.03 · .3 · 1.2 · 2.4 · .45 |
| forge [69] | 0 · .35 · 1 · 0 · .9 · .8 · .4 | ingot [73] | 0 · .3 · 1 · 0 · 1.1 · 1.2 · .45 |
| gate [77] | 0 · .3 · 1 · 0 · 1.1 · 1.2 · .55 | **spacetime** [81] | 0 · .55 · 1.05 · 0 · 1.6 · 2.2 · .4 |
| morphogen [86] | 0 · .3 · 1 · 0 · 1 · 1 · .25 | pelt [90] | 0 · .3 · 1 · 0 · 1.1 · 1.2 · .5 |
| **wisp** [95] | 0 · .5 · 1 · 0 · 1.15 · 1.6 · .28 | grove [99] | 0 · .3 · 1 · 0 · 1.15 · 1.2 · .4 |
| descent [101] | 0 · 0 · 1 · 0 · 1.1 · .5 · .3 | visage [105] | 0 · .3 · 1 · 0 · 1.2 · 1.4 · .5 |
| chorus [108] | 0 · .15 · 1 · 0 · 1.2 · 1.2 · .5 | limitless 3d [113] | 0 · .25 · 1 · 0 · 1.1 · 1.2 · .35 |
| vesica [120] | 0 · .08 · 1 · 0 · 1.2 · .6 · .35 | locus [124] | 0 · .45 · 1 · 0 · 1.3 · 1.2 · .4 |
| crystal [127] | 0 · 0 · 1 · 0 · .8 · 0 · .2 | pearl [128] | 0 · 0 · 1 · 0 · .8 · 0 · .2 |
| main stage [132] | 0 · .3 · 1 · 0 · 1 · 0 · .2 | morphogen 2.0 [138] | 0 · .2 · 1 · 0 · 1 · .8 · .05 |
| tendril [141] | 0 · .2 · 1 · 0 · 1.1 · .8 · .35 | spiral [143] | 0 · 0 · 1 · 0 · .8 · 0 · .2 |
| shader [146] | 0 · .2 · 1 · 0 · 1 · .8 · .2 | – | – |

- No FX_DEFAULTS row: aurora, blob, echo, flow, fract (they get BASE_POST).
- `LATE_TRAILS` (L152): crystal, pearl, spiral .8, active only when the trails macro is > .5 (`engine.js:179`).
- Other engine couplings:
  - `SCENE_PALETTE`: morphogen→pearl, main stage→vapor, morphogen 2.0→glacial (`main.js:7780`).
  - `fxWet`: limitless. `fxHint steady` + `msaa 4`: main stage.
  - main stage's LED wall draws another roster scene (`laser-stage.js:1454-1469`).
  - `edgeAA`: 14 scenes (§2; crystal, pearl and spiral through the lib).
- The ink and mandala thumbnails show quad / 9-fold symmetry. Their shader bodies hold no mirror (`ink.js:29-79`: plain fBm; the mirror comes from FX_DEFAULTS).

## §6 Lowest-difficulty batch, no external assets (facts only, in order)
Rank: difficulty (§2), then line count; ROSTER scenes with a thumbnail only.
1. **ink**: 121 lines, diff 1. FS fBm + `NOISE_GLSL`; 19-line update. Engine-coupled: mirror 2, persist .97, zoom 1.11, aber 4.
2. **mandala** (`kaleido.js`): 121, diff 1. FS kali fractal; 20-line update; one `Math.random`. Engine-coupled: mirror 9, persist .75, zoom 1.29, bloomMul 2.5.
3. **tendril**: 203, diff 1. FS Julia orbit trap; 26-line update; modes; pB 1.5.
4. **relic**: 228, diff 2. FS RM Mandelbulb; gated power walk; edgeAA.
5. **citadel**: 233, diff 2. FS RM Mandelbox; gated walk; edgeAA.
6. **descent**: 245, diff 2. FS RM Menger; imports `descent-motion.js` (20 lines); persist 0.
7. **oracle**: 250, diff 2. FS RM; edgeAA; mirror 1.
8. **idol**: 269, diff 2. FS RM; edgeAA.
- Next by the same rank: spacetime 333, ingot 350, gate 481 (all diff 2). fract (307, diff 2) is dormant and has no thumbnail. `shader` is covered by our toy path.
- All 8 read only PAL, `drastic` and the §4 fields `onKick kick sub mids highs energy`. None reads `specHi`, `wave`, `ctx` or `scenePointer` (§2).
