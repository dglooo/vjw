# Effects polish backlog: scoping (ad-hoc)

## TL;DR
- Four items are local and S: §1 slit scan (echo.fs + scene values), §2 chrome ring (binding + shader), §3 strobe (shader + binding), §7 overlay keys (Overlay.tsx). §6 bass bars is S if the fix stays in spectrum.ts, M–L if it goes through the shared analyser.
- §5 structural edit is **local to `gl/live.ts`** (`rebuild()` has one caller): Tier 2, M. §4 "≤2 filters" is no code limit, it is a perf note with an **unknown cause**: an investigation, L.
- `builtin.ts` is shared by §1–§4. Context: STATE.md:37 says the user will send a separate rework brief for effects.

## Freshness
2026-11-03, `master` @ 481d97b. Code read directly (file:line below). WCAG 2.3.1: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html (≤3 flashes in any 1 s, or below the area threshold). Nothing was checked in a browser. Visual readings are marked ⚠️.

## §1 Slit scan is weak
- **Where:** scene `builtin.ts:209-218` = `native/tunnel` → `isf/Sine Warp Tile` (:214) → `own/echo` (:215); shader `fx/own/echo.fs:19-26`. **What it does:** a band of height `slit` (default 0.1, :9; the scene sets no value) at the screen's vertical centre shows the live image. Every other pixel copies `history` shifted outward by `d` = round(speed) px per frame (:25-26). So 90% of the screen is the band's outer `d` rows streamed outward.
- `speed` is bound to `bass` 2–10 (:215). `bass` = clamp(att.bass/2), ≈0.5 on average (`bind.ts:47`). Under Auto-style DnB, `bass` → `reese` (`audio/presets.ts:32`).
- **Cause (code facts):** the band sits on the tunnel's centre, which is fogged: `smoothstep(0.02, 0.5, r)` (`scenes/tunnel.ts:60`). So the middle of the band is near-black except the `/r` end light (:61).
  Whatever streams out is a smear of a few rows, with no decay and no mix with the live image. ⚠️ That this is what reads as "barely visible" is unverified.
- **Knobs:** `slit` value/default (echo.fs:9 or a scene `values`); speed range (builtin.ts:215, echo.fs:13); the shader's stream logic (echo.fs:21-26: direction, decay, blend); gen/warp choice (builtin.ts:212-214).
- **Kind:** shader + scene values. **Size S.** Files: `fx/own/echo.fs`, `scenes/builtin.ts`.

## §2 Liquid chrome makes a ring every kick
- **Where:** `builtin.ts:272`: `burst` ← `onset`, attack 0, release 0.35, 0..1. File suggestion `fx/own/liquid-chrome.fs:13-15` (the same values; the scene keeps its own copy).
- **What it does:** every hit snaps `burst` to 1. Then `d = length(p) − RING·(1−burst)` and the term `0.6·burst·sin(RING_K·d)·exp(−RING_W·d²)` (:31-32) draw a ring that expands from the centre as burst decays. This is by design (DESCRIPTION :5; spec_effects.md:45 "liquid chrome that bursts on kicks").
- Built-ins read the Auto-style overlay (`bind.ts:91`), where `onset` → `kick` (DnB, techno) or `snare` (dubstep) (`presets.ts:32,40,48`). Result: one ring per kick or snare.
- **Knobs:** the binding's source, amount, max and release (builtin.ts:272, plus the .fs VJW_BIND for new nodes); ring constants `RING`, `RING_K`, `RING_W`, `BUMP` (:20-23); ring amplitude 0.6 (:32).
- **Kind:** binding default (+ optional shader constants). **Size S.** Files: `scenes/builtin.ts`, `fx/own/liquid-chrome.fs`.

## §3 Strobe is full-white every beat
- **Where:** `fx/own/strobe.fs:8-12,17-19`; scene `builtin.ts:61-70` (Pixel strobe, binding :68).
- **What it does:** `strobe` is a bool. The binding `beat` saw → ×confidence (`bind.ts:116`) → 0..0.65. It turns on at ≥0.5 (`gl/live.ts:257`), so it is on while conf·(1−phase) ≥ 0.77: the first ≈23% of each beat at conf 1, never below conf 0.77.
  - When on, `mix(c, color, color.a)` with default colour [1,1,1,**1**] gives a fully white frame (:10, :19).
- **Rate:** 1 flash per beat = BPM/60 per second. 174 BPM gives 2.9/s; above 180 BPM it passes the WCAG limit of 3/s.
- **Not covered by the WCAG cap.** `postFor` (`gl/post.ts:25-31`, tested `post.test.ts:44`) caps only the engine's heat post-pass strobe (STROBE 0.15 gain). `own/strobe` runs through the generic binding chain, which has no rate logic. The post strobe can stack on top of it. `own/flash` (`builtin.ts:42`, kick-bound) is also uncapped.
- **Knobs:** colour alpha default (strobe.fs:10); bool vs float strength (:8, :19); binding max/shape/`rate` (builtin.ts:68; `rate` exists, `bind.ts:7,114`); a rate cap would need new logic (post.ts-style, or in the binding/node path).
- **Kind:** shader + binding. **Size S**, or M if a shared flash-rate cap is wanted. Files: `fx/own/strobe.fs`, `scenes/builtin.ts` (+ `gl/post.ts` / `gl/live.ts` for a cap).

## §4 Spectrum takes at most 2 filters
- **Where:** comment `builtin.ts:48`; `agents/planner/plan_effects.md:599`. A third filter over the spectrum took p95 from 3.5 to 6.1–6.2 ms, while three over the tunnel stay at 2.4 ms. "Cause unknown; this step does not touch the engine."
- **No code limit exists:** `edit.ts`/`Panel.tsx` cap only layers (4); a user can add a third filter today.
- **Spectrum-specific costs:** its own half-float target plus a 4-level half-float bloom chain at layer res (`scenes/spectrum.ts:85-87,103-104`; `gl/bloom.ts:44-74`).
  The fx chain ping-pongs `temps[k%2]` (`live.ts:283`), the same pattern as the tunnel. STATE.md:21 notes that ANGLE/Metal timer queries carry about 1 ms of overhead and a 3 ms floor artifact. ⚠️ Part of the jump may be measurement.
- **Knobs:** layer `res` (builtin.ts:12,51,168; other spectrum scenes already use 0.5); bloom `levels` (bloom.ts:44); target formats (`engine.ts:79-80`).
- **Kind:** engine/perf investigation (needs `?bench` on a quiet GPU). **Size L (unknown)**; S if only a built-in gains a filter at a lower res. Files: `scenes/spectrum.ts`, `gl/bloom.ts`, maybe `gl/live.ts`/`gl/engine.ts`, `scenes/builtin.ts`.

## §5 A structural edit restarts the scene
- **Where:** `gl/live.ts:330-336`: `restructure` → `l.rebuild()` (:298-301) = `dispose()` + `build()`. It is used by `addFx`, `removeFx`, `addLayer`, `removeLayer`, `setBlend` and `pasteToy` (:353-365).
- **What is lost:** `build()` resets `frames` = 0 and every layer's clock `t` to 0 (:228-230).
  It re-creates every node (:108-127): natives re-run `create()` (:114), so tunnel travel and spectrum bar heights reset; ISF pass pairs get new cleared targets (:125), so feedback is lost.
  Binding smoothing resets, because `bindInto` matches old state by `x.u === u` (:144) and the `u` objects are new.
- **Facts for scoping:**
  - `rebuild()` has a single caller (:333). The `edit.ts` ops mutate the doc in place (:53-72): push or splice by index.
  - `Node` holds no `NodeDoc` reference (:34), so existing nodes map to the new doc by index shift. `setBlend` only changes `l.blend` (:37, read per frame :273,287) and needs no rebuild.
  - Keeping the layer `t`/`frames` alone still loses feedback and native state.
- **Tier verdict: local, Tier 2, size M.** Only `gl/live.ts` (the `create()` closure plus the `panel` actions; the `Live` interface :25-29 is internal); no `engine.ts`/doc/edit contract change. Design text drifts at `design_effects.md:234`. ≈30–60 lines; there is no Vitest for live.ts (GL), so it needs a browser check.

## §6 Bass bars are steppy
- **Where:** bands from `audio/energy.ts:24-27,44-46` on the shared analyser `audio/input.ts:16` (fftSize 1024, smoothing 0). Bars `scenes/spectrum.ts:89-94` (attack 0.6, release 0.1 per 60 Hz frame, :18-19).
- **Cause (computed with `bandEdges`):** at 48 kHz/1024 a bin is 46.9 Hz.
  Bands 0–2 all read bin 1, 3–5 bin 2, 6–7 bin 3, 8–9 bin 4: the 10 lowest bands show 4 distinct values, so 20 of the 64 mirrored bars move in lockstep groups (a staircase); 44.1 kHz is similar. At fftSize 4096 every low band gets its own bins.
  ⚠️ "Steppy" read as spatial; temporal stepping is not indicated by the code.
- **Knobs:** (a) local: interpolate/smooth across low bars in spectrum.ts:89-92.
  (b) `bandEdges` `lo` or grid (energy.ts:24). This also changes the tunnel stripes (`tunnel.ts:46-48`) and the `band0..31` sources (`bind.ts:49`).
  (c) fftSize (input.ts:16) is cross-cutting: `engine.ts:29` `BINS=512` assumes 1024 (setAudio :110-117, ISF/toy audio textures); `energy.test.ts:5` N=1024; the window/latency of bass/mid/treb.
- **Kind:** native scene logic (a) or audio analysis (b/c). **Size S** (a) / **M–L** (b/c). Files: `scenes/spectrum.ts` (shared with §4); route (c): `audio/input.ts`, `audio/energy.ts`, `gl/engine.ts`.

## §7 Keys don't wake the auto-hidden overlay
- **Where:** `ui/Overlay.tsx:18-30`: `wake` is registered for `mousemove` only (:25, cleanup :27). `HIDE_MS` 2500 (:7).
- **Side effect today:** `.bar.hidden` also hides the panel (`ui/panel.css:24`). So `E` (`app.ts:102-103`) can open an invisible panel until the mouse moves.
- Keys typed inside the panel never reach window listeners (`Panel.tsx:239` `stopPropagation`). So the Save-as case in the panel.css:23 comment stays covered.
- **Knobs:** add/remove a `keydown` listener next to :25/:27. Whether every key wakes it or only hotkeys (app.ts:99-100 filters repeats, modifiers and fields) is a choice.
- **Kind:** UI logic. **Size S.** Files: `ui/Overlay.tsx` (comment `ui/panel.css:23`).
