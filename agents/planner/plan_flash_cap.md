# plan_flash_cap — effects polish §3: one shared WCAG flash budget, softer strobe

## TL;DR
- `own/strobe` and `own/flash` are uncapped (research §3): above 180 BPM, on kick rolls, or with the binding's `rate` knob they pass WCAG 2.3.1's 3 flashes/s. Only the heat post-pass strobe is capped (`postFor`, `gl/post.ts:26-29`).
- One step S1.1: a pure `flashGate` next to `WCAG` in `gl/post.ts` (Vitest), applied at the uniform write in `gl/live.ts` with one module-level onset list shared by every flash-class param of every layer and both scenes of a fade (the engine renders each scene through the same `f`, `gl/engine.ts:163-171`); `strobe.fs` colour alpha 1.0 → 0.6; one `?debug` key so the lead can count.
- 4 source files + 1 test; `strobe.fs` and `app.ts` are one literal / one key each. Lead's call: peel those two into a Tier-1 one-liner if ≤ 3 files is strict.

## Freshness
2026-11-04. Inputs: `agents/research/_adhoc/effects_polish_2026-11-03.md` §3 (1 day), code at master `652e3cf`. No new deps.

## Chosen variant
Tier 2: no design artifact. Lead decisions 1–6 (brief, 2026-11-04); user "go" on the polish queue (STATE HEAD, 2026-11-04). Two choices the brief left open:
- **Marking flash-class params:** a const set in `live.ts` keyed `ref.name` (`own/strobe.strobe`, `own/flash.flash`). Both params are ours and `bindInto` already holds `ref` and `name`; an ISF header key would touch `fx/types.ts` + `fx/isf.ts` for the same two entries.
- **Post strobe stays outside the budget.** Its pulses sit on the beat grid `own/strobe` fires on (both read `sync.beat`), so they coincide rather than add; it peaks at +0.15 gain and self-caps (`post.ts:26-29`); counting it would change `postFor`'s return shape (`engine.ts` `Post`) and its 70-line test for nothing.

## Checkpoints
### CP1 — the cap holds end to end (the only CP)
**Frozen contract** (`web/src/gl/post.ts`, next to `WCAG`; `web/src/gl/live.ts`):
```ts
export interface FlashState { prev: number; blocked: boolean } // prev = last gated output; blocked = a refused onset, until the raw falls below ON
export function flashGate(y: number, s: FlashState, onsets: number[], t: number): number // t = f.time, s
export const flashOnsets: number[] = [] // live.ts: the shared budget — times of the allowed onsets, oldest first, ≤ WCAG entries
```
Semantics (`ON = 0.5`, the bool on-level at `live.ts:257`; floats use the same line):
- **Onset** = `y ≥ ON` while `s.prev < ON` and `!s.blocked`: bool false→true, float rising through 0.5. NaN `y` reads 0.
- **Allowed** when fewer than `WCAG` entries of `onsets` lie in the closed window `[t − 1, t]` (prune `onsets[0] < t − 1` from the front; pushes are in time order). Push `t`, return `y` (`s.prev = y`).
- **Refused:** `s.blocked = true`, return `s.prev` — the bool stays false, the float holds its pre-onset value.
- **Every other frame the output never rises:** `return (s.prev = Math.min(y, s.prev))`; `y < ON` clears `blocked`. So a refused flash cannot leak later — not when the raw dips under 0.5, not through a re-trigger above it — and the output climbs again only at the next allowed onset; a re-trigger while still on decays instead of flickering.
```ts
export function flashGate(y: number, s: FlashState, onsets: number[], t: number): number {
  if (!(y >= 0)) y = 0
  if (y < ON) s.blocked = false
  else if (s.prev < ON && !s.blocked) {
    while (onsets.length && onsets[0] < t - 1) onsets.shift()
    if (onsets.length < WCAG) { onsets.push(t); return (s.prev = y) }
    s.blocked = true
  }
  return (s.prev = Math.min(y, s.prev))
}
```
**Demo:** `cd web && npm run dev` → `localhost:5173/?debug&preset=dnb`, file source `scratchpad/fx_audio/dnb174.wav`, wait for LOCK 174, scene Pixel strobe. Every beat shows a 60 % white wash (2.9/s, nothing refused), not a pure white frame. Panel (E) → the `own/strobe` node → `strobe` binding → `rate` knob (shown for shaped bindings, `ui/Panel.tsx:130`) → **2**: raw 5.8 onsets/s, seen as groups of 3 flashes then a pause. DevTools: `setInterval(() => console.log(__flash.map((t) => t.toFixed(2)).join(' ')), 500)` for 10 s — no 4 distinct stamps within 1.00 s. Why not a 190 BPM file: `audio/tempo.ts:26` folds readings into [90, 180), a 190 track reads 95; there is no `playbackRate` in `src`; `rate` doubles the saw on the same gate path.

## Steps
### S1.1 [ ] — the gate, its wiring, the strobe default
Invoke the `ponytail` skill (full) before writing code. ~45 min, no deps, no donor.

**Files**
- `web/src/gl/post.ts` — append after L31: `const ON = 0.5`, `FlashState`, `flashGate` (contract above; reuse `WCAG`).
- `web/src/gl/post.test.ts` — `describe('flashGate')`, below.
- `web/src/gl/live.ts` — L11: import `flashGate`, `type FlashState` from `./post`. L38 `Bound`: `+ flash?: FlashState`. After L39: `const FLASH = new Set(['own/strobe.strobe', 'own/flash.flash'])` and `export const flashOnsets: number[] = []` (module level = shared by every `live()` instance). L144–145 `bindInto`: hoist `old.find(...)` into `was`; `state: was?.state ?? { y: 0 }`; for `FLASH.has(\`${ref}.${name}\`)` carry `was?.flash ?? { prev: 0, blocked: false }` (same carry-over as `state`, so a rebind mid-flash neither re-counts nor leaks). L254–257 `render`: `let y = evaluate(...)`; `if (x.flash) y = flashGate(y, x.flash, flashOnsets, f.time)`; the write at L256–257 unchanged (bool at `y >= 0.5`).
- `web/src/fx/own/strobe.fs` L9: `"DEFAULT": [1.0, 1.0, 1.0, 0.6]` (⚠️ taste knob; Pixel strobe sets no colour, `builtin.ts:68`, so the default applies).
- `web/src/app.ts` L177: add `__flash: flashOnsets` to the `?debug` `Object.assign(window, …)` (import from `./gl/live`).

**Vitest (`post.test.ts`)** — harness `run(raw, secs = 3, fps = 60)`: fresh `FlashState` + fresh `onsets`, `t = k / fps`, returns `out[]`. `rises` = frames with `out ≥ 0.5 && previous out < 0.5`; `maxPerSecond` = max over rises i of the count of rises within `[tᵢ, tᵢ + 1]`. Raw signals at r/s, from the two shipped bindings: bool saw `0.65 · (1 − (t·r % 1))` (strobe.fs:12 at conf 1) and float kick `0.9 · exp(−(t·r % 1) / r / 0.1)` (flash.fs:12, release 0.1).
1. r ∈ {1, 4, 10} × {saw, kick}: `maxPerSecond ≤ 3`; allowed rises 3 / 8 / 9 (at 4/s the allowed stamps are 0, .25, .5, 1.25, 1.5, 1.75, 2.5, 2.75: at t = 1.0 stamp 0 is still inside the closed window; at 10/s 3 per second). If frame arithmetic bites, loosen to ≥ 7 / ≥ 9 and keep `≤ 3`.
2. r = 1 (under the cap): `out` deep-equals the raw samples — the gate is the identity.
3. Never rises: for every case the count of frames with `out[k] > out[k − 1]` equals the allowed count (the output climbs only through an allowed onset) — covers "blocked float never rises".
4. Shared budget: states A and B on one `onsets`, both fed the 4/s saw: t = 0 both allowed; t = 0.25 A allowed, B refused (B's output stays < 0.5 while A's crosses); A ∪ B rises in the first second ≤ 3.
5. NaN raw → 0 out, finite state; `blocked` clears once the raw drops under 0.5 and the next onset is counted.

**Done-check:** `npm run lint && npm run typecheck && npm test` (expect 317 + new), then the CP1 demo (lead). Browser check for the coder: Pixel strobe at rate 2 flashes in groups of 3.

**Known ceilings** (`ponytail:` comments in code): flash-class is by name, a user ISF with a strobe-like param is uncapped (upgrade: a `VJW_FLASH` header key when a third such shader appears); a sub-0.5 swell on `flash` (e.g. bound to `bass`) steps at 0.5 (upgrade: trough-relative hysteresis); hidden layers and the outgoing scene of a fade spend budget, and two params flashing in one frame count twice — both stricter, harmless.

## Acceptance mapping
- Spec §7 has no flash-rate criterion (`grep WCAG|photosens` over `thoughts/`: none). Research §3 "not covered by the WCAG cap" → S1.1 tests 1, 3, 4 + CP1 demo (rate 2 ≤ 3/s).
- Research §3 "fully white frame" → S1.1 `strobe.fs` alpha 0.6 → CP1 demo, visual.
- Lead decision 1 (budget shared across layers and both scenes) → module-level `flashOnsets` + test 4.
- Lead decision 4 (onset / refused / no leak) → contract semantics + tests 3, 5.

## Research gaps
None blocking. ⚠️ Assumption, needs confirmation: alpha 0.6 is the lead's taste default, the user may retune it later.
