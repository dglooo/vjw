# Hardening ledger — scenes shipped fast (Tier S), reliability debt

## TL;DR
- One line per scene or feature shipped without the full Tier 3 checks (user 2026-11-16: speed now, reliability in the hardening phase). Each line names what is not proven.
- The hardening phase runs Tier 3 S4–S6 on each line (tests, bench, flash and binding checks, AV QA). Until then a line is debt, not a blocker.

## Freshness
- 2026-11-16, lead. Source: STATE.md HEAD; plan_amen_shatter.md; cqa_neuro_serpent_spike.md.

## Ledger
- **Neuro Serpent** (`builtin:neuro-serpent`, merged as is `a1d297e`): CQA REVISE HIGHs F-02…F-06 unverified after fix 1 (no sheet v2); slow-class bench T-P1 UNKNOWN (normal 2.17/2.19 ms); T-LC/CTX, T-R4a/R5a/R6a, T-S10/S12, T-C13, T-M2 not run; dub ripple per-beat .20 vs .10 target; absence wind flag OFF.
- **Amen Shatter** (`builtin:amen-shatter`, `527aede`): plan S5.2 (flash/tiles/binds/60 s), S5.3 (stills guards, T-C15), S6 bench T-R2a/b alone on the GPU (slow margin thin: one overlapped 5.08 ms), S7 final sheet; G-2/G-6 numbers (T-A1r M-8).
- **Rave Lasers** (closed S7): Tier-2 follow-ups — quiet↔loud flapping in sparse intros; more chase-pattern types; creative numeric misses (I-1, waived by the user).
- **Camera** (CP1 ✅, CP2 merged): CP2 close needs the user's Windows PC run (U2.1); UNKNOWNs B20 (GPU delegate loss), booth clip, live latency; dj-* MED tuning after the user's look.
- **App:** after a real GPU context loss the show stops (reload → Start + reload the file by hand).
- **MilkDrop sync** (`milk-sync`, `63ca394`): the drop burst gives 1–3 bright frames per drop; presets flash on their own (the app flash gate does not see a preset's luma); 2/25 presets ignore `sync`; gates were PASS by ruling under load (re-run at idle).
- **Tests:** Shatter T-A10 runs ≈ 50 s under load (60 s simulated) → the slowest test; lighten the fixture.
- **Audio detectors (design items, `dsp_detector_2026-11-16.md` § Remaining):** no-dip drops (nothing arms while the bass stays through the build), bass stabs after breaks indistinguishable from drops at fire time, the fresh-lock tempo pick on two-step DnB (R1), the stuck grid under a wrong genre range (R4), T3 4/5 partner not shippable. Targets recall ≥ 75 % / false ≤ 3 not reachable by knobs → system-designer ruling later.
- **Tempo T1:** the ⅔-window cap is unmeasured on real techno (the set has no techno track); Sandstorm 70.3 lost because the stale 160 grid decays to conf 0 under DnB and D2 blocks the intro return (R4 stuck grid).
- **Line-in (dsp_linein):** analysers tap before `recDelay` → on a file they lead the heard sound by ≈ 44 ms, line-in reacts 33–44 ms later (fix: analysers after `recDelay`, needs a live A/B by the user); first tempo lock depends on window phase on both paths (re-check the octave when a later reading disagrees at conf ≥ .9); not measurable without hardware: real input latency / drift, 48 → 44.1 kHz resampling, mono feeds, live-mix transitions.
- **WebGPU layers (S1-W):** the billed `gpuMs` (WebGL timer) does NOT see WebGPU work (flat 1.99 ms from 1 M to 4 M) → budget WebGPU layers as `gpuMs` + their own timestamps, and the governor must read both; TS 6.0 DOM types lack `getContext('webgpu')` / `GPUBufferUsage` → `@webgpu/types` or local declares.
- **WebGPU splat (S2.4):** 1 M as shipped ≈ 5.5 ms at res .5 (just over the 5.0 budget) because Chrome's WebGPU-canvas snapshot into WebGL costs ≈ 1–2 ms (S1-W's 0.35 ms did not reproduce; cause not isolated). Lever: cut the snapshot (smaller canvas, or a direct resolve path); the lead's alone rerun of row B sets the record.
- **GL hygiene:** `native/spectrum` (and likely other pre-GPU3D natives) leave blendFunc / program / texture units / clear colour changed after `draw` (S5.1 control finding); particles + fluid now restore `PASS_LIST`.
- **Sources one frame late:** `app.ts` builds the Auto-style copy of the sources before writing `src.drop`, `src.build`, `src.presence` → built-in scenes see those one frame late (S3.3 finding).
- **Kick light on new user nodes (fa, 2026-11-16):** tunnel / spectrum / glitch / particles light only through ⚡ `hit`; built-ins bind it to kick (`KICK_HIT`), but a node added in the editor (incl. "new scene" spectrum) has no `hit` binding → no kick light. Fix: a default `bind` suggestion on each native's def.
- **Flash audit grade (fa):** the starred audit ran 30 s per scene with overlapping Chromes (info-grade); only the fixed scenes have full 60 s I-FL1 records. Hardening: a 60 s alone pass over every starred scene, both fixtures.
- **Bars at the flash cap (fa2):** `builtin:bars` passes I-FL1 at exactly 3/s; 72 steps/60 s remain from bars jumping up instantly on hits (motion, left as is). Also: own/strobe default binding for new nodes still fires every beat (pixel-strobe built-in moved to per bar).
- **Donor syn scenes (2026-11-17):** Dark Twister starred at billed 7.5 ms (res .25, L-class by ruling); porter lanes star on overlap-grade numbers (≤ 7.5 ms) → alone rerun of every starred syn scene; Beats in 4D Library-only (drop luma fall 4/s; try a darker build); guessed syn semantics (CurvedTime, BPMTwitcher, BPM LFO ranges, Intensity) marked ⚠️ in `SYN`.
