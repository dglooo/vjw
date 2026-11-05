# STATE — VeeJay Wizard

> Owner / single writer: the lead (main session). Read HEAD at every session start; update after every sub-agent call, user decision and at session end. Rules: `CLAUDE.md` § 📌 STATE.md.

## HEAD

**Updated:** 2026-11-05 13:5x (session 8, Telegram; hook fixed, real-track audit running)
**Stage:** pilot ✅ → `effects` ✅ → `audio-reactivity` ✅ → `milkdrop` ✅ → **`2d TD look` ✅ (plan_td_look.md, 18 steps, CP1–CP4; 11 new scenes + rebind of 23)**; polish §3 §5 §6 §7 ✅. 349 tests.
**Spec:** `thoughts/spec_veejay_wizard.md` + `spec_effects.md` + `spec_audio_reactivity.md`. **Team:** `planner` Fable 5.1 max; others Opus 5.5 max; `researcher` high.

### Where we stopped (2026-11-04 04:2x)
- **MilkDrop done.** 25 curated presets, one per author. Butterchurn GPU p95 2.58–3.52 ms. They are spread evenly in the autopilot and all starred.
  - Stack: butterchurn 3.0.0-beta.5, presets from 3.0.0-beta.4, copy path (a), pool of 2 visualizers, warm at Start.
  - CP3 close-out (lead, `scratchpad/milk-cp3.mjs`): 64 s, 16 switches over the live 52-scene playlist. 3842 frames, 0 late, jsMs 1.4, 1.00×.
  - Worst case (ruling 5, `scratchpad/milk-worst.mjs`): 0 of 3901 frames late. Contact sheet: `scratchpad/milk-picks-sheet.png`.
- **Polish done:** §7 keys wake the overlay (`d55f4ae`) · §6 Spectrum low-bar ramp (`20a3a03`) · §3 shared WCAG flash cap + strobe at a 60% wash (`d73e2b9`, `plan_flash_cap.md`) · §5 structural panel edits no longer restart the scene (`e23c44e`, `plan_live_rebuild.md`) · Tier 1 Vitest `testTimeout` 20 s (`c738f85`).
- **User decision 2026-11-04 (session 7):** next epics = **Stage 2b effect editor, then Stage 3 camera** (spec §4); user checks/tracks deferred ("проверки потом").
- **User standing instruction 2026-11-04: "always take recommendations, don't ask"**: no grill rounds; the lead also picks the design variant (logged as a lead pick). Memory updated.
- **2b spec written** by the lead from the recommended answers: `thoughts/spec_effect_editor.md` (library + layer-stack builder, prep at home, Bars + pixel family, undo, no node graph).
- **Stopped ~12:06 (session 7 ended mid-run; nothing running at 17:35):** `researcher` finished `agents/research/research_effect_editor.md` (11:58, uncommitted). `frontend-coder` §1 slit scan was left half-done: worktree `.claude/worktrees/agent-ad8211cb17263523a`, `web/src/fx/own/echo.fs` +10/−6, uncommitted, no commit on its branch. **Exact next step:** re-dispatch §1 fresh (read that diff first), then: §2 chrome ring (lead default: one ring per bar) → system-designer 2b → lead pick → planner.
- **2026-11-04 18:0x: TouchDesigner dump = the effects quality reference (user).** `donor/td-reverse/touchdesigner/` (full extract, 1.2 GB; archive kept beside it). User: our own effects look dated, MilkDrop looks better. Study TD's palette shaders and rewrite our own by analogy, no licence pushback (personal use, not for release). Excluded: TD licence-mechanism findings (04, licence parts of 02/05/06). **Research done:** `agents/research/research_td_look.md`. The TD look = feedback chains of cheap TOPs (ref: `feedbackTOP.tox` ex3). Top 6 need no engine change: feedback fx, feedbackEdge, bloom pyramid, light tunnel + radial blur, optical-flow smear, reaction-diffusion ⚠️ (multi-pass check). Engine gaps: frame-history ring; instanced/point renderer + particle layer. **Lead pick (never-ask):** this epic goes before 2b editor (user's quality complaint). Track A, Tier 2: top 6 as own ISF effects + built-in scenes → planner. **Cancelled by the user 2026-11-04 18:2x ("отмени план пока"); no plan written, nothing running.** **Tier fix (lead, 2026-11-04):** this epic is Tier 3, not Tier 2. It is >5 files and has real alternatives: bloom as a per-layer fx or a global post pass; reaction-diffusion as ISF or a native generator; whether Tracks A and B share multi-pass infrastructure. **22:10 user "гоу" (take all recs, don't ask; resume crons: 02:15 (continue TD plan) + 07:20 (continue all tasks), set 00:16 11-05; session-only).** Lead wrote `thoughts/spec_td_look.md` (Stage 2d, answers marked `(default)`). **Design done:** `agents/system-designer/design_td_look.md`. **Lead pick 2026-11-04 22:5x (per user standing instruction; all designer defaults):** Variant A (7 own ISF files + `Native.draw(f, v, src?)` + 2D-array history ring + TF swarm/scatter). Ring: RGBA8, half stage, 32 slots, stride 1/2/2, ≤64 MiB, fixed at create. RD as ISF + S1.8 (pairs per TARGET name), native as plan B. Hybrid binding policy (drums/sub/build/drop direct; bass family via `bass` + Auto-style); CP4 rebind after CP3. `VJW_FLASH` replaces the hard-coded flash set. Parked slit-scan worktree removed; its diff is in `agents/_archive/slit_scan_wip_2026-11-04.patch`. **Plan done:** `agents/planner/plan_td_look.md` (4 CPs / 16 steps: CP1 S1.1–S1.9 Track A; CP2 S2.1–S2.4 native filters + ring; CP3 S3.1–S3.2 TF points; CP4 S4.1 rebind). Unverified points folded into steps (G2→S1.2/S2.2, G3→S1.4, G1→S2.2, G5→S1.9). Optional MIT donor port in S1.7. S1.1 ✅ `1590077` (`VJW_FLASH` → `EffectDef.flash`; live.ts gates by def; 328 tests; strobe ≤3/s). S1.2 ✅ `merge after e6fff7d` (td-feedback: GPU p95 3.0–4.4 ms, trace r≈.85 kick/snare/hats; ranges retuned, see plan note; harnesses copied to `scratchpad/td/`). ⚠️ Both fixtures have no build/drop, so the CP1 close-out needs a fixture with one (`web/scripts/make-fx.mjs`). S1.3 ✅ (edge-rings over tunnel: GPU p95 2.48 ms; trace r .82–.85; 60 s luma .10–.57, no white-out; effective loop gain kept <1). Finding: TD's real feedbackEdge gain is 1.03×.95≈.98, not 1.07 (research §1b L43 / design D2 rule 3 misread). S1.4 ✅ (bloom + bloom-glitch 3.66 ms p95; td-feedback+bloom 8.4→4.92 ms via 2-channel noise + layer res .5; flash ≤2/s, none refused).
  - ⚠️ **GPU-timer finding (S1.4):** the per-scene `gpuMs` span leaves the last pass into `acc` unbilled. A single-node scene's own cost is therefore under-reported, as in S1.2's 3.0–4.4 and S1.3's 2.48, and any appended node exposes about 3 ms. Same-session A/B or end-to-end late frames are the honest check: CP close-outs use the 60 s late-frame run.
  - Not shipped (lead: skip, measures ≈0): keep a `res`<1 layer on the `direct` path when it ends on an effect.
  - S1.5 ✅ light-tunnel (own ≈.29 ms; twirl↔reese .57 / wobble .52).
  - ⚠️ **`sub` finding (S1.3, S1.5):** `sub` is relative and sits ≈.42–.56 on a steady sub. `evaluate` = `min+(max−min)·clamp(amount·x)` has no offset, so sub-bound params barely move (radius .444–.461). Decide at the CP1 close-out: extrapolated min/max, an offset field, or a different source for presence-type params. It affects S1.9 and CP4.
  - S1.6 ✅ radial-blur (≈1.0 ms own) + `builtin:light-tunnel` = tunnel → light-tunnel → radial-blur (p95 3.07 ms; strength↔kick r .91/.90; radial-blur gained `centerX`).
  - S1.7 ✅ flow-smear (spectrum res .5 → flow-smear; p95 3.4 ms, own ≈.7; force↔reese .61 / wobble .57; luma ≤.29). Finding: at res 1, any appended node measures ≈3 ms even when stripped (same anomaly as S1.4). The CP1 close-out's late-frame run is the truth check.
  - S1.8 ✅ TARGET pairs by name (`pairsByTarget`; an 8-pass file uses 4 textures instead of 18). Also a parser fix: a repeated TARGET declared its sampler twice and failed to compile (design fact 1 missed this). No GL-call change on existing scenes. td-feedback p95 reads 4.86–5.06, borderline on this timer.
  - S1.9 ✅ reaction-diffusion (G5 holds 60 s in half float; 6 steps; p95 4.63; seed gated by fresh A; seed←sub via an extrapolated range).
  - **CP1 ✅ closed (lead):** 64 s autopilot over the 6 new scenes, 0/3842 late, 1.00×, flash ≤2/s; sheet `scratchpad/td/cp1-sheet.png`. The GPU-timer oddities did not show up as real frame time.
  - **Ruling 2026-11-05** (`design_td_look.md` § Ruling, L420–452), lead pick: fix the sources. `sub`/`reese` become `max(0,r−1)` and rest at 0 like `wobble`; the bass class binds `reese` (Dubstep map `reese→wobble`, DnB `bass` row dropped). Half the evidence was the fixtures (static bass bed, no wobble stem). New plan step **S1.10** (S): features/presets/builtin + `make-fx` arrangement fixtures with build/drop. Slotted after S2.1, before S2.2. CP4 reads `reese` where the bass class says `bass`.
  - S2.1 ✅ `Native.draw(f, v, src?)` (one line in live; a generator gets null; the picker lists any catalog def with kind 'filter', so G2 holds by code; A/B no change). Note: worktree isolation now blocks coder writes to the main checkout, so harnesses stay in the worktree's `scratchpad/` and the lead copies them out.
  - S1.10 ✅ sub/reese rest at 0; bass class → reese; new fixtures `scratchpad/fx_audio/dnb174-arr.wav` (build 23.1 s, drop 34.1 s) and `dubstep140-arr.wav` (build 28.4 s, drop 42.1 s, real wobble stem); all 8 bound params idle at min and swing to max on the drop; reset fires on drop.
  - Findings from S1.10, lead pick:
    - The drop fires only on a coin flip (DnB 1/5): the features `HOLD` 0.2 s pushes the bass return past arrange `near` 0.2 s. This is a pre-existing 2c bug, likely on real tracks too.
    - RD is black on a steady bed with seed 0→.6.
    - Both fixed in new step **S1.11** (Tier 1).
    - Side note: the classifier reads `dubstep140-arr` as techno; that is a separate issue, queued for the real-track tuning.
  - S1.11 ✅ arrange `near` = features `HOLD` + 0.15: app drop 5/5 DnB and 5/5 Dubstep, no extras. acceptance §4.5 now runs the held path on both arr fixtures at 20 frame phases; the fire lands 0.32–0.34 s after the drop, ~6 ms inside one DnB beat. RD seed min .3: coral ≈3 s on the bed. 340 tests.
  - S2.2 ✅ history ring (`scenes/history.ts`, 32 slots at ½ stage, 61.8 MB allocated in create and fully freed) + `native/rgba-delay` (spread←reese, rotate←snare event) + `builtin:rgba-delay`: p95 2.62, own ≈.9 ms; G1/G2 hold; no ghost. Finding: the first ring scene per session drops one frame (Metal cache); check it in the CP2 run (fix: `warm()` draws once into a 1×1 array).
  - S2.3 ✅ `native/time-machine` + `builtin:time-machine` (Truchet, tSize←kick; stride 2 with half-slot lag; new `tint` input; p95 1.72, own ≈.84; beat-locked r 1.000; depth .30→.77 on the build; swirl r .97 reese / .82 wobble). The θ seam at fractional swirl is visible in the drop shots. Lead pick: the seamless mirrored `|θ|/π`, folded into S2.4 (same file).
  - S2.4 ✅ `native/slit-scan` (axis y/x/radius) + `builtin:slit-scan-ring` (p95 3.77, own ≈.68; span r .99 sub, wave r .97 reese / .84 wobble). Time-machine seam fixed (`|θ|/π`).
  - **CP2 ✅ closed (lead):** 64 s over the 3 ring scenes on `dnb174-arr`, 0/3841 late, 1.00×. 2 live rings = 124 MB. The timer's +3 ms is not real frame time.
  - S3.1 ✅ `native/swarm` + `builtin:swarm`: N 65536 (131k = 5.61 ms; the D5 lever), p95 4.13 ms, +22.4 MB freed; glowing filament threads; burst↔kick .96, trail↔build .89, size↔sub .996, turbulence↔reese .97 / wobble .82; spawn on drop. Finding: TF ≈25 µs per 1k points, so D5's swarm budget was ≈2× low.
  - S3.2 ✅ `native/scatter` + `builtin:scatter` (4 px, 121k pts, p95 2.65 ms, +3.9 MB freed; `spring` = ω, loosens through the build: lead keeps that, musically right). THIRD_PARTY lists td-feedback's noise.
  - **CP3 ✅ closed (lead):** 66 s over all 11 new scenes, 0/3962 late on both arr fixtures, 1.00×; WCAG luma flashes max 3/s (at the cap); `__flash` ≤2/s. Sheet `scratchpad/td/cp3-sheet.png`.
  - S4.1 ✅ rebind of the 23 pre-TD own scenes (kick 14, snare 5, sub 6, reese 8, build 3, hats 1, beat 1, lfo 2; no bass/onset/treb) + `VJW_FLASH` on tunnel-mesh/fractal/wave-landscape + THIRD_PARTY own 23; 349 tests. DnB: kick params jump on kicks only; flashes ≤3/s.
  - ⚠️ **Kick-detector bug (pre-2c, now reproducible):** on `dubstep140-arr` and through DnB's build, `kick` sits at p50 .66 (the detector fires ≈every 50 ms on the wobble and the riser). So every kick-bound param, TD scenes included, idles high and pulses with the wobble. Lead pick: its own item right after CP4: a system-designer ruling (kick vs sustained or modulated bass), then a coder step, before 2b. It supersedes queue #4's "false kicks on a bare reese".
  - S4.2 ✅ wave-landscape has its own `flash` (snare) and steady `glow`: the grid stays visible.
  - **CP4 ✅ closed (lead): Stage 2d DONE.** All 38 starred own scenes, 2 s each, 76 s per arr fixture: 0 late on both, 1.00×.
  - **Kick ruling** (`design_audio_reactivity.md` § Ruling, L612–656), lead pick (d).
    - Cause: the kick detector read bin-1 log flux, and a full-range bass's 55/110 Hz partials beat inside that bin. The HP'd fixture reese hid it.
    - Fix: kick = `tempo.ratio(0) ≥ 1.5` (the existing IIR gate) + kick-bin power share ≥ 0.2; the bin-1 detector is deleted; CPU ≈ 0; ≤1 hop later.
  - **Kick fix ✅** (ruling d): kick = 40–150 gate ratio ≥1.5 + kick-bin share >.2.
    - Arr fixtures: DnB 2.00, Dubstep 1.00 kicks/bar (was 18), breakdown 0, kick F1 1.00, `kick` p50 ≤.002 (was .66–.76).
    - App: kick params jump on kicks only; drop 5/5 + 5/5 (Dubstep conf .86).
    - The classifier now reads `dubstep140-arr` as dubstep (late, ≈51 s), and Auto no longer halves the breakdown to 70 BPM. 355 tests.
  - ⚠️ **Snare bug (same class):** on Dubstep the 1–5 kHz snare detector fires on the wobble (snare F1 .09; snare-bound flashes ≈every 0.42 s). **Snare ruling** (`design_audio_reactivity.md` § Ruling, L658–701), lead pick: keep the 1–5 kHz flux trigger; a hop counts only if 3–5 kHz holds ≥ `TILT` .1 of the band, and the veto sits inside `onset.ts`, so a vetoed spike doesn't arm `minGap`. Coder step S queued after 2b S1.2.
  - 2b design done: `agents/system-designer/design_effect_editor.md`. **Lead pick 2026-11-05 (never-ask; all designer defaults):**
    - **Variant B:** the stage, CSS-scaled, is the preview; baked stills plus one async live tile; `NativeDef.create(gl, size?)` (tile ring 1.8 MB).
    - Undo = inverse steps in `panel`; Try = pending add, Esc undoes it; mute/solo are preview-only; editor key `L`; session-only thumbnails.
    - Port the ASCII Art; CP order 1→4.
    - Includes the bool/event binding UI and the event rising-edge fix. A bound ISF event fired every frame while its source stayed >.5, a real bug.
    - **Plan done:** `agents/planner/plan_effect_editor.md`, 4 CPs / 15 steps (design S3.2 split into engine S3.2 + editor S3.3; live tile = S3.4). G1/G2/G4 → S3.3, G3 → S4.3. `L` is free; Vitest is Node-only, so logic lives in `.ts` helpers.
    - S1.1 ✅ `edit.ts` structural ops with round-tripped inverses + `undo.ts` `edits` stack (key coalescing, sliding 1 s window); 370 tests.
    - S2.1 ✅ editor shell (`L` / bar button; CP2 setter `setEditor(on)` in app.ts): hold/restore with no cut, key guard, no prepare-ahead while editing, stage CSS-scaled into the preview (no realloc); 0/3600 late. Note: on leaving, an overdue autopilot switches at the next bar (shot-clock restart possible later).
    - S1.3 ✅ bool/event binding UI + invert; a bound event fires on the rising edge only (CFM 143 true frames → 13 fires = 13 snares); live meters; 0/4562 late. **CP1 code done** (the lead close-out is pending). Tier-1 queued: the event *trigger* button stores `true` in the doc and records an undo step, so a saved scene fires that event at every build.
    - S1.2 ✅ Live mirrors (addFx at, move, setGen, addLayer at, mute, read) + `panel` records inverses: 23/23 ops+undo keep the trail; 0/4563 late. Mute is deliberately not undoable (design S2: preview-only; Esc undoes a pending try).
    - **Snare fix ✅ merged** (`1941b5a` via merge): 3–5 kHz tilt veto inside onset + ±1-hop crosstalk + a vetoed hop is not a reference. Dubstep arr snare F1 .11 → .89 (24/24 found), DnB .92, Techno .86, wobble beds 0, kick unchanged, drops 5/5; 374 tests.
      - Residual: 3–4 beat-1 flashes per snare-bound param in a 23 s Dubstep window. The kick's 3 kHz click posts 1–2 hops before a weak kick, and a constant can't split it from Techno claps without a fixture-tuned margin. Lead: don't tune on the fixture; re-check on real tracks in the audit.
      - Snare rolls 0/32 (pre-existing): left for the audit too.
    - **Bot restart (user asked, 12:3x):** the claude-tg hook fix `8684ac0` goes live when the lead restarts the bot detached (new copy after 25 s; single.py stops the old one, which ends this Telegram session).
      - Restart 1 (12:30) went live, but launches were still denied. The CLI strips the unoffered `run_in_background` *before* PreToolUse, so the hook saw it absent. Second fix: claude-tg `1c7350e` (absent passes; only an explicit false is denied, and logged). Restart 2 at 13:51 (avadge-web idle): **the hook passes. Agent launches work from Telegram** (verified 13:58).
      - **Real-track audit ✅** (`agents/research/_adhoc/real_tracks_2026-11-05.md`; data in `scratchpad/real/`; reference tempos DnB 174.00, Rumble 140.00).
        - DnB snare/hats near-silent (`FLOORS.snare` 80 above real flux).
        - 0/11 DnB drops (`sparse`/`arm` never arm).
        - Kick recall ≈30–60%.
        - ⅔ tempo slips (116) while the genre is undecided.
        - The classifier is late or never decides; Bicep flips to techno.
        - Rumble snare fires on growls.
        - The bass class works.
      - **Tuning ruling** (`design_audio_reactivity.md` § Ruling L708–776), lead pick (all items):
        - Bug found: under Auto the worklet never got the detected genre (`app.ts` `workletBands(…, null)` placeholder since 2c S4.3).
        - Floors 40/50 by default (Dubstep keeps 80/100); the worklet follows the active preset.
        - `sparse` .5, `refractory` 20, `GRACE` 8, plus a bass-less-intro rule; `KICK` 1.35 (kick-only); `PRIOR_BPM` 150.
        - Deferred, with named knobs: `CUT` (bass cuts), `floors.tilt` (growls), and a classifier floor/margin + 3:2 ruling after a re-measure.
        - Baseline JSONs copied to `scratchpad/real/baseline/`.
      - **Audio tuning steps:** T1 floors + worklet preset (M) → T2 KICK (S) → T3 prior (S) → T4 arrangement (S). Each re-runs `scratchpad/real/run-all.sh` + `an.py` against the audit table. They run interleaved with the 2b steps, one coder at a time.
      - **T1 ✅** floors 40/50 (Dubstep 80/100), and the worklet follows the active preset. DnB snare .12–.33 → 1.09–2.30 a bar, hats 3.7–5.5, on-grid ≥ .98; 380 tests; harness + table in `scratchpad/real/t1/`.
        - Techno fixture snare F1 .80 (at its bar).
        - ❌ Rumble drop 1/4 → 0/4: Dubstep's reese 70–350 is now live under Auto and fires a weak false drop (conf .43) at 70.6 s, which swallows 75.8 s. **Lead pick:** keep the band; T4 adds a drop-confidence floor (named knob) and must restore Rumble's 75.8 s.
      - **T2 ✅** `KICK` 1.35 (plus crosstalk parity for kicks posted under TRANSIENT); 381 tests, 10/10 mutants.
        - DnB kicks/bar d+b +44–169%, on-grid within .05, snare/hats unchanged; Andy C classified at 65 s (was 108).
        - Off-grid new kicks = the kick band's timing vs the grid, not stabs; CLICK not built.
        - Small: 3 re-triggers <60 ms across the tracks (a `minGap` knob, later).
        - Data: `scratchpad/real/t2/`.
      - **T3 ❌ not merged.** `PRIOR_BPM` 150 kept the fixtures green, but on the real tracks Kanine's ⅔ share went only .27 → .25 and Bicep got a new 18 s ⅔ run (sync relock).
        - Cause: the raw ACF at the 116 lag is 1.2–3.6× the 174 lag there. No prior can fix that.
        - Patch + data kept in `scratchpad/real/t3-rejected/`.
        - **Tempo ruling** (`design_audio_reactivity.md` § Ruling L778–820), lead pick (b):
          - A 3:2 check decided by the bar: F = fold(1.5·bpm) wins if bar(F) > `EDGE` 1.2·bar(bpm), `near`-gated.
          - PRIOR stays 128; +4 % CPU.
          - Step **T3′ (S)**: a probe gate first (≥90 % of the 116 windows switch, ≤2 % of the ref windows); fallback (e′) = sync ignores ⅔/4/3 readings.
          - Queued after T4.
        - **T4 ✅ merged** (net better):
          - sparse .5, refractory 20, GRACE 8, bass-less-intro rule, `minConf` .56 (weak fires read .44–.53, real ones ≥.60).
          - Real drops 0 → 3: Rumble 20.9 + 75.8, Kanine 88.4 at +3.2 s. Rumble's false 70.6 is gone.
          - `build` now moves on DnB (max .47–1.00); Kanine is classified dnb at 162 s.
          - Still open: Bicep false fire 167.2 (path (b), kick-only); DnB 1/11. 5 of the 11 are 1.6–2.5 s bass cuts with drums running (`CUT`); others return under `ret` 4 or have no `low` breakdown.
          - Data: `scratchpad/real/t4/` (+ `cap/` per-frame captures, `replay/` offline replay).
        - **T3′ bar check ❌** (probe gate GO; 116 sections fire 100 % at EDGE 1.3, false .21 %). In the browser, Kanine's silent/sparse first windows false-fire into a ~30 s wrong ¾ lock (lock 6.5 → 42.7 s); no EDGE fixes it.
          - **Lead pick: fallback e′.** The sync ignores ⅔/4/3 readings of a confident grid. Offline: 0/31 starts worse; Kanine's ⅔ runs gone.
          - The same coder is rebuilding T3′ as e′ now.
        - **Drop v2 ruling** (`design_audio_reactivity.md` L822–873; hand-traced, replay not run). Lead pick, all items:
          - delete path (b); the `ret` reference becomes min(section mean, slow); `sparse` .6;
          - the intro survives short sparse runs; peak survives an armed re-sparse;
          - CUT: `low` < .2·G for ≥ 1.5 s, off under Dubstep (`Preset.cuts`);
          - deferred: no-bass-dip drops, flicker debounce.
          - Predicted DnB 7/11, Rumble 2/4, 0 false. The Sub Focus 147.9 label is suspect (bass back at 146.5): **the user checks it by ear.**
          - Steps: **D-A** (S, `arrange.ts`, replay-gated) → **D-B** (S, CUT + preset gate).
        - **T3′ ✅ e′ merged:** sync ignores ⅔/4/3 readings of a locked grid (`PARTNER` 1 %).
          - Kanine ⅔ .25 → .00, ref .72 → .97, lock 6.5 → 4.4 s; Bicep ⅔@108 gone; others unchanged; 389 tests.
          - Limits: a two-step locked from scratch still locks 116; a mix change within 1 % of 4/3 never relocks.
        - **D-A ✅ merged:** path (b) deleted, `ret` ref min(mean, slow), `sparse` .6, intro/peak fixes, plus return frames kept out of the run mean and `slow` music-only.
          - Replay + browser: DnB 1/11 → **5/11** (Kanine 44.7 / 88.8 / 155.0, Andy C 47.3, Bicep 176.9). Bicep false 167.2 is gone; Rumble 21.0 + 75.8 kept; nothing at Rumble 90–115 s or Andy C 132.7; 22/22 mutants.
          - Sub Focus 146.6 (.71) is the label case: **the user checks it by ear**; if it is the drop, 6/11.
          - Data: `scratchpad/real/da/`.
        - **Running:** `frontend-coder` D-B (CUT + `Preset.cuts` off under Dubstep + `armed` reset at fire). Next: back to 2b (S2.2).
    - **Then: real-track audit + tuning** on the user's tracks (`tracks/`, git-ignored; 4 FLAC + 1 WAV, 44.1 kHz stereo, 2.5–3.8 min: Kanine *Feel The Vibration*, Sub Focus *Elevate (SOTA remix)*, Andy C *Who Like The What (ext)*, Skrillex *Rumble*, Bicep *Glue (Kanine bootleg)*). Covers queue #4 (tempo lock, false hits, preset `proto`/`sens`, classifier, drop). Then 2b S1.3.
- **TD-look requirement (user, 2026-11-04): every new effect must react to our 2c sources**, not only generic `bass`/`onset`.
  - Sources (`web/src/bind.ts` SOURCE_IDS): kick/snare/hats, sub/reese/wobble/wobbleDepth, build/drop, beat/bar, custom bands.
  - The design maps each effect param to a source (e.g. feedback zoom ← kick, hue step ← snare, displace ← reese/wobble, bloom ← build→drop, R-D seed ← sub).
  - It also states how the Auto-style overlay (`audio/presets.ts` `map`: DnB bass→reese, onset→kick; Dubstep bass→wobble, onset→snare; Techno onset→kick) applies.
  - Acceptance: a reaction check on `dnb174.wav` and `dubstep140.wav`, plus real tracks when the user provides them.
  - Finding: today's built-ins bind almost only to `bass` (22) and `onset` (8). One scene uses `kick` directly; none uses snare/hats/sub/reese/build/drop directly; they reach them only via the Auto-style remap.

### Findings for the user (decide or leave)
- ⚠️ **WCAG gap:** MilkDrop presets flash on their own; e.g. `cope-alternative-energy` luma std goes 6→72 within 2 s. `flashGate` covers only `own/strobe` + `own/flash`. Option: a frame-luminance flash limiter in the post pass (a design item).
- Blend `screen` on a single-layer scene renders ~half as bright as `normal`. This predates §5.
- Bool params (the strobe) have no binding controls in the panel.
- The panel's GPU hint reads high for MilkDrop scenes (cross-context wait; display only). A cut to an unprepared milk scene shows 1–2 black frames.

### Queue (lead order)
0. **Order (user, 2026-11-04 22:2x):** 2d TD look → **rebind pass**: retune ALL existing built-ins to the 2c sources (reese/sub/wobble, kick/snare/hats, build/drop). The binding policy goes in the same design (`design_td_look.md` § Binding policy, asked of the running designer) → 2b effect editor (spec + research ready; system-designer next) → Stage 3 camera.
0b. **Order (user, 2026-11-05 15:0x):** finish audio tuning T1–T4 + 2b editor → **Stage 3 camera** (the big closing epic) → **TD wave 2**. Wave 2: a researcher triages the rest of the dump (160 OPSnippets GLSL, the remaining ImageFilters such as twirl/dent/polar/pointillize/solarize, julia/mandelbrot/superFormula, the 50 noise variants, GaussianSplats) → top-10 → design/plan/coders, each on the 2c bindings.
0c. **Parallel prep (user, 15:1x):** two researchers running alongside the coder:
    - **Camera research ✅** `agents/research/research_camera.md`.
      - A1: MediaPipe 1.2.2 (Apache-2.0; tiny; can share our GL context; no temporal state; tuned for a person <2 m).
      - A2: RVM (GPL-3.0, recurrent, dormant since 2023, WebGPU only).
      - B: Apple Vision via a Swift helper (≈22 fps reported on M1/M2; transport via WebSocket, WebRTC or a virtual camera).
      - C: macOS effects reach Chrome as processed pixels only; no mask API.
      - Gap: no Apple Silicon fps and no low-light/strobe data, so the first design step is an M4 probe. **Running:** `system-designer` → `design_camera.md`.
    - **Camera design ✅** `agents/system-designer/design_camera.md` (pure web, Mac + Windows). **Lead pick: B, all defaults.**
      - Segmentation worker gets `VideoFrame`s and returns a ≤64 KB mask + area/box; mask EMA .85 plus a flood/jump gate; luma limiter for camera strobes.
      - `LayerDoc.mask` (person/background); `native/camera` (+ `cut`), `native/outline`, `own/negative`, `presence` source.
      - The worker is recycled every 30 min for MediaPipe leak #6352; built-ins fall back to their TD layer with no camera.
      - CP0 probe `?camprobe` (Selfie vs PoseLandmarker, CPU/GPU, worker/main/same-ctx, RVM if wired) on the M4 + the Windows PC, then a probe ruling; CP1–CP3: 6 steps (framing optional).
      - **User provides:** the DJ-booth clip (≥60 s 720p30: steady light, low light, strobe, hands on decks, fast moves, someone walking behind) and the Windows probe run (`npm run build && npm run preview` on the PC, 75-min soak).
      - **Plan ✅** `agents/planner/plan_camera.md`: 4 CPs / 15 steps + probe ruling R0.
        - CP0: S0.1–S0.5 `?camprobe` + harness; CP1: S1.1–S1.6 mask in the engine; CP2: S2.1–S2.3 looks + 3 `dj-*` built-ins; CP3: S3.1 framing, optional.
        - Model-specific code sits behind the worker messages `[R0]`. HEAVY = `builtin:td-feedback`.
        - USER steps: U0.0 optional selfie; U0.1 the booth clip (**asked now**); U0.2–U0.4 on the Windows PC after S0.5 (build/preview, probe, 2×75 min soak, latency); U2.1 at CP2 close.
        - Camera coding starts after 2b, per order. S1.5 (model-free) may go earlier.
        - **User 2026-11-05: on vacation; the clip and the Windows PC runs wait until he's back in Stockholm.** The clip is optional: a live capture at the decks during the PC probe is fine. Coders can do CP0 S0.1–S0.5 on synthetic + a webcam; R0 waits for the user's runs.
    - **Camera research, cross-platform ✅** `agents/research/research_camera_xplat.md`: pure web, Chrome on Win + Mac.
      - Shortlist: MediaPipe Selfie (<2 m, only published fps), PoseLandmarker mask (full body ≤4 m), RVM on WebGPU (GPL, recurrent alpha; no Windows fps).
      - MediaPipe Windows GPU bugs: NVIDIA mask offset; long-session GL leak #6352 (open).
      - No Intel-iGPU / M-series / strobe data, so we need an on-rig probe. **User scope: pure web, no native helpers.**
    - **TD wave 2 research ✅** `agents/research/research_td_wave2.md`:
      - Top-10: julia trap filter, superformula, polar wrap, phaser wipe, gradient map, XY scope (native), pointillize (scatter ext), difference feedback (VJW_FLASH), dilate melt, stars/polka noise.
      - Plus 12 quick wins (several already exist as MIT donor ISF).
      - Engine gaps: stereo wave, line renderer (plexus), splats, blends (difference/max/dodge).
      - Wave 2 is queued after Stage 3, per the user; its design waits.
    - `agents/research/research_camera.md`, from the new `thoughts/spec_camera.md` (lead-written, `(default)` answers);
    - `agents/research/research_td_wave2.md` (dump triage → top-10 + quick wins).
    - Designers/planners held until research lands, then judged against the usage limit.
1. §1 slit scan, §2 chrome ring: taste, after the user's effects re-brief (lead defaults in `_adhoc/effects_polish_2026-11-03.md`).
2. §4 "Spectrum takes ≤2 filters": a perf investigation on a quiet-GPU `?bench`. Deferred.
3. The spec §7.5 30-min run with MilkDrop in the playlist and audio flowing (CoreAudio worked for the coders on 11-04); `?flash` lag. REC backlog: a WebCodecs recorder (low priority).
4. Blocked on real tracks (`scratchpad/real/`): dubstep140 tempo lock, false kicks on a bare reese, preset `proto`/`sens` tuning.

### Waiting on the user
- Look at MilkDrop: `cd web && npm run dev` → `localhost:5173`, press → until a MilkDrop scene; E → panel: 25 `builtin:milk-*` starred, unstar the ones you dislike.
- Local CP6/CP7 check: `localhost:5173/?debug`, E opens the panel (Sources tab, meters, picker/Auto, custom band + reload, drop + LOCK).
- The effects re-brief (what to redo, including the built-in scenes) · real tracks (`scratchpad/real/`) · §4.2: 174 vs rekordbox.

### Open notes
- §4.7: under the drop fixture the governor stepped 1.00 → 0.72× and probed back up, so "scale 1.00" holds only without audio (detail in TAIL, session 6). Harnesses pass files as base64 (a Node Buffer arrives empty).
- Known limits: bass note-on-kick lag ~211 ms (accepted); kick-veto branch S3.1c kept unmerged (`413275d`); `?debug&preset=` forces the frame loop only, so it doesn't drive the Auto-style hint (by design).
- ⚠️ assumptions: `design_pilot.md` § "Spec §8 and STATE ⚠️ ledger". Fixtures: `scratchpad/fx_audio/dnb174.wav`, `dubstep140.wav` (gitignored; regenerate via `web/scripts/make-fx.mjs` through a throwaway vitest in `src/`).

**Infra:** graphify (root `.`, post-commit hook); crons are session-only; `.claude/settings.local.json` allowlist (Read/Write/Edit + common Bash incl. `npx:*`); dispatch rule CLAUDE.md #11 (one coder at a time, own worktree, the lead merges). Harness (user 2026-11-04): in this project only superpowers 7.0.0 + ponytail + graphify + context7; SEO, ui-ux-pro-max, superpowers 5.0.7, claude.ai synced skills/plugins/connectors and Artifacts are off in `settings.local.json`; memory compacted to 2 notes.

### Key decisions
- Session 2 (/grill-me): browser pilot, Chrome-first, localhost; Vite + React + TS; Electron later. Minimal auto-hiding overlay, REC via MediaRecorder, quality modes 60A / 60F / 30. After the pilot: editor → camera → clip mixer.
- Session 3: any dependency license; line-in only (rekordbox, sometimes Pioneer USB), MIDI/Link later; Butterchurn moved to the next step; analysis = energy, onsets, tempo+phase.
- 2026-10-28: effects Variant A; audio-reactivity Variant B (worklet IIR bank + fast/slow envelopes).
- 2026-10-31: one coder at a time. 2026-11-01: fully autonomous runs (the lead halts only on hard blockers). 2026-11-03: team models above; MilkDrop Variant A, no detector hook, we curate ~25, spread evenly. 2026-11-04: MilkDrop probe ruling (K1/K2 timed a cross-context wait → end-to-end late frames + Butterchurn-own GPU); user "go" on the polish queue.

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
- 2026-11-03..04 — Session 6 work log (demoted from HEAD 2026-11-04):
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
    - ✅ **system-designer → `design_milkdrop.md` § Probe ruling (L384–409): CP1 = GO**, inside Variant A, no user gate.
      - K1/K2 timed a cross-context wait: the copy reading tracks Butterchurn's own GPU, median 7.61 vs 4.51.
      - **New K1** = 0 late frames over the 60 s full-size run + copy main-thread p95 ≤ 0.5 ms (pass). **New K2** = Butterchurn's own GPU p95 ≤ 5 ms, ≥ 20 presets (pass, 264/387).
      - S2.2 copies with path (a).
      - The governor never reads `gpuMs` (lead-verified: readers are only `app.ts:342` panel hint, `bench.ts:141/186`). R9 is inverted: the panel GPU hint reads high for MilkDrop scenes (display-only).
      - The lead's extra worst-case run (2 heaviest presets fading into each other + heaviest own scene) goes at the S2.4 demo.
      - Plan edits applied (S1.2 note, S2.1/S2.2/S2.3/S2.4/S3.1).
    - S2.1's 3 presets (lead, by S3.1's rule; 116 eligible, 49 authors): `fiShbRaiN + geiss - witchcraft (Grow Mix 3)` (3.99), `cope, martin + flexi - the slickery of alternative varnish` (3.99), `Geiss - Reaction Diffusion (Relief Mix)` (3.64). Probe rows saved to `scratchpad/milk-probe-rows.json` (gitignored) for S3.1.
    - ✅ **Tier-1 heavy-test timeouts merged** (`c738f85`, ~9 min): a global Vitest `testTimeout: 20_000` (the two redundant per-test 20 s in arrange.test.ts removed). Reproduced with 20 CPU burners: §4.5 timed out on unchanged code; 317/317 ×2 after the fix.
    - ✅ **Polish §7 merged** (`d55f4ae`, ~3 min): any `keydown` that reaches `window` wakes the overlay. Browser: ArrowRight wakes the bar; `E` opens the panel at opacity 1 (before: 0). Panel slider arrows now keep the panel awake too.
    - ✅ **Polish §6 merged** (`20a3a03`, ~11 min; gates 318/318): `rampShared()` in `spectrum.ts` ramps shared-bin low bands toward the next own-bin band; groups come from `bandEdges(ctx.sampleRate, analyser.fftSize)`.
      - Browser (44.1 kHz here): stepped frames went 120/120 → 1/120.
      - Remaining flat tops on loud sub come from `DB_HI` (`spectrum.ts:21`), not from lockstep.
    - ✅ **MilkDrop S2.1 merged** (`54f7257`, ~6 min; gates 321/321): `presets.ts` (`PRESETS`, `MILK_SCENES`, `spread`) + test, `scripts/milk-presets.mjs` (byte-identical rerun), 3 presets. Drift: the package has no `repository` field, so `url` = `https://github.com/jberg/butterchurn-presets`.
    - ✅ **Polish §3 merged** (`d73e2b9`, ~15 min; gates 327/327). `flashGate` + shared `flashOnsets`; strobe alpha 0.6.
      - Browser at LOCK 174: rate 1 → 17/17 allowed, rate 2 → 19 of 37 allowed; max 3 in any 1 s window both times. Flash frame = a 60% wash (min channel 153).
      - Gap noted: bool params have no binding controls in the panel, so the strobe's source and `rate` can't be changed from the UI.
    - ✅ **MilkDrop S2.2 merged** (`9566642`, ~24 min; gates 327/327): `native.ts` (pool, copy (a) shared with bench as `copy()`, resize) + catalog line.
      - Plain `?bench`: 3 `milk/*` with glError 0, console errors 0.
      - Upright: the copy matches Butterchurn exactly (0.000 vs 76.6 if flipped).
      - `?debug`: a milk layer over Tunnel reacts to music.
      - Drift: `dispose()` returns a settled visualizer at once (the plan's `.finally` made a third one per prepare).
      - ⚠️ A scaled per-frame `drawImage(internalCanvas)` read a frozen image, so the probe's path (c) may have copied stale frames. Path (a) is unaffected.
      - Until S2.3, the first milk add in a page hitches ~1 s.
    - ✅ **Polish §5 merged** (`e23c44e`, ~20 min; gates 327/327). `live.ts` mirrors each structural op; survivors keep node/u/smoothing/flash/targets/clock; per-node FRAMEINDEX (first draw now 0); `rebuild()` gone.
      - Harness `scratchpad/live-rebuild.mjs`: 17/17 pass (the old code fails 16/17). Milk add/remove ×15 = 1 `createVisualizer`; GL counts back to baseline after 10× add/remove.
      - Noticed, not fixed: blend `screen` on a single-layer Trails spectrum renders ~half as bright as `normal` (predates this change). A newly added milk layer is black until its preset loads (by S2.2's design).
    - ✅ **MilkDrop S2.3 merged** (`55ebecf`, ~11 min; gates 327/327): `NativeDef.warm?()`; Start loads each milk preset; the pool's 2 visualizers are made once, in turn, and both are past their first load. Browser: `createVisualizer` = 2 over Start + 31 s; 0 black milk draws on fades. A cut to an un-prepared milk scene still shows 1–2 black frames (S2.2 design).
    - ✅ **MilkDrop S2.4 merged** (`a4bcd03`, ~10 min; gates 327/327). **CP2 code-complete.**
      - `BUILTIN = spread(OWN, MILK_SCENES)`: milk at playlist 7/15/23 of 30.
      - `load()` uses `.then().catch()`, so Start can't hang.
      - CP2 demo: compiling 51/51 (+3 milk); autopilot fade into milk via `gl/PerlinDissolve`, with the badge naming the preset; a drop cut away from milk; panel shows 3 starred; `createVisualizer` 2 over 62 s; REC 20 s = H.264 640×360 ~59 fps + AAC with sound (ffprobe).
    - ✅ **Lead worst-case run (ruling 5): PASS.**
      - Setup: full size 1728×1117@2, silence, 60A.
      - Heaviest starred own scene is `particles-over-tunnel` (4.17 ms GPU); next are rainbow-trails 4.10 and trails-spectrum 4.07.
      - 65 s of `next()` every 5 s over [witchcraft, cope, particles-over-tunnel], covering milk→milk, milk→own and own→milk fades.
      - Result: 3901 frames, **0 late**, p99 18.6 ms, governor drops 0, **scale 1.00**, jsMs 2.2.
      - Harness: session scratchpad `wc/worst.mjs` (copy in `scratchpad/milk-worst.mjs`).
    - ▶ **MilkDrop S3.1** (coder): curate ~25 by rule from `scratchpad/milk-probe-rows.json`, + a contact sheet with music, + THIRD_PARTY.
    - **Lead reorder:** S2.4 → the lead's worst-case run (ruling 5) → S3.1 → §1 → §2. §1/§2 are taste and wait for the effects re-brief anyway.
    - ✅ **planner (Fable, ~12 min) → `plan_flash_cap.md`** (§3, Tier 2): 1 step S1.1.
      - A pure `flashGate` next to `WCAG` in `gl/post.ts`: ≤3 onsets per closed 1 s window; a refused onset holds; the output never rises except through an allowed onset.
      - Applied at the `live.ts` `render()` uniform write, with one shared module-level `flashOnsets` (all layers, both fade scenes). Flash class = a const set (`own/strobe.strobe`, `own/flash.flash`). The post strobe stays out (same beat grid, ≤0.15).
      - `strobe.fs` alpha 0.6 (⚠️ taste). `__flash` under `?debug`.
      - Fact: `tempo.ts:26` folds BPM into [90,180), so the browser check forces the gate with the panel `rate` = 2.
      - Accepted ceiling: a slow sub-0.5 swell on a user-bound float is held, then steps at 0.5 (a counted onset).
      - Next coder after S2.1. It has a real placement choice: a binding vs a uniform-write gate in `live.ts`, a flag in ISF metadata vs a const list, and whether the `postFor` strobe shares the 3/s budget. Lead defaults: one shared ≤3 onsets/s budget enforced at the uniform write, the pure gate next to `WCAG` in `gl/post.ts`, strobe colour alpha < 1.
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

