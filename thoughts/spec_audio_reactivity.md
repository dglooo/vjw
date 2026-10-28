# VeeJay Wizard — Spec: Genre-aware audio reactivity

## TL;DR
- New audio **sources** for bindings:
  - kick, snare/clap, hats;
  - sub and mid-bass/reese with its "movement" (wobble);
  - build-up energy and drop;
  - user-defined bands.
- Two speeds: hits are fast (no added lag); sustained sources (sub/reese/wobble) are precise, with ≤ ~85 ms extra lag.
- **Genre presets** (Drum & Bass, Dubstep/bass, Techno/house) set bands, sensitivity and the BPM range.
- An **Auto-style mode** detects the style, switches the preset and remaps the built-in scenes' bindings smoothly. A manual preset choice overrides it.
- On a **drop** the scene builds up, flashes, and the autopilot cuts to a new scene. A "Sources" section in the panel shows live meters and holds the settings.

## Freshness
- 2026-10-28. Comes from a `/grilling` session with the user (2 rounds plus a confirmation); all decisions are confirmed. The lead's defaults are marked `(default)`.
- Facts: `agents/research/research_audio_features.md` §1–§8 (and `research_audio_analysis.md`).
- Builds on the shipped Stage 2a `effects` (bindings registry `Record<string, number>`, panel, library), `thoughts/spec_effects.md`.

## §1 Goal
The user plays DnB and other bass music. Today the visuals react to bass/mid/treb, a single onset and the beat. The user wants each musical element to drive its own layer: the reese moves one thing, the kick another, the hats sparkle. They want it tunable, and they want it to adapt to the style of what's playing.

## §2 Scope
### §2.1 New sources
All of these are binding sources, readable by any parameter, keyed in the existing open registry.
- **Hits (fast path, no added latency):** `kick`, `snare` (snare/clap), `hats`. Each gives an envelope (0..1, decaying) plus an event.
  - On full mixes, expect moderate accuracy (research §1: F 0.58–0.82). False positives are tolerable for visuals.
- **Sustained (precise path, ≤ ~85 ms extra lag acceptable):**
  - `sub` (≈30–60 Hz energy);
  - `reese` (mid-bass ≈60–250 Hz sustained energy, separated from kick transients by differential envelopes, research §2);
  - `wobble`: modulation rate/depth of the bass, e.g. as a 0..1 depth plus a phase/LFO-like signal (research §2 rates: 2–12 Hz at 140–174 BPM; reese "movement" 0.3–0.6 Hz).
- **Arrangement:**
  - `build`: 0..1 rising energy/tension in a build-up;
  - `drop`: event + envelope at the drop.
  - Detection is heuristic, so it's marked experimental, with confidence gating.
- **User bands:** user-defined sources with a range in Hz, gain, threshold/gate and attack/release. They are named and appear in the binding source list.

### §2.2 Genre presets
- Presets: **Drum & Bass, Dubstep/bass, Techno/house** (user's choice), plus **Default** (today's behaviour).
- A preset sets:
  - the band edges and sensitivities per source;
  - the tempo tracker's **BPM range**, e.g. DnB 160–185 so 174 never reads 87; dubstep 135–150 with half-time awareness; techno/house 118–135 `(default ranges)`;
  - the per-genre source → scene mapping used by Auto-style (§2.3).
- **Manual choice + hint:** the user picks a preset in the panel. The app shows a hint from tempo/spectrum ("looks like DnB") and never switches by itself unless Auto-style is on.

### §2.3 Auto-style mode
- A toggle, **on by default** `(default)`.
- **On:**
  - the app classifies the style from tempo and spectrum, switches the preset and **remaps the built-in scenes' bindings** to the genre mapping (e.g. DnB: reese → deformation, kick → flash, hats → sparks);
  - switching is **smooth with hysteresis**, so it doesn't flap during a mix transition;
  - **a manual preset choice locks it** until the user returns to "auto".
- **Off:** scenes use their own saved bindings, and the preset only affects the sources.
- User-made scenes keep their own bindings `(default)`; the remap applies to built-ins. Opting a user scene into the remap is out of scope `(default)`.

### §2.4 Build-up and drop behaviour
- During a build-up (`build` rising) the scene "heats up": speed, brightness and strobe rate rise, through a global modulation applied on top of scene bindings `(default)`.
- At the **drop**: a flash, and the **autopilot cuts to the next scene** immediately (respects LOCK; no cut when locked).
- `drop`/`build` are also normal binding sources.

### §2.5 UI: the "Sources" section in the panel (E)
- Live meters for every source: kick/snare/hats blinking, sub/reese breathing, wobble, build, drop.
- Preset picker, the Auto-style toggle with the current detected style, and a sensitivity slider per source.
- "+ Custom band": Hz from–to, gain, threshold, attack/release, name. Custom bands can be removed.
- Settings persist across reloads (same storage approach as the library) `(default)`.
- Calm, minimal, consistent with the existing panel.

### §2.6 Performance
- Audio-thread cost stays small: research §8 measured 16 band filters + envelopes at 0.34% of a core.
- The precise path may use a larger FFT (8192) only for the sustained low-end sources.
- The render budget is unchanged: 60A holds on the M4.

## §3 Non-goals
- ML stem separation: offline only (research §4: HTDemucs 7.8 s lag).
- MIDI/Link sync, multi-binding per parameter, formula bindings.
- The **effects re-brief:** the user will separately brief which effects and scenes to redo, so that is not part of this epic.
- Hip-hop/trap presets: not requested.

## §4 Acceptance
1. Kick, snare, hats, sub, reese, wobble, build and drop appear as binding sources with live meters. On a DnB test track (kick + snare + reese + hats), each meter responds to its element. Kick/snare/hats events are at least 70% correct on synthetic stems mixed together `⚠️ Assumption`, to be set in design.
2. With the DnB preset, a 174 BPM track reads 174 ± 1, not 87.
3. Auto-style picks DnB/dubstep/techno correctly on representative test tracks. It doesn't flap during a 16-bar crossfade between two genres, and a manual choice overrides it.
4. Built-in scenes visibly use the new sources when Auto-style is on and revert when it is off.
5. Build-up → drop on a test track: heat-up, then a flash and a scene cut at the drop (no cut under LOCK).
6. Custom band: add 40–60 Hz, bind it, see it move, survive a reload.
7. 60A on the M4 holds; gates are green; the pure DSP has mutation-sensitive tests.

## §5 Open questions (design)
- Where each detector runs: worklet vs main thread; the second FFT for lows.
- The style classifier: tempo plus spectral features and its hysteresis. It needs labelled test tracks; synthetic ones are acceptable for CI.
- The drop detector heuristic (energy/bass return after a filtered/sparse section) and its false-cut risk.
- The data model for presets, custom bands and per-genre mappings, versus the SceneDoc and library.
- How the "heat" global modulation composes with scene bindings.
