# Design: Neuro Serpent (DnB wave 4, Scene A)
## TL;DR
- One shared CPU rig, three render paths. **A** = an instanced tube mesh + a depth renderbuffer in the native's own HDR target. **B** = an SDF raymarch. **C** = sorted camera-facing strip impostors, no depth.
- **Recommend A.** Estimated billed +flash p95: 2.2-3.5 ms normal, 3.7-5.8 ms slow (x1.65) with MSAA 4x (mode M); 2.0-2.8 / 3.3-4.7 ms single-sample with a post edge smooth (mode S). MSAA has no cost basis in the repo, so the spike A/Bs the two AA modes first. The lever chain is in §4.
- B fails R2 (about 12 ms normal at full res, even with an analytic helix). C is the cheapest (3.4-4.7 ms slow) but pops where the body crosses itself (the whip) and folds at tight bends.
- Every variant: 1 new scene file + 1 test + registration, no engine change, the Rave Lasers pipeline shape (HDR target -> 1/8 glow chain -> one composite), not `createBloom`.
- SG1: add a `reeseLevel` source, for presence only; the body rows stay on `band8`. A bass that returns on a kick reads 0.2 s late (features.ts L19-22, L63), so C12 needs a reading (Decision 3).
## Freshness
- 2026-11-15, system-designer, master `d73907a` + the uncommitted `creative_neuro_serpent.md`.
- Artifacts: `agents/creative-director/creative_neuro_serpent.md` TL;DR-§3, §6, §8, Signal gaps. `thoughts/spec_dnb_wave4.md` §5. `agents/research/research_dnb_wave4.md` §1, §4. `agents/audio-dsp/dsp_dnb_wave4.md` §3, §5. `agents/STATE.md` HEAD.
- Read outside the brief's ranges: creative §4, §5, §7 (one whole-file read) and dsp TL;DR-§2 (the SG1 basis).
- Code (narrow): `gl/scene.ts`, `gl/view.ts`, `gl/post.ts`, `gl/bloom.ts` L1-75, `gl/engine.ts` L16, L22, L80-99 (grep), `fx/own/liquid-chrome.fs` L30-56, `scenes/wireform.ts` L1-125, `scenes/lasers.ts` L1-40, L540-654, `scenes/isobars.ts` L1-16, L478-517, `audio/features.ts` L1-120, `frame.ts`, `fx/types.ts`, `bind.ts` L7, L12, L26, L122 (grep), `fx/catalog.ts` L8, L26 (grep), `scenes/builtin.ts` L1007-1015 (grep).
- Not read: `gl/live.ts`, `audio/arrange.ts`, the rest of `bind.ts` and `builtin.ts`, the SDLC doc. Web: not used.
- Parts: 9 files (`design_neuro_serpent.md`, `.2.md` to `.9.md`). Join = concatenate in order.
