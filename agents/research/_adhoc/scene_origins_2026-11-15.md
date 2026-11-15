# Ad-hoc — origin map of the editor library (MilkDrop / TD / ISF donors / Ours / Camera)

## TL;DR
- The library shows 108 catalog defs (13 transitions are skipped, `web/src/editor/blocks.ts:23`), 1 toy (`toy/plasma`) and 88 built-in scenes: 63 `OWN` + 25 `MILK_SCENES` (`web/src/scenes/builtin.ts:1035`). The brief's figure of 59 built-ins is out of date.
- Defs by origin: MilkDrop 25 · TD 38 · ISF donors 20 · Ours 22 (+ the toy) · Camera 3. Scenes: MilkDrop 25 · TD 34 (32 without the two ⚠️) · ISF donors 3 · Ours 26 · Camera 0 on master (3 `dj-*` on a branch).
- What can be computed: `milk/` prefix → MilkDrop; `isf/` prefix → ISF donors; `own/*.fs` whose header line matches `// Look: (a )?TD` → TD (26 of 44 files). What needs a hand list: the TD natives (12 ids), because their `Look: TD` line is a TS comment and is not in the `EffectDef`; and the camera set.
- Today's `group` field is the category, or `milkdrop` for `milk/*`, or `other` (`blocks.ts:27`). Every toy and every scene gets `group: 'other'` (`blocks.ts:36,38`). The chips are hard-coded at `Library.tsx:10`.
- ⚠️ count: 5 (bars, mosaic/led-grid, ascii-type scenes, user scenes, laser-grid history). Details in §4.

## Freshness
2026-11-15, master `f70876c`. Read: `web/src/editor/blocks.ts` L1–50, `web/src/editor/Library.tsx` L1–60, `web/src/fx/catalog.ts` L1–58, `web/src/scenes/builtin.ts` (ids + section comments), the ISF JSON headers (CREDIT/CATEGORIES) and the first comment lines of every `fx/own/*.fs` and `scenes/*.ts`, `git log --diff-filter=A` for `fx/isf/*`, `thoughts/spec_td_look.md` L1–33, `spec_td_wave2.md` L1–35, `spec_scenes_wave3.md` L1–30, `agents/STATE.md` HEAD L7–28, `web/THIRD_PARTY.md` headings.

## §1 Origin groups (evidence-adjusted)
- **MilkDrop**: the `milk/<slug>` natives, `credit: p.author` (`milkdrop/native.ts:70`), and their scenes `builtin:milk-<slug>` (`milkdrop/presets.ts` MILK_SCENES L24–28).
- **TouchDesigner**: the files whose header says `Look: TD <component> (studied, rewritten)`. This header is the rule in `spec_td_look.md` L27, `spec_td_wave2.md` L29 and `spec_scenes_wave3.md` L26. Scenes: the `builtin.ts` sections at L322 (wave 1, 11 scenes), L499–774 (wave 2) and L774–1006 (wave 3).
- **ISF donors**: `fx/isf/*.fs`, copied from Vidvox ISF-Files with the header kept (`THIRD_PARTY.md` § isf (20), L69). One of them came in through Shadertoy: `ASCII Art` (CREDIT "Ported from shadertoy lssGDj"; `THIRD_PARTY.md:176`). No other Shadertoy code is in the catalog. Pasted Shadertoy nodes are user `toy/*` (`catalog.ts:43`).
- **Ours**: own natives and own ISF files that have no TD header (CREDIT "VeeJay Wizard").
- **Camera**: `native/camera`, `native/outline` (`scenes/camera.ts:39,84`) and `own/negative.fs` (header L2: "camera plan S2.2"). No camera scene is on master.

## §2 Defs: id → kind → group → evidence
| ids | kind | group | evidence |
|---|---|---|---|
| 25 × `milk/<slug>` (the slugs in `milkdrop/presets/*.json`) | generator | MilkDrop | `native.ts:70`; credit = preset author |
| `native/camera`, `native/outline` | generator | Camera | `camera.ts:8,39,84` |
| `own/negative` | effect | Camera | `negative.fs:2` "camera plan S2.2" |
| `native/rgba-delay`, `native/time-machine`, `native/slit-scan` | effect | TD | `history.ts:5,108,158` "Look: TD rgbaDelay.tox / Time Machine TOP / slit scan" |
| `native/swarm` (gen), `native/scatter` (effect) | gen / effect | TD | `points.ts:9` "Look: TD particlesGpu.tox + Particle/Trail POP, pixelRelocator.tox" |
| `native/scope`, `native/plexus` | generator | TD | `scope.ts:7`, `plexus.ts:6` |
| `native/creatures` | generator | TD | `creatures.ts:12` (sprinklePOP/phaserPOP/particlePOP); `animals.ts:11` |
| `native/isobars`, `native/wireform`, `native/vortex`, `native/orb` | generator | TD | `isobars.ts:11`, `wireform.ts:8`, `vortex.ts:13`, `orb.ts:11` |
| own TD effects: `bloom`, `edge-rings`, `td-feedback`, `flow-smear`, `reaction-diffusion`, `light-tunnel`, `radial-blur` (wave 1); `diff-feedback`, `phaser`, `polar`, `gradient`, `julia`, `dent`, `sharpen`, `emboss`, `hsv-blur`, `rgba-blur`, `rgb-contrast`, `color-threshold`, `change-color` (wave 2); `laser-grid` (wave 3) | effect / gen per ISF | TD | line 2 of each file `// Look: TD …` (laser-grid L4) |
| own TD generators: `superformula`, `stars`, `checker` | generator | TD | line 2 `// Look: TD Palette …` |
| `own/bars` ⚠️, `own/mosaic` ⚠️ | gen / effect | TD by header | `bars.fs:2` "Look: TD audio-spectrum bars and MilkDrop's glowing waves"; `mosaic.fs:2` "a TD-style cell mosaic"; both from stage 2b S4 (git `901bdc6`, `cf9d2d4`), not from a TD wave |
| `isf/*` ×20: Chromatic Aberration, VHS Glitch, Pixellate, Posterize, v002-CRT-Displacement, Kaleidoscope, Kaleidoscope Tile, Sine Warp Tile, Mirror, Circular Feedback Mask, Comet Tails, Long Exposure, Worley Cells, Truchet Tile, ASCII Art | gen / effect | ISF donors | CREDIT VIDVOX / vade / pjkarlik / Lublin; added 2026-10-28 … 11-06 (git) |
| `isf/Solarize`, `Color Monochrome`, `Color Replacement`, `Dilate`, `Erode` | effect | ISF donors (code); brought in for TD wave 2 quick wins | git `69f3cd7`, `6e6aedd` "2e S3.x donor …"; `spec_td_wave2.md` L28 "copy the MIT donor ISF" |
| `native/tunnel`, `native/spectrum`, `native/glitch`, `native/lasers` | generator | Ours | credit "VeeJay Wizard"; `lasers.ts:8` "Own code" |
| `native/particles` | generator | Ours | credit "VeeJay Wizard, after Gregg Tavares (twgl.js)" `particles.ts:96` |
| own, no TD header (17): `flythrough`, `fractal`, `tunnel-mesh`, `wave-landscape`, `sdf-shapes` (hg_sdf), `feedback-zoom`, `echo`, `trails`, `strobe`, `flash`, `scanlines`, `domain-warp` (after IQ), `liquid-chrome`, `metaballs`, `smoke`, `ink`, `led-grid` | gen / effect | Ours | line 1 `// VeeJay Wizard, 2026`, CREDIT "VeeJay Wizard" |
| `toy/plasma` | generator (toy) | Ours | `builtin.ts:203` credit "VeeJay Wizard" |
| transitions ×13 (`gl/*`, `own/crossfade`) | — | not in the library | `blocks.ts:23` |

## §3 Built-in scenes: id → group → evidence (node refs taken from `builtin.ts`)
| scene ids (`builtin:` dropped) | group | evidence |
|---|---|---|
| 25 × `milk-<slug>` | MilkDrop | `presets.ts:24–28` |
| wave 1: `td-feedback`, `edge-rings`, `bloom-glitch`, `light-tunnel`, `flow-smear`, `reaction-diffusion`, `rgba-delay`, `time-machine`, `slit-scan-ring`, `swarm`, `scatter` | TD | `builtin.ts:322` "TD look (Stage 2d)"; `spec_td_wave2.md` L4 "11 scenes" |
| wave 2: `pointillize`, `superformula`, `tiny-planet`, `grad-map`, `phaser`, `diff-feedback`, `stars`, `xy-scope`, `plexus`, `poster`, `solar-emboss`, `halo` | TD | `builtin.ts:499,580,631,679,697,716,731,758` "TD wave 2" |
| wave 3: `spirit`, `chase`, `abyss`, `dust`, `zodiac`, `wireform`, `vortex`, `orb`, `isobars` | TD | `builtin.ts:774–977` "Scene wave 3"; TD natives (§2) |
| `bars` ⚠️, `led-grid` ⚠️ | TD by the node rule, Ours by section | `builtin.ts:520` "CP4 (2b S4.4)"; their nodes are `own/bars`+`own/bloom` and `own/mosaic`+`own/led-grid` |
| `worley-cells`, `truchet`, `kaleido-maze` | ISF donors | generator is `isf/Worley Cells` / `isf/Truchet Tile` |
| `tunnel`, `spectrum`, `particles`, `glitch`, `flythrough`, `tunnel-mesh`, `fractal`, `wave-landscape`, `sdf-shapes`, `particles-over-tunnel`, `toy-plasma`, `spiral-mesh`, `rainbow-trails`, `liquid-chrome`, `fluid`, `lava-smoke`, `ink`, `rave-lasers` | Ours | own generators + own fx only |
| `kaleido-tunnel`, `vhs-tunnel`, `crt-spectrum`, `pixel-strobe`, `trails-spectrum`, `slit-scan`, `feedback-ring`, `ascii` ⚠️ | Ours (own generator) + ISF-donor fx | e.g. `ascii` = `native/tunnel` + `isf/ASCII Art` (`builtin.ts:567`) |
| pending: `dj-over-tunnel`, `dj-inside`, `dj-ghost` | Camera | branch `worktree-agent-a8bd11a031073904a` @ `853f48f`, unmerged (`STATE.md:24`) |
| pending: DnB wave 4 | ⚠️ unknown | `thoughts/spec_dnb_wave4.md` (untracked; not read) |

## §4 Mechanical rule and what still needs a hand-written list
- **Defs, first match wins:** (1) `id.startsWith('milk/')` → MilkDrop. (2) id is in the camera list {`native/camera`, `native/outline`, `own/negative`} → Camera. (3) `own/*` and the raw `.fs` text matches `/^\/\/ Look: (a )?TD/m` → TD. The raw text is in `files` at `catalog.ts:24`, but `parseIsf` does not keep it (`isf.ts:147`). (4) id is in the TD-native list (12 ids, §2) → TD. (5) `isf/*` → ISF donors. (6) all others → Ours. `credit` is no use as a rule: TD files and our own files both have CREDIT "VeeJay Wizard", and some own files name partial donors in CREDIT (bars, mosaic, flow-smear, reaction-diffusion, stars, sdf-shapes).
- **Scenes, first match wins:** a `dj-*` id or any camera node → Camera; `builtin:milk-*` → MilkDrop; any TD node in any layer (gen or fx) → TD; a generator in `isf/*` → ISF donors; all others → Ours. This rule gives the §3 split, except that it puts `bars` and `led-grid` in TD.
- **Hand lists:** the 12 TD native ids and the 3 camera ids. Alternatively, an origin field on the def, which does not exist today (`types.ts:12`).
- ⚠️ 1 `own/bars`, `own/mosaic`: their headers name TD, but they were written in stage 2b, before any TD wave scene.
- ⚠️ 2 `bars`, `led-grid` scenes: see above.
- ⚠️ 3 The 8 scenes with an own generator and ISF-donor fx (`ascii` gets its whole look from a donor) are counted as Ours. The rule picks the generator over the fx.
- ⚠️ 4 User scenes (`library.all()`, `Library.tsx:58`) have no origin. Today they are mixed in with the built-ins under `group: 'other'`.
- ⚠️ 5 `own/laser-grid`: TD header, but the user rejected the look on 2026-11-14 (`laser-grid.fs` L2–3). It stays in the catalog and has no scene. The commit message for `isf/Dilate`/`Erode` names a `builtin:melt` scene that is not in `builtin.ts` today (removal commit not traced).
