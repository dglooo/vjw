# STATE — VeeJay Wizard

> Owner / single writer: the lead (main session). Read HEAD at every session start; update after every sub-agent call, user decision and at session end. Rules: `CLAUDE.md` § 📌 STATE.md.

## HEAD

**Updated:** 2026-10-31 (session 5)
**Stage:** pilot ✅ → Stage 2a `effects` ✅ (tag `cp7-effects`). **Now: epic `audio-reactivity`, wave W1 coding (5 parallel worktrees).**
**Spec:** `thoughts/spec_veejay_wizard.md` + `thoughts/spec_effects.md`. **Team:** `.claude/agents/`; **planner and security-auditor now on Opus 5.5 xhigh** (user, 2026-10-31; downgraded from Fable), tester on Haiku 5.5, the rest on Opus 5.5.

### Pipeline status
**Pilot (`plan_pilot.md`): ALL done** (CP1–CP5 + S6.1). Verified in Chrome and live by the user.
- ⏳ USER (optional): 30-min §7.5 run, `?debug` channels, `?flash` lag, BPM vs rekordbox.
- REC is low priority: MP4 1 s timeslice, keyframe 60 s, 20-min split. Chrome bugs are in `research_recording_mp4.md`. Backlog: a WebCodecs recorder.

**Epic `effects` (Stage 2a, `plan_effects.md`, Variant A):**
- ✅ CP1 `f421b38` · CP2 `cp2-effects` (bench, natives, compile-all) · CP3 `cp3-effects` (compositor, transitions, Shadertoy) · CP4 `cp4-effects`.
  - **CP4:** 27 starred scenes, 34 effects (14 ISF, 16 own, 4 natives, 1 toy), 13 transitions.
  - All scenes ≤5 ms GPU at 1728×1118 (heavy gens at res 0.5), 0 errors. Contact sheet `scratchpad/cp4walk/contact.png`.
- ✅ S5.1 panel engine (`edit.ts`, `live.panel`, E/Esc). 129 tests.
- ▶ **Wave 6 (parallel worktrees):** ✅ S5.2 Panel UI (0 re-renders and 0 drops while dragging) ‖ ✅ S6.1 library (IndexedDB, stars → playlist, JSON; 142 tests) ‖ ✅ polish (wave-landscape shards fixed, res 0.5 p95 ≤5 with ~1 ms headroom; the 3 ms stage "floor" is an ANGLE/Metal timer-query artifact, real pass ≈0.04 ms; scene gpuMs carry ~1 ms of overhead).
  - ✅ S5.3 paste dialog + S6.2 library buttons + `director.cut` (144 tests; Chrome 18/18 and 24/24). **CP5 + CP6 done.**
  - ✅ **CP7 (2026-10-28): epic `effects` COMPLETE (27/27 steps), tag `cp7-effects`.**
    - S7.1: THIRD_PARTY 43 shader rows (`scripts/shaders.mjs`). Unverified upstreams: Truchet, VHS Glitch, v002 CRT, McGuire noise.
    - Fix: inline Save-as field.
    - S7.2 lead regression: all keys, REC 30 s clean, 5-min 60A 3 drops, 0 errors.
    - **Final count:** 27 starred scenes; 34 effects (ISF 14, own 16, natives 4, toy 1); 13 transitions; retro ≥7, geometry ≥8, feedback 9, liquid 5.
- Polish backlog:
  - Slit scan is weak;
  - liquid chrome makes a ring every kick;
  - strobe is full-white every beat (taste, safety);
  - spectrum takes ≤2 filters;
  - a structural panel edit restarts the scene;
  - steppy bass bars; keys don't wake the overlay.
- Heads-ups: S6.2 must handle "Save as keeps editing the on-screen scene", plus stars from `library.get(id)?.star`; `library.del` of the on-screen scene must not crash. The bench needs a quiet GPU (parallel benches inflate 2×); parallel coders prefix scratch files; `builtin.ts` append conflicts are resolved by the lead (keep both).

**🗣 USER FEEDBACK on effects (2026-10-28):** not everything is liked. Some effects and old shaders need rework or improvement; the user will give a **separate brief** on what and how to redo, including the built-in scenes. Don't polish effects on our own until that brief.

**Next epic: flexible, genre-aware audio reactivity** (DnB reese/kick/snare/hats as sources).
- `research_audio_features.md`; grill (2 rounds + confirm) → **`thoughts/spec_audio_reactivity.md`**.
  - Sources: kick/snare/hats, sub/reese/wobble, build/drop, custom bands. Presets: DnB, dubstep, techno/house.
  - Auto-style mode (default on; manual overrides; smooth). Drop: heat-up, then flash + cut. "Sources" tab in the panel.
- ✅ system-designer → `design_audio_reactivity.md`: A main-thread 8192 analyser (sustained lag 85–102 ms) / B worklet IIR bank + fast/slow envelopes (30–70 ms, recommended). 8 research gaps, none blocking.
- ✅ **USER GATE (2026-10-28): Variant B** (worklet IIR bank + fast/slow envelopes). Designer defaults accepted (F1 ≥ 0.70 at ±30 ms; ≤8 custom bands; heat strobe ≤0.15).
- ✅ Plan `plan_audio_reactivity.md`: 7 CPs, 22 steps, 13 waves. The 5th attempt (Sonnet, exact line-range reads, incremental writes) finished in 2 min.
  - Lesson: planners must read narrowly and write incrementally (this is now standard in planner briefs).
- ▶ **Wave W1, resumed 2026-10-31.** All 5 coders hit the 5-h usage limit on 10-29 ~19:50.
  - S1.1, S2.1, S2.2 and S4.2 continue in their existing worktrees (partial work kept).
  - S1.2 restarted fresh (its worktree was lost).
  - ✅ S4.2 merged (`c45062f`). ✅ S2.2 merged (`ae05de4`, 195 tests; `createSettings(kv, sampleRate)`; non-kick `proto` values are placeholders for S4.1).
  - ✅ S1.1 merged (`bc05c76`, 196 tests): pure `analysis.ts`; golden test = old worklet output. Lead Chrome check: 41 onsets on kicks128n (same as before), 0 errors.
  - ✅ S2.1 merged: `bands.ts` IIR bank, 5.4 µs per block for 11 bands. The design's kick gate failed (it gated a sustained reese 75%), so it was reworked: separate 200 ms gate followers, TRANSIENT 1.5, HOLD 100 ms.
    - **Open for S2.4:** the sub band leaks kick body (it needs a trigger from the drum detector); a bass note starting on a kick lags ~125 ms.
  - ✅ S1.2 merged (`a110cc7`, 212 tests): `drums.ts` + `synth.ts`. DnB F1 kick 0.79 / snare 0.97 / hats 1.00; dubstep 0.80/1.00/1.00; techno 0.89/0.77/1.00.
    - ⚠️ C2 limit: a bare reese or snare fires false kicks; hit strength saturates at 4. Mitigations are briefed into S1.3 (amplitude from level) and S5.1 (the drop needs the bass back).
  - **W1 complete.** ✅ S1.3 features merged (`80e59fb`, 216 tests): a plain 0→1 envelope, because hit strength sits at the cap on all fixture hits.
  - 14:3x: the 5-h limit killed S1.4, S2.3, S3.1, S4.1 and S5.1 before they wrote anything (empty worktrees auto-removed).
  - ▶ **Re-dispatched fresh at 15:50:** S1.4 wire hits ‖ S2.3 worklet→bank ‖ S3.1 tempo range ‖ S4.1 style ‖ S5.1 build/drop. S3.1/S4.1/S5.1 append to `synth.ts`.
  - ✅ S2.3 merged (`f31f2b5`, 218 tests): `feat` every 2 hops, config rev; the bank stays idle until S2.5 sends a config (the underrun check moves to S2.5). S1.4 was told to merge master and keep the single `drums` instance.
  - ✅ S1.4 merged (`94e71d0`, 240 tests): hits wired end to end, VHS tunnel `own/flash` on `kick`, `window.__src` under `?debug`. Chrome dnb174, 10 s: kick 24 / snare 10 / hats 58 (snare leaks into kick, as known); flash +53 luma on kicks. **CP1 code-complete.**
  - Lead baseline on master: house128 locks at 128.0 in ~10 s; **dnb174 never locks in Default (conf 0 for 40 s)**, which is the target for S3.1+S3.2 with the DnB preset (S3.1 told).
  - 5-h usage limit hit again ~16:45 (reset 20:50). At 20:51: S3.1 and S5.1 resumed via SendMessage (worktrees kept; told to check for leftover sweep mutants); S2.4 and S5.2 re-dispatched fresh.
  - S3.1 merged (`f183a0d`): DnB range reads the two-step at 174/182; Default reads the ⅔ lag 116; the fold hang is fixed.
    - Master briefly red after the S3.1 merge (its test harness fed `hit` into `pushOdf`). ✅ Fix-forward `8294a83`: **master green again**, 251 tests + 1 expected fail.
    - ⚠️ **Root finding:** on full mixes the bass-flux ODF is flattened by sub/reese flicker (dnb174 conf ~0.12 < LOCK 0.3, techno full mix reads 150).
    - 🔑 **Lead decision:** tempo ODF moves to bass **transients** from the S2.1 bank's differential envelope, plus a kick veto if small. ▶ New step **S3.1b**.
    - `families` overlap (the ⅔ lag lights techno; techno/dubstep windows overlap), so S4.3 must not rely on tempo family alone.
  - 🛑 **USER (2026-10-31 21:0x): "убей всех агентов", then "делай по одному последовательно".** All 4 coders stopped; the auto-resume cron deleted.
    - **New rule: ONE coder at a time** (CLAUDE.md #11 and memory updated).
  - ✅ S5.1 merged (`b85c64e`, 259 tests + 1 expected fail): `arrange.ts` build/drop.
  - Sequential queue:
    - ✅ S2.4 merged (`89320ac`, 267 tests).
      - sub/reese/wobble hold 0.2 s on the reese gate (kick leak ×1.05 instead of ×2.4); level-independent.
      - Measured wobbleDepth: 0.25 for wobble vs ~0.09 for a steady reese, so **S4.1's W proto of 0.8 needs a retune** (fold into S4.3).
      - S2.5 must send bands sub, reese, wobble first.
      - Bass note-on-kick lags ~211 ms (accepted).
    - ✅ S5.2 merged (`5379d31`, 273 tests): heat post pass (skipped at rest), `postFor`.
      - S5.3 must: pass `now − dropAt`; add a `?debug` force-flash key; **cap the strobe at ≤3 pulses/s (WCAG 2.3.1)**, since 1/8 notes at 174 BPM give 5.8/s.
    - ✅ S3.1b merged (`022c895`, 277 tests). The tempo ODF is now the kick+snare bank transient excess.
      - Synth full mixes lock at 174/140/128, conf 1.0. Real `dnb174.wav` under the DnB range: 174 at 0.32–0.42 (was 195 at 0.12). Default still reads 116, so the S3.2 range is needed.
      - ⚠️ `dubstep140.wav` doesn't lock (only the bar downbeat is clear; a bar of 1.71 s is longer than the 1.33 s max lag). Open gap, to re-check with real tracks at S7.1. Autopilot falls back to time-based switching.
    - ▶ **S3.1c kick veto** (lead decision: ship it; precision 0.76 → 1.00, recall 0.81 → 0.75).
    - then S2.5 → S3.2 → S4.3 → S5.3 → S6.1 → S6.2 → S6.3 → S7.1 → S7.2.
  - ✅ S4.1 merged (237 tests): `style.ts`; 6 grooves detected at ~18 s, crossfades switch once, freeze holds. ⚠️ Wobble/bass inputs are assumed until S2.4; the real audio→classifier path gets verified in S7.1.

- Live-check fixtures (lead, scratchpad `fx_audio/`): `dnb174.wav` (two-step kick, snare 2/4, 8th hats, detuned 55 Hz reese) and `dubstep140.wav` (half-time, wobble LFO at 1/8 notes). Techno: `cp5/house128-long.wav`.
- The user now understands that scenes can be built in the panel ("вроде кайф"); the effects re-brief is still pending.

**Infra:**
- 🕸 graphify: root `.` → `graphify-out/`, post-commit hook.
- ⏰ auto-resume cron: session-only, re-created each session.
- 🎤 :8080 = scratchpad `live/` (`http.server`, lead bg task), refreshed at CP4.
- 🔑 Dispatch rule: one step per agent, parallel worktrees, time-boxed (CLAUDE.md #11).

### Key decisions
- Session 2 (/grill-me): browser pilot, Chrome-first, localhost; Vite + React + TS; Electron later. Minimal auto-hiding overlay, REC via MediaRecorder, quality modes 60 adaptive / 60 full / 30. After the pilot: editor → camera → clip mixer.
- Session 3 (user):
  - **Any dependency license** (GPL/AGPL/NC included); the project is personal. Spec §6, CLAUDE.md and the agent defs are updated.
  - **Line-in only** (rig: rekordbox, sometimes Pioneer USB); MIDI/Link come later.
  - **Butterchurn moves to the next step**; the pilot is one engine with 4 own scenes.
  - **Analysis = (a) energy, (b) onsets, (c) tempo+phase**; (c) is a non-blocking bonus with its own metrics.
  - "No library exists, so write it ourselves" was premature: the user found beatfinder (MIT), and its claims are under verification.

### Open ⚠️ assumptions
Tracked in `design_pilot.md` § "Spec §8 and STATE ⚠️ ledger"; the gate (Q4–Q9) resolves them.

### User preferences
Talk in Russian. **Grill/AskUserQuestion ONLY at new-feature discovery (+ the one variant gate); never during execution** (user, 2026-10-29). **Decide minor/technical choices yourself with the recommended default; ask only for real gates/scope** (user, 2026-10-28). REC is low priority. No Docker (user asked; host tooling is enough). Run decision rounds via AskUserQuestion. Artifacts in English. The user may paste external AI reviews: treat them as leads to verify, not facts.

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
