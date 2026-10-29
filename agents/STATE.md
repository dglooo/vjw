# STATE — VeeJay Wizard

> Owner / single writer: the lead (main session). Read HEAD at every session start; update after every sub-agent call, user decision and at session end. Rules: `CLAUDE.md` § 📌 STATE.md.

## HEAD

**Updated:** 2026-10-29 (session 4)
**Stage:** pilot ✅ → Stage 2a `effects` ✅ (tag `cp7-effects`). **Now: epic `audio-reactivity`, wave W1 coding (5 parallel worktrees).**
**Spec:** `thoughts/spec_veejay_wizard.md` + `thoughts/spec_effects.md`. **Team:** `.claude/agents/`; planner and security-auditor on Fable 5.1, tester on Haiku 5.5, the rest on Opus 5.5.

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
- ▶ **Wave W1 (parallel worktrees):** S1.1 analysis.ts extraction ‖ S1.2 drums + synth fixtures ‖ S2.1 IIR band bank ‖ S2.2 presets + settings ‖ S4.2 restyle + engine styled overlay.
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
