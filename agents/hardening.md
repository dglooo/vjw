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
