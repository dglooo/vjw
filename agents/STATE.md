# STATE — VeeJay Wizard

> Owner / single writer: the lead (main session). Read HEAD at every session start; update after every sub-agent call, user decision and at session end. Rules: `CLAUDE.md` § 📌 STATE.md.

## HEAD

**Updated:** 2026-10-28 (session 3, in progress)
**Stage:** 1 — pilot (CP1–CP4 done, CP5 coding) → 2a `effects` (spec grilled, research running). **Now: CP5 coding ‖ effects research ‖ the user plays live on :8080.**
**Spec:** `thoughts/spec_veejay_wizard.md` (rewritten in session 3; see decisions below).
**Team:** `.claude/agents/` → researcher, system-designer, planner, frontend-coder, tester, security-auditor. backend-coder is dormant. Models: planner + security-auditor on Fable 5.1, tester on Haiku 5.5, the rest on Opus 5.5.

### Pipeline status (pilot)
- ✅ Research (4 artifacts, see INDEX), design `design_pilot.md` rev 3, and the **gate** (2026-10-27): A twgl imperative; H hybrid analysis; Q3 own ACF+PLL; Q6 MP4 first; Q4/5/7/8/9 = designer defaults.
- ✅ Plan `plan_pilot.md`: 25 steps, CP1–CP5 + S6.1. Probe results are under S1.2: MP4 OK, worklet via `?worker&url`, msg ≈2–3 ms, Start needed, **resizing mid-REC corrupts the MP4** (freeze size), actual bitrate ~21 Mbps vs 12.
- ✅ **CP1–CP4 code-complete** (S1.1–S4.3 + T1); gates green (42 tests); the lead and the coders verified in the installed Chrome via Playwright.
  - CP1 tunnel reacts. CP2 onsets on the grid (38/41 with a noise floor). CP3 4 scenes + director + keys. CP4 governor, Q modes (30 = 30.0 fps), REC MP4 frozen size, 0 decoder errors.
  - 60A fullscreen M4: 0 drops; worst GPU 9.7 ms.
  - ✅ **USER verified (2026-10-28): kicks register and the visuals look fine** (live check). Still open: the `?debug` channel check, the `?flash` lag video, and the 30-min run.
  - Polish later: steppy bass bars; particles blow out white; keys don't wake the overlay; a key mid-fade cuts the fade; THIRD_PARTY must list the twgl TF example.
- ⏳ USER: the CP1–CP4 demos on line-in, plus the **30-min §7.5 run** (60A, no REC; pass = drops(31:00) − drops(1:00) ≤ 30).
- ✅ **REC (low priority per user):** MP4 1 s timeslice, REC dot always visible, letterbox, file REC audio delayed 45.8 ms, keyframe every 60 s, auto-split at 20 min. 45 tests.
  - Known Chrome bugs (`research_recording_mp4.md`):
    - fragment-tail duration → QuickTime drift, now ≈0.5 s / 30 min;
    - the 4 GiB crash on M156/157, avoided by the split;
    - no AAC edit list, so ffmpeg players show audio +48 ms.
  - Backlog: WebCodecs + mediabunny recorder.
- 🎤 The user is playing live with a mic (voice) on a **frozen build snapshot**: scratchpad `live/` served by `python3 -m http.server 8080` (lead bg task), so the coders' edits don't reload the page.
- ▶ frontend-coder on **CP5 (S5.1–S5.4)**: own tempo (ACF) + sync (PLL) + wiring + bench.
- 🎤 **USER live test (2026-10-28):** "ахуенно зашло". The user wants many more effects, then their own scene editor.
- ▶ **Epic `effects` (Stage 2a):** grilled 2 rounds + confirmed → **`thoughts/spec_effects.md`**.
  - Layers + effect chains; any param bindable to audio; ISF + gl-transitions + Shadertoy paste + own effects in 4 categories; slider panel.
  - Order: effects first, editor (2b) later. MIDI later; single screen for now.
  - ✅ researcher → `research_editor_effects.md`.
    - ISF-Files 327 shaders (MIT); isf.video 10.5k (no license field); gl-transitions 125 (MIT, GLSL3).
    - The ISF JS runtime can't take audio inputs or target our FBO, so an own loader is likely.
    - Shadertoy API needs a key; lygia is Prosperity (personal OK); xyflow is MIT + React 19.
  - ✅ system-designer → `design_effects.md`.
    - Variants: A own ISF loader on twgl (recommended) / B vendored ISF lib / C own format.
    - Shared: SceneDoc v1, bindings in the loop, a gl-transitions pass, feedback buffers resampled on governor steps, 5 ms GPU/scene, compile everything at Start, `?bench` curation. Gaps G1–G3 become probe steps.
    - Pure modules can start alongside CP5; `app.ts`/`director.ts` edits wait for CP5 (no git!).
  - ⏳ USER GATE: the variant (+ counts: ≥30 effects, ≥5 per category, ≥10 transitions, taken as default).
- Lead tooling: Playwright scripts in the scratchpad drive the installed Chrome (not Docker: a container has no M4 GPU or H.264).

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
