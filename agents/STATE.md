# STATE — VeeJay Wizard

> Owner / single writer: the lead (main session). Read HEAD at every session start; update after every sub-agent call, user decision and at session end. Rules: `CLAUDE.md` § 📌 STATE.md.

## HEAD

**Updated:** 2026-11-03 (session 6)
**Stage:** pilot ✅ → `effects` ✅ (tag `cp7-effects`) → `audio-reactivity` ✅ code-complete (22/22 steps, CP1–CP7, `8db53d0`, 316 tests). **Now: 3.5 h autonomous run (user, until 21:10 MSK) over the post-epic queue.**
**Spec:** `thoughts/spec_veejay_wizard.md` + `spec_effects.md` + `spec_audio_reactivity.md`. **Team (user 2026-11-03):** `planner` Fable 5.1 max; everyone else Opus 5.5 max; `researcher` high. The Qwen trial (11-01..11-03) is over.

### Where we stopped (2026-11-03 21:17, autonomous window closed, heartbeat cron deleted)
- ✅ **S8 merged** (`2f4838f`, 21:25): `underruns()` = `playbackStats.underrunEvents` in `?debug` + `?bench`. §4.7 partial: 26 s with audio flowing, 60A 1.00×, fps 60, underruns 0 on Chrome's no-device sink; **blocker: this Mac's CoreAudio output is stuck** (`afplay` hangs) → user restarts coreaudiod, then `node scratchpad/s8-underrun60a.mjs 60` (headed; earlier "headless" checks were headed + `--mute-audio`). Plan CP7 §4.7 row corrected.
- ⚠️ Gates under machine load (load ~8.6, Docker VM): vitest 314–315/316, 5 s timeouts in `acceptance.test.ts` §4.5 and `post.test.ts` caps — identical on unchanged master; the files pass alone. Queue a Tier-1: explicit timeouts on the heavy tests.
- ✅ **planner (Fable) → `agents/planner/plan_live_rebuild.md`** (§5, Tier 2): 1 step S1.1 in `gl/live.ts` only — per-op in-place mirror (`addFx`/`removeFx`/`addLayer`/`removeLayer`/`setBlend`) replaces `rebuild()`; survivors keep node, `u` (smoothing), targets, clocks; per-node FRAMEINDEX counter; no new Vitest (GL; mapping already pinned by `edit.test.ts:56-84`); 4 browser checks incl. GPU-memory leak after 10× add+remove. Drift: `design_effects.md:234` still says "call live.rebuild()".
- ✅ **system-designer (Opus max, ~110 min incl. the limit pause) → `design_milkdrop.md`:** **A** (rec., M) each preset = catalog native `milk/<slug>` in a one-layer built-in `builtin:milk-<slug>`, pool of 2 visualizers (own OffscreenCanvas contexts), per-frame `texSubImage2D(internalCanvas)` GPU→GPU copy; ~6 app lines + optional `NativeDef.warm?()` / **B** (M) whole-frame deck `milk:<slug>`, MilkDrop's own morphs, no fx on presets, milk→milk compiles inside fades / **C** (L) A in a Worker, +1 frame. Common: `butterchurn@3.0.0-beta.5` exact pin (MIT), presets copied from `butterchurn-presets@3.0.0-beta.4` with credit fields, feed via `render({audioLevels})` from our `analyser`, `pixelRatio: 1`. **Plan step 1 in every variant = `?bench&milk` M4 probe, kill criteria K1 copy / K2 5 ms per preset / K3 load hitch / K4 JS < 9 ms.** Gaps G1–G3 covered by install + probe (no researcher).
- ✅ **USER GATE passed (user, 2026-11-03): MilkDrop Variant A** (`design_milkdrop.md` § Variant A + § Common C1–C5). Q2 **no** detector hook into presets (later maybe). Q3 **we pick ~25** that pass the probe, all starred; the user unstars. Q4 autopilot mix **spread evenly** (`spread()`).
- ✅ **planner (Fable, 14 min) → `plan_milkdrop.md`** (~19 KB, lead-verified pointers): 7 steps. CP1 = probe only: S1.1 install + `butterchurn.d.ts` + boot checks G1–G3/G9/G10; S1.2 K1–K4 + `Governor.jsMs` + export `governor`. **Hard stop on any K fail.** CP2: S2.1 `presets.ts`/test/script/3 presets → S2.2 `native.ts` + catalog → S2.3 `warm?()` → S2.4 `BUILTIN = spread()` (order mandatory: `live.ts:435-439` warm would otherwise open one context per preset). CP3: S3.1 ~25 by rule + THIRD_PARTY; lead's 60 s check. The probe needs no audio (silence bytes).
- ✅ **MilkDrop S1.1 merged** (`63d5b4e`, coder 13 min; gates 316/316): butterchurn 3.0.0-beta.5 + presets 3.0.0-beta.4 exact, `butterchurn.d.ts`, `?bench&milk` boot. M4: internalCanvas yes, 2d null yes (G2), **createVisualizer ~1 s main thread**; 410 candidates, load errors 1, **GL link errors 22** (dist never checks link status, so the bench reads the GL flag) (G3). G1 inlined deps eel-wasm MIT, @assemblyscript/loader Apache-2.0, math-extensions MIT. G9 presets = `presets/converted/<name>.json` ×504 (`dist/all.js` lossy). G10 `elapsedTime` = dt seconds. Butterchurn patches global `Math` (clamp, scale…). Harness: scratchpad `milk-boot.mjs <port>`.
- ⏸ Paused by the user 2026-11-03 22:59. **Resumed 2026-11-04 01:19** (cron). The S1.2 coder had been stopped before writing code, so S1.2 was re-dispatched fresh.
- ✅ **MilkDrop S1.2 merged** (`a4abcaf`, coder ~25 min; gates 317/317). `Governor.jsMs`, `export governor`, `?bench&milk` K1–K4 (`&n`, `&res`, `&mesh`).
  - Coder's `n=20` run: K1 fail (copy GPU p95 a 6.28 / b 6.39 / c 1.65 / d 3.03 ms; main ≤0.3), K2 fail (0/20, copy term only; Butterchurn's own GPU 2.4–5.5), K3 pass (warm 6.9/8.9 ms), K4 pass (0.30+1.40 ms). createVisualizer 51–76 ms (S1.1's ~1 s was a cold first).
  - ⚠️ The copy GPU numbers look like cross-context sync wait, not copy work: an empty query reads 0.00, and copying an already-finished frame is no faster. This needs a design ruling before K1's "stop" counts.
  - ✅ **Lead full probe (01:5x, M4, silence, 60A):**
    - K1 fail (copy GPU p95: a 6.47, c 1.62, d 3.09) and K2 fail (0/387 with the copy term).
    - **But end-to-end the 60 s run held: MilkDrop + copy (a) every frame at full size, 3600 frames, 0 late, p99 18.6 ms.** So the copy timer is sync wait, not cost.
    - Butterchurn's own GPU p95: ≤5 ms 264/387, ≤4 ms 125. Cold loads 0 late on all 387. K3 pass (warm 6.0/9.2, max 26.1 on a fresh B). K4 pass (2.4 ms). S3.1 pool 116 presets, 49 authors.
    - Output: session scratchpad `milk-full.out.txt` + `milk-full.raf.json`.
  - ▶ **system-designer: probe ruling** (K1/K2 measure, copy path for S2.2, governor/timer side effects) → `design_milkdrop.md` § Probe ruling. CP2 waits for it.
  - ✅ **Tier-1 heavy-test timeouts merged** (`c738f85`, ~9 min): a global Vitest `testTimeout: 20_000` (the two redundant per-test 20 s in arrange.test.ts removed). Reproduced with 20 CPU burners: §4.5 timed out on unchanged code; 317/317 ×2 after the fix.
  - ▶ **Polish §7** (coder): any window `keydown` wakes the overlay (so `E` no longer opens an invisible panel).
- ✅ **User "go" (2026-11-04 01:2x): the effects-polish queue is approved.** One coder at a time. Lead order:
  - S1.2 → the lead's full `?bench&milk` on a **quiet machine** (no coder running, so the numbers stay clean) → CP1 verdict.
  - Then Tier-1 test timeouts (they unflake every later merge).
  - Then alternate MilkDrop CP2 (only if CP1 passes) with polish: S2.1 → §7 → S2.2 → §3 → S2.3 → §6 → S2.4 → §5 (`plan_live_rebuild.md`) → S3.1 → §1 → §2.
  - If CP1 fails: MilkDrop stops (user decision per the K table), and polish continues.
- **Exact next step:** merge S1.2; the lead runs the full `?bench&milk` at 60A → **CP1 hard stop or go**.
- Ops lesson (2026-11-03 ~19:0x): three Opus/Fable-max agents in parallel hit the 5-hour usage limit in ~1.5 h; keep parallel runs to coder + one researcher.

### Queue (lead order)
1. Merge the underrun step; correct the §4.7 row in the plan's CP7 closeout with its numbers.
2. Effects polish, one coder each (user 2026-11-03 "го дальше" over the list = go; the big effects re-brief still waits for the user's brief). Lead order + defaults: **§7** overlay wakes on keys → **§3** one shared flash-rate cap ≤3/s for `own/strobe` + `own/flash` (WCAG 2.3.1) and strobe default not full white → **§6** spectrum-local low-bar interpolation (no fftSize change) → **§5** per `plan_live_rebuild.md` → **§1** slit scan, **§2** chrome ring (taste, last). **§4** deferred (perf investigation, needs a quiet-GPU `?bench`).
3. MilkDrop epic: research → system-designer → **USER GATE (hard stop)** → planner → coders. Spec: 20–30 curated Butterchurn presets in the shared playlist + both engines composited into one recorded canvas.
4. Blocked on the user's real tracks (`scratchpad/real/`): dubstep140 tempo lock (bar 1.71 s > max lag 1.33 s), false kicks on a bare reese, preset `proto`/`sens` tuning.

### Waiting on the user
- Local CP6/CP7 check: `cd web && npm run dev` → `localhost:5173/?debug`, E opens the panel (Sources tab, meters, picker/Auto, custom band + reload, drop + LOCK).
- §4.2: 174 vs rekordbox on the deck.
- The effects re-brief (what to redo, including the built-in scenes).
- Real tracks for tuning (`scratchpad/real/`).
- The MilkDrop variant pick, when the design lands.

### Open notes
- ⚠️ **§4.7 record correction:** the S7.2 note "the headless drop feed didn't decode (Chrome artifact)" was wrong. The lead's harness passed a Node Buffer into `page.evaluate`, which arrived as an empty File. With base64 it decodes with 0 errors, but `__src` still reads 0 in that harness (the underrun coder is diagnosing it). Under the drop, the governor stepped 1.00 → 0.72× and probed back up (0.79, 0.87). So "scale 1.00, never stepped down" holds only without audio.
- Known limits: bass note-on-kick lag ~211 ms (accepted); kick-veto branch S3.1c kept unmerged (`413275d`); `?debug&preset=` forces the frame loop only, so it doesn't drive the Auto-style hint (by design).
- Effects polish backlog: slit scan weak; liquid chrome rings every kick; strobe full-white every beat; spectrum takes ≤2 filters; a structural panel edit restarts the scene; steppy bass bars; keys don't wake the overlay.
- Pilot optional (user): 30-min §7.5 run, `?flash` lag. REC is low priority; backlog: a WebCodecs recorder.
- Fixtures: `scratchpad/fx_audio/dnb174.wav`, `dubstep140.wav` (gitignored; regenerate via `web/scripts/make-fx.mjs` through a throwaway vitest in `src/`).

**Infra:** graphify (root `.`, post-commit hook); crons are session-only; `.claude/settings.local.json` allowlist (Read/Write/Edit + common Bash incl. `npx:*`); dispatch rule CLAUDE.md #11 (one coder at a time, own worktree, the lead merges).

### Key decisions
- Session 2 (/grill-me): browser pilot, Chrome-first, localhost; Vite + React + TS; Electron later. Minimal auto-hiding overlay, REC via MediaRecorder, quality modes 60A / 60F / 30. After the pilot: editor → camera → clip mixer.
- Session 3: any dependency license; line-in only (rekordbox, sometimes Pioneer USB), MIDI/Link later; Butterchurn moved to the next step; analysis = energy, onsets, tempo+phase.
- 2026-10-28: effects Variant A; audio-reactivity Variant B (worklet IIR bank + fast/slow envelopes).
- 2026-10-31: one coder at a time. 2026-11-01: fully autonomous runs (the lead halts only on hard blockers). 2026-11-03: team models above; MilkDrop Variant A, no detector hook, we curate ~25, spread evenly.

### Open ⚠️ assumptions
Tracked in `design_pilot.md` § "Spec §8 and STATE ⚠️ ledger".

### User preferences
Talk in Russian. **Grill/AskUserQuestion ONLY at new-feature discovery (+ the one variant gate); never during execution** (user, 2026-10-29). **Decide minor/technical choices yourself; ask only for real gates/scope** (user, 2026-10-28). REC is low priority. No Docker. Artifacts in English. External AI reviews the user pastes are leads to verify, not facts.

## TAIL

- 2026-10-27 — Session 1: project setup. CLAUDE.md written for VeeJay Wizard; ponytail, graphify and grill-me skills installed.
- 2026-10-27 — Session 2:
  - /grill-me, 5 rounds → `thoughts/spec_veejay_wizard.md`.
  - Ad-hoc research `agents/research/_adhoc/audio_capture_feasibility_2026-10-27.md`.
  - CLAUDE.md updated: stack locked (React), 📌 STATE.md rules, agents renamed to hyphenated and moved to `.claude/agents/`, Sonnet/Haiku bumped to 5.5.
  - 3 Tier 3 researchers launched, then stopped by the user; no artifacts written.
- 2026-10-27 — Session 3 log:
  - 3 researchers in parallel. No `donor/` dir, so web only.
    - render_stack §1–§7: regl is WebGL1-only; OGL is Unlicense; M4 loses ~22% GPU sustained; Shadertoy is CC BY-NC-SA.
    - milkdrop §1–§8: Butterchurn is MIT; 2.6.7 (2019) vs 3.0-beta.5 (2025); own GL context; preset license unknown; projectM is LGPL.
    - audio §1–§6: no permissive real-time BPM+phase lib; essentia.js is AGPL, aubiojs bundles GPL aubio; ±1 BPM is ~5× tighter than Acc1; lag ~30–60 ms (derived); >2-channel inputs open as stereo.
  - The lead over-summarised research as "we must write it ourselves". The user objected and lifted the license filter, then pasted an external review: R3F, beatfinder, BeatDetektor, MIDI Clock, split metrics.
  - Running agents were corrected via SendMessage; the spec was rewritten per the user's answers.
  - system-designer finished `design_pilot.md` rev 3. INDEX updated.
- 2026-10-27/28 — Session 3, build log:
  - S1.1–S1.2 scaffold + probe. Vite 8.3.5, React 19.3.1, TS 6.0.3 (create-vite TS7 bug), Vitest 4.1.12 (v5 needs Node 22).
    - Plain `new URL` worklets fail in builds; `?worker&url` works.
  - The probe Sonnet agent hung; the lead ran Playwright itself. REC at 2400×1754 heavy shader: 4/896 late frames. DPR 1.8 in the user's profile, 2.0 in a fresh one.
  - S1.3–S1.6 (CP1) drift: contract stubs, `scenes` registry, energy silence re-seed.
  - S2.1–S2.4 (CP2) drift: no worklet.d.ts, odfQueue capped at 64, flash age clamped ≥0. Synthetic digital silence makes extra onsets.
- 2026-10-28 — Session 3, continued:
  - CP3/CP4 done. REC fixes: timeslice, dot, letterbox, file A/V delay, keyframe 60 s, 20-min split.
  - Recording research: Chrome MP4 muxer bugs.
  - The user told the lead to stop asking about minor things (memory `decide-minor-defaults`).
  - CP5 done (bass-band ODF, per-beat confidence).
  - Effects epic: grill (2 rounds) → spec_effects → research → design → gate A.
  - git init (`a28436a`).
- 2026-10-28 — Pilot closed; epic `effects` (Stage 2a, `plan_effects.md`, Variant A). Demoted from HEAD 2026-11-03:
  - **Pilot (`plan_pilot.md`): ALL done** (CP1–CP5 + S6.1). Verified in Chrome and live by the user. REC: MP4 1 s timeslice, keyframe 60 s, 20-min split; Chrome bugs in `research_recording_mp4.md`.
  - ✅ CP1 `f421b38` · CP2 `cp2-effects` (bench, natives, compile-all) · CP3 `cp3-effects` (compositor, transitions, Shadertoy) · CP4 `cp4-effects`.
    - CP4: 27 starred scenes, 34 effects (14 ISF, 16 own, 4 natives, 1 toy), 13 transitions. All scenes ≤5 ms GPU at 1728×1118 (heavy gens at res 0.5), 0 errors. Contact sheet `scratchpad/cp4walk/contact.png`.
  - ✅ S5.1 panel engine (`edit.ts`, `live.panel`, E/Esc). 129 tests.
  - Wave 6 (parallel worktrees): ✅ S5.2 Panel UI (0 re-renders and 0 drops while dragging) ‖ ✅ S6.1 library (IndexedDB, stars → playlist, JSON; 142 tests) ‖ ✅ polish (wave-landscape shards fixed, res 0.5 p95 ≤5 with ~1 ms headroom; the 3 ms stage "floor" is an ANGLE/Metal timer-query artifact, real pass ≈0.04 ms; scene gpuMs carry ~1 ms of overhead).
    - ✅ S5.3 paste dialog + S6.2 library buttons + `director.cut` (144 tests; Chrome 18/18 and 24/24). CP5 + CP6 done.
  - ✅ **CP7 (2026-10-28): epic `effects` COMPLETE (27/27 steps), tag `cp7-effects`.**
    - S7.1: THIRD_PARTY 43 shader rows (`scripts/shaders.mjs`). Unverified upstreams: Truchet, VHS Glitch, v002 CRT, McGuire noise.
    - Fix: inline Save-as field. S7.2 lead regression: all keys, REC 30 s clean, 5-min 60A 3 drops, 0 errors.
    - Final count: 27 starred scenes; 34 effects (ISF 14, own 16, natives 4, toy 1); 13 transitions; retro ≥7, geometry ≥8, feedback 9, liquid 5.
  - Heads-ups: "Save as keeps editing the on-screen scene", stars from `library.get(id)?.star`; `library.del` of the on-screen scene must not crash. The bench needs a quiet GPU (parallel benches inflate 2×); parallel coders prefix scratch files; `builtin.ts` append conflicts are resolved by the lead (keep both).
  - 🗣 USER FEEDBACK on effects (2026-10-28): not everything is liked; the user will give a separate brief on what and how to redo, including the built-in scenes.
  - The user now understands that scenes can be built in the panel ("вроде кайф").
- 2026-10-28..11-02 — Epic `audio-reactivity` (`plan_audio_reactivity.md`, Variant B). Demoted from HEAD 2026-11-03:
  - `research_audio_features.md`; grill (2 rounds + confirm) → `thoughts/spec_audio_reactivity.md`. Sources: kick/snare/hats, sub/reese/wobble, build/drop, custom bands. Presets: DnB, dubstep, techno/house. Auto-style mode. Drop: heat-up, then flash + cut. "Sources" tab.
  - system-designer → `design_audio_reactivity.md`: A main-thread 8192 analyser / B worklet IIR bank + fast/slow envelopes. **USER GATE (2026-10-28): Variant B** (F1 ≥ 0.70 at ±30 ms; ≤8 custom bands; heat strobe ≤0.15).
  - Plan: 7 CPs, 22 steps, 13 waves. The 5th attempt (Sonnet, exact line-range reads, incremental writes) finished in 2 min. Lesson: planners read narrowly and write incrementally.
  - Wave W1 (resumed 2026-10-31 after the 5-h usage limit hit all 5 coders on 10-29):
    - ✅ S4.2 `c45062f`. ✅ S2.2 `ae05de4` (195 tests; `createSettings(kv, sampleRate)`). ✅ S1.1 `bc05c76` (pure `analysis.ts`, golden = old worklet output; 41 onsets on kicks128n).
    - ✅ S2.1 `bands.ts` IIR bank, 5.4 µs per block for 11 bands; kick gate reworked (separate 200 ms gate followers, TRANSIENT 1.5, HOLD 100 ms).
    - ✅ S1.2 `a110cc7` (212 tests): `drums.ts` + `synth.ts`. DnB F1 kick 0.79 / snare 0.97 / hats 1.00; dubstep 0.80/1.00/1.00; techno 0.89/0.77/1.00. C2 limit: a bare reese or snare fires false kicks; hit strength saturates at 4.
    - ✅ S1.3 `80e59fb` (216 tests): plain 0→1 envelope.
  - The 5-h limit killed S1.4, S2.3, S3.1, S4.1, S5.1 at 14:3x; re-dispatched at 15:50.
    - ✅ S2.3 `f31f2b5` (218): `feat` every 2 hops, config rev. ✅ S1.4 `94e71d0` (240): hits wired end to end, `own/flash` on `kick`, `window.__src` under `?debug`; dnb174 10 s: kick 24 / snare 10 / hats 58. **CP1 code-complete.**
    - Baseline: house128 locks at 128.0 in ~10 s; dnb174 never locked in Default (conf 0 for 40 s).
    - Limit again ~16:45; at 20:51 S3.1/S5.1 resumed via SendMessage, S2.4/S5.2 re-dispatched.
    - S3.1 `f183a0d`: DnB range reads 174/182; fold hang fixed. Master briefly red (harness fed `hit` into `pushOdf`), fix-forward `8294a83`.
    - Root finding: on full mixes the bass-flux ODF is flattened by sub/reese flicker → lead decision: tempo ODF from bass transients (S3.1b). `families` overlap, so S4.3 must not rely on tempo family alone.
  - 🛑 USER (2026-10-31 21:0x): "убей всех агентов", then "делай по одному последовательно" → rule: ONE coder at a time (CLAUDE.md #11 + memory).
  - Sequential queue:
    - ✅ S5.1 `b85c64e` (259): `arrange.ts` build/drop. ✅ S2.4 `89320ac` (267): sub/reese/wobble hold 0.2 s on the reese gate; wobbleDepth 0.25 wobble vs ~0.09 steady reese; bass note-on-kick lag ~211 ms (accepted).
    - ✅ S5.2 `5379d31` (273): heat post pass, `postFor`. ✅ S3.1b `022c895` (277): tempo ODF = kick+snare bank transient excess; synth mixes lock at 174/140/128; real dnb174 under DnB range 174 at 0.32–0.42. `dubstep140.wav` doesn't lock (bar 1.71 s > 1.33 s max lag).
    - ❌ S3.1c kick veto NOT merged: on real dnb174 kicks fell from 24 to 1–4 per 10 s. Branch `worktree-agent-a73146a6778eb362d` (`413275d`) kept.
    - 🛑 S2.5 on Qwen + `effort: max` killed after ~5 h (12–15 min per API turn; reasoning-token latency in the Qwen backend). Split into S2.5a/b and dispatched at medium.
    - ✅ S2.5 (a `7bb0046`, b merge; 287): `u:<id>` = band's gated `e2` × gain, dt one-pole, sens, cap 1; config pipeline `workletBands` + `bandKey`, `featQueue` + `configure()`, `?debug` meters; `web/scripts/make-fx.mjs`. Formula correction: the band filter's own `e2` level carries the ≥5× separation. Ops lesson: medium coder + narrow brief + allowlist = ~24 min per sub-step; a 40-min stall was an approval prompt (`npx` now allowlisted).
    - ✅ S3.2 (290): active preset's `bpm` band → `tempo.setRange`; one-step `snapOctave` bridge; `?debug&preset=<id>` dev hook. Stale done-check corrected: Default reads 174.014 on dnb174 under the transient ODF (116 was the old ⅔ lag).
    - ✅ S4.3 `f1fcb6d` (297): `styleIn` adapter; `createRemap()` 2 s crossfade + `restyle` → `styled`; `store.style`. Headless: DnB @ 0.94; Auto ON `styled.bass` corr reese 1.00, OFF corr bass 0.97.
    - ✅ S5.3 `c8a702e` (299): arrangement per frame; `shouldCut(fired, hold)` → `director.cut`; heat speeds `f.dt`; `postFor` live; WCAG 2.3.1 strobe cap ≤3/s. CP5 code-complete.
    - ✅ S6.1 `a309dc9` (301): Scene/Sources tabs, rAF meters without React state, `meterGroups`. Lead fix: the meter loop restarts when the meter set changes.
    - ✅ S6.2 `cc6d949` (303): picker, Auto toggle, sens sliders, custom-band form, `Detected` label, pure `pickToPatch`. Lead fix: "Auto" from Manual sets `auto:true`.
    - ✅ S6.3 `d6d592a` (305): `sourceGroups(custom)` (levels/drums/bass/arrangement/timing/custom/band), dim `→ target (auto-style)` hint. CP6 code-complete.
    - ✅ S7.1 `a201869` (316): `acceptance.test.ts` on the real DSP chain: F1 kick 0.788 / snare 0.968 / hats 1.000; 174.014 in [160,185]; 6/6 grooves; crossfade = 1 switch; drop conf 0.820 + LOCK; band round-trip. Suite 6.6 s.
    - ✅ S7.2 (lead, `8db53d0`): CP7 closeout table in the plan. 60A on this M4 without audio: 60 fps / 1.00× on ANGLE Metal. (Correction 2026-11-03 in HEAD Open notes.)
  - Sub-agent wall time (this epic, Qwen medium): S5.3 66 min, S6.2 34, S4.3 23, S3.2 19, S2.5b 17, S6.1 15, S2.5a 14, S6.3 14, S7.1 4.
- 2026-11-03 — Session 6: CLAUDE.md + agent defs back to Anthropic models (`481d97b`): planner Fable 5.1 max, others Opus 5.5 max, researcher high. TouchDesigner explained to the user (Derivative; Non-Commercial free ≤1280×1280, Commercial $600, Pro $2200). STATE HEAD compacted.
