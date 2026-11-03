# STATE — VeeJay Wizard

> Owner / single writer: the lead (main session). Read HEAD at every session start; update after every sub-agent call, user decision and at session end. Rules: `CLAUDE.md` § 📌 STATE.md.

## HEAD

**Updated:** 2026-11-03 (session 6)
**Stage:** pilot ✅ → `effects` ✅ (tag `cp7-effects`) → `audio-reactivity` ✅ code-complete (22/22 steps, CP1–CP7, `8db53d0`, 316 tests). **Now: 3.5 h autonomous run (user, until 21:10 MSK) over the post-epic queue.**
**Spec:** `thoughts/spec_veejay_wizard.md` + `spec_effects.md` + `spec_audio_reactivity.md`. **Team (user 2026-11-03):** `planner` Fable 5.1 max; everyone else Opus 5.5 max; `researcher` high. The Qwen trial (11-01..11-03) is over.

### Running now
- ▶ coder (Tier 1): `AudioContext.playbackStats.underrunEvents` in `?debug` + `?bench`, plus the §4.7 60A measurement under real audio (harness `scratchpad/s8-underrun60a.mjs`).
- ▶ researcher: `agents/research/research_butterchurn_integration.md` (MilkDrop epic, Tier 3 step 1).
- ▶ researcher: `agents/research/_adhoc/effects_polish_2026-11-03.md` (scopes polish items 1–7 for one-coder-each briefs).
- ⏰ heartbeat cron every ~20 min until 20:47, wrap-up at 21:12 (session-only).

### Queue (lead order)
1. Merge the underrun step; correct the §4.7 row in the plan's CP7 closeout with its numbers.
2. Effects polish items, one coder each, ordered by shared files (from the scoping artifact). User 2026-11-03 "го дальше" over the list = go for polish. The big effects re-brief still waits for the user's brief.
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
- 2026-10-31: one coder at a time. 2026-11-01: fully autonomous runs (the lead halts only on hard blockers). 2026-11-03: team models above.

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
