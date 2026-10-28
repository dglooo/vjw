# STATE — VeeJay Wizard

> Owner / single writer: the lead (main session). Read HEAD at every session start; update after every sub-agent call, user decision and at session end. Rules: `CLAUDE.md` § 📌 STATE.md.

## HEAD

**Updated:** 2026-10-28 (session 3, in progress)
**Stage:** 1 — pilot (CP1–CP4 done, CP5 coding) → 2a `effects` (spec grilled, research running). **Now: effects CP2 wave 1 (3 parallel worktree coders); the user plays on :8080.**
**Spec:** `thoughts/spec_veejay_wizard.md` (rewritten in session 3; see decisions below).
**Team:** `.claude/agents/` → researcher, system-designer, planner, frontend-coder, tester, security-auditor. backend-coder is dormant. Models: planner + security-auditor on Fable 5.1, tester on Haiku 5.5, the rest on Opus 5.5.

### Pipeline status
**Pilot (`plan_pilot.md`): ALL steps done (CP1–CP5 + S6.1); gates green (75 tests).** Details are in TAIL and the plan's drift notes.
- Verified in the installed Chrome (lead + coders) and live by the user. 60A M4: 0 drops; tempo 128 ± 1 at ~5 s.
- ⏳ USER (optional): 30-min §7.5 run (Δdrops ≤ 30), `?debug` channels, `?flash` lag, CP5 BPM vs rekordbox.
- REC is low priority:
  - MP4 1 s timeslice, keyframe 60 s, split every 20 min;
  - Chrome bugs (QuickTime drift ≈0.5 s / 30 min, 4 GiB crash on M156/157) are in `research_recording_mp4.md`;
  - backlog: a WebCodecs recorder.
- Polish backlog: **particles 6.36 ms p95 with kicks (over budget)**; spectrum takes ≤2 filters (3 → 6.2 ms); strobe is a full-white flash every beat (check taste/safety); steppy bass bars, white-out particles, keys don't wake the overlay, mid-fade key cuts, 16-beat recovery (accepted).
- ✅ S6.1 closeout: THIRD_PARTY.md, probe deleted (commit `3ea87d2`).
- 🎤 Live snapshot: scratchpad `live/` on :8080 (`python3 -m http.server`, lead bg task), refreshed with CP5. Test scripts use `--mute-audio`.

**Epic `effects` (Stage 2a):**
- Spec `thoughts/spec_effects.md` (grilled + confirmed); research `research_editor_effects.md`; design `design_effects.md`.
- ✅ **USER GATE 2026-10-28: Variant A** (own ISF loader on twgl). Counts default: ≥30 effects, ≥5 per category, ≥10 transitions.
- ✅ Plan `plan_effects.md`: 27 steps / 7 CPs (CP2 bench + natives, CP3 compositor/transitions/Shadertoy, CP4 content ×5, CP5 panel, CP6 library, CP7 closeout). `donor/` fetched (git-ignored).
- ✅ **Effects CP1** `f421b38`: ISF loader + bindings + SceneDoc, KALEIDO TUNNEL on bass (lead-verified, 109 tests). The coder was stopped at ~4 h for context bloat.
- 🔑 **USER (2026-10-28): one step per agent, parallel worktrees, time-boxed** (CLAUDE.md workflow #11, memory `one-step-per-agent`).
- Wave 1: ✅ S2.3 natives (7 min, `9b98f74`) ‖ ✅ S3.1 GLSL ES3 wrappers (12 min, `02f1505`, 116 tests; all 125 gl-transitions link) ‖ ✅ S2.1 director hooks + GPU timer (13 min, `d87b694`, 119 tests).
  - Heads-ups for later briefs:
    - S4.5 skips the ivec2 transitions, FlashFade, DisplacementMap and LumaWipe;
    - S3.4/S5.3 need `#define HW_PERFORMANCE`;
    - parallel coders must prefix their scratchpad file names (step id).
- Wave 2: ✅ S2.4 particles native (6 min, `6620359`; Scene/SceneFactory gone; master walk: 5 scenes, 0 errors) ‖ ✅ S2.2 `?bench` + ISF sweep (16 min, `c30951c`).
- :8080 refreshed with master `6620359` (5 scenes incl. KALEIDO TUNNEL).
- Bench:
  - sweep: 263/327 ISF compile, 245 usable (no "liquid" category in ISF-Files, so liquids are our own);
  - cold ISF compile ~43 ms each;
  - **lead run at 1728×1118: G2 0 drops (no pool needed); GPU tunnel 0.8, spectrum 3.0, particles 4.55, glitch 1.3, kaleido 1.05 ms (all ≤5).**
- ✅ **CP2 done:** S2.5 compile-all + prepare-ahead (0 late frames on first visits, 214 ms warm-up, no leaks).
  - Lead 5-min autopilot at 1728×1118: all 5 scenes on bar lines, 3 drops / 5 min (pass ≤1/min), 0 errors. :8080 refreshed.
- Wave 4: ✅ S3.2 engine ‖ ✅ S4.4 retro (8 fx) ‖ ✅ S4.2 3D (4 gens) ‖ ✅ S3.3 compositor (blend/res/multipass; `res` 0.5 = −25–41% GPU) ‖ ▶ S4.5 transitions. 14 scenes, 121 tests.
- ▶ Wave 5 (parallel): S3.4 Shadertoy node ‖ S4.1 feedback/kaleido/mirrors ‖ S4.3 liquids/metal ‖ S4.2b (dropped 3D retried with `res` + particles budget fix). Then CP5 panel (S5.1 after S3.4).
  - S4.2/S4.4 don't need CP3; `res` is honoured after S3.3. Then S3.3 → S3.4 → S4.1 feedback + S4.3 liquids (need PERSISTENT) ‖ S4.5 transitions ‖ CP5 panel. Then wave 3: S2.5 compile-all + prepare-ahead → CP2 check → refresh :8080.
  - Next: wave 2 = S2.2 bench ‖ S2.4 particles; wave 3 = S2.5. :8080 is not refreshed until CP2.

**Next epic (requested 2026-10-28): flexible, genre-aware audio reactivity.**
- ✅ `research_audio_features.md`: user bands + envelope followers are cheap (16 = 0.34% core); kick vs sustain via differential envelopes; drum classes on full mixes F 0.58–0.82; ML stems offline only; 40/60 Hz needs FFT 8192; genre tempo ranges fix the octave fold.
- Next: a short grill + design once effects CP1/CP2 land (the user: "wait, then see").

- 🕸 **graphify**: root `.` → `graphify-out/` (git-ignored); a post-commit hook rebuilds it. A type-only cycle `catalog→tunnel→engine→live` remains (runtime-safe).
- ⏰ **Auto-resume cron** `0fc53f5a` (every 30 min, :17/:47 + offset; session-only, expires after 7 days). It re-dispatches agents that died on usage limits and continues the pipeline.

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
Talk in Russian. **Decide minor/technical choices yourself with the recommended default; ask only for real gates/scope** (user, 2026-10-28). REC is low priority. No Docker (user asked; host tooling is enough). Run decision rounds via AskUserQuestion. Artifacts in English. The user may paste external AI reviews: treat them as leads to verify, not facts.

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
