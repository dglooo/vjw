### K-3 closure: the video on/off rule (CP1 contract rev 2; S1.6, S1.3, S1.4)
1. **One `use(true)` per mask consumer, owned by that consumer.** A layer holds one while `l.mask` is set. It is taken in `buildLayer`, and in `Live.setMask` on none → mode. It is released in `Live.setMask` on mode → none, and in `freeLayer`. A change person ↔ background takes and releases nothing. The release function is stored on the layer and is idempotent. A `native/camera` instance holds its own from `create` to `dispose` (S1.3; a tile instance holds none, K-11).
2. **`use()` only counts.** A host is wanted while mask users > 0 and `cam.live`. `tick()` is the one place that starts or retires it. A take and a release inside one task (boot warm-up, `restructure`) never reach `tick` and spawn nothing (K-11). `ponytail:` no linger; if a scene cut ever shows a mask gap, hold the stop for 1 s.
3. **Consequence.** Hiding, removing or re-adding the camera picture moves the count by one. While one masked layer exists, the count stays ≥ 1, the host keeps running and `cam.mask` stays valid. Masked layers do not blank (cases 1 and 2 of the finding). Removing the last mask user stops segmentation at the next `tick` (case 3).
4. **Two switches, two meanings.** *Video off* hides the camera picture only; the masks keep working. *Camera off* (`selectCamera('off')` → `resetStream()`) also empties the masks: person layers hide, background layers show in full, `presence` is 0. In both states `native/camera` adds nothing to the composite: alpha 0, not opaque black. ⚠️ Assumption, needs confirmation: normal blend honours layer alpha (read from the D4 note at plan L173). Every other layer, the bindings and the audio keep running. No layer is rebuilt and no `use()` is released, so "on" costs one frame (video), or one `getUserMedia` plus the host start (camera).
5. **Tests** (S1.6 Done). T3a: Mask: person on a TD layer, no camera layer → the worker gets `frame` messages and `readMask()` is non-null. T3b: add, then remove a `native/camera` layer → the TD layer keeps its mask and `camMask.model` stays `selfie`. T3c: on the only masked layer, set the mask to none, undo, redo, undo, then delete the layer → the mask-user count reads 0, 1, 0, 1, 0 (through the debug global, as `__src.presence` is read), and the worker gets no `frame` message within 1 s of each 0. One Vitest case pins the counter (take twice, release one handle twice → 1); it lands with the counter in S1.2b, in a file that imports without GL.

### CP1 contract, rev 2 (changes only; every export of plan L50–L60 that is not listed stands)
```ts
export const cam: { tex: WebGLTexture; mask: WebGLTexture; xf: Float32Array; ref: WebGLTexture; stats: MaskStats; live: boolean; video: boolean; error: string | null }
//   ref: 1×1 slow EMA of the mean luma, GPU only (K-5) · error: the last host failure, null after the next good mask (K-1) · video: Decision 1
export function tick(now: number): void          // as before, and the only place a host starts, retires or fails: watchdog + retry (K-1, K-6, K-11)
export function use(mask: boolean): () => void   // a pure counter; the release is idempotent; host wanted = mask users > 0 && cam.live (K-3, K-11)
export function selectCamera(id: string | 'off' | File): Promise<void>   // the last call wins; begins with resetStream() (K-4, K-7)
export const STUCK_MS = 1000, INIT_MS = 10_000, RETRY_MS = 5000          // [R0] (K-1)
// live.ts: a layer holds one use(true) while l.mask is set: buildLayer, Live.setMask (none ↔ mode), freeLayer (K-3)
```

