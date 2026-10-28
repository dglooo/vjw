# STATE — VeeJay Wizard

> Owner / single writer: the lead (main session). Read HEAD at every session start; update after every sub-agent call, user decision and at session end. Rules: `CLAUDE.md` § 📌 STATE.md.

## HEAD

**Updated:** 2026-10-28 (session 3, in progress)
**Stage:** 1 — pilot (CP1–CP4 done, CP5 coding) → 2a `effects` (spec grilled, research running). **Now: planner → `plan_effects.md`; the user can play CP5 live on :8080.**
**Spec:** `thoughts/spec_veejay_wizard.md` (rewritten in session 3; see decisions below).
**Team:** `.claude/agents/` → researcher, system-designer, planner, frontend-coder, tester, security-auditor. backend-coder is dormant. Models: planner + security-auditor on Fable 5.1, tester on Haiku 5.5, the rest on Opus 5.5.

### Pipeline status
**Pilot (`plan_pilot.md`): ALL steps done (CP1–CP5 + S6.1); gates green (75 tests).** Details are in TAIL and the plan's drift notes.
- Verified by the lead and coders in the installed Chrome via Playwright. The user verified kicks and visuals live.
- 60A fullscreen M4: 0 drops. Tempo 128 ± 1 at ~5 s; bar-line autopilot.
- ⏳ USER (optional): the 30-min §7.5 run (60A, no REC; pass = Δdrops ≤ 30), the `?debug` channel check, the `?flash` lag video, the CP5 BPM vs rekordbox.
- REC is low priority:
  - MP4 1 s timeslice, keyframe 60 s, split every 20 min;
  - Chrome bugs (QuickTime drift ≈0.5 s / 30 min, 4 GiB crash on M156/157) are in `research_recording_mp4.md`;
  - backlog: a WebCodecs recorder.
- Polish backlog: steppy bass bars; particles blow out white; keys don't wake the overlay; a key mid-fade cuts the fade; cut recovery 16 beats (accepted).
- ✅ **S6.1 closeout:** THIRD_PARTY.md + `scripts/licenses.mjs`; probe deleted; `main.tsx` imports are static. Lead smoke in Chrome OK. **The pilot plan has no open steps.**
- 🎤 Live snapshot: scratchpad `live/` on :8080 (`python3 -m http.server`, lead bg task), refreshed with CP5. Test scripts use `--mute-audio`.

**Epic `effects` (Stage 2a):**
- Spec `thoughts/spec_effects.md` (grilled + confirmed); research `research_editor_effects.md`; design `design_effects.md`.
- ✅ **USER GATE 2026-10-28: Variant A** (own ISF loader on twgl). Counts default: ≥30 effects, ≥5 per category, ≥10 transitions.
- ▶ planner → `agents/planner/plan_effects.md`.

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
