ANCHOR: **Frozen contract** (D1–D3, D7, § Variant B contracts; `camera/camera.ts`, `camera/smooth.ts`, `doc.ts`, `edit.ts`, `gl/live.ts`, `bind.ts`):
MODE: replace-block-until: // bind.ts: 'presence' ∈ SOURCE_IDS, group 'camera'
**Frozen contract, rev 2** (D1–D3, D7, § Variant B contracts; design L566–L575; recheck N-1, N-2, N-4, N-5; `camera/camera.ts`, `camera/users.ts`, `camera/host.ts`, `camera/smooth.ts`, `doc.ts`, `edit.ts`, `gl/live.ts`, `bind.ts`):
```ts
export const cam: { tex: WebGLTexture; mask: WebGLTexture; xf: Float32Array; ref: WebGLTexture; stats: MaskStats; live: boolean; video: boolean; error: string | null }
//   ref: 1×1 slow EMA (τ ≈ 1 s) of the mean luma, GPU only (K-5) · mask: never null, resetMask() clears it to zeros (N-2)
//   video: the main-UI switch, default true, not in the scene doc (Decision 1) · error: the last host failure, null after the next good mask (K-1)
export function tick(now: number): void          // once per rAF in app.ts `frame`, before render(): upload, EMA pass (k = gate), ref, presence; the only place a host starts, retires or fails: watchdog + retry (K-1, K-6, K-11)
export function use(mask: boolean): () => void   // camera/users.ts: a pure counter; the release is idempotent; host wanted = mask users > 0 && cam.live; the stream stays open while selected (K-3, K-11)
export function listCameras(): Promise<MediaDeviceInfo[]> · allowCameras() · selectCamera(id: string | 'off' | File): Promise<void>   // selectCamera: the last call wins (generation token) and begins with resetStream() (K-4, K-7)
// camera.ts internal: resetMask() = gate area + held 0, both EMA targets cleared, presence 0 · resetStream() = resetMask() + every track stop() + srcObject null + cam.live false (K-4, N-2)
export const STUCK_MS = 1000, INIT_MS = 10_000, RETRY_MS = 5000   // camera/host.ts, [R0] (K-1); the retry window counts from the last granted respawn (N-3)
export interface Gate { area: number; held: number }
export function gate(g: Gate, area: number): number   // k: 0 (area > AREA_MAX .6, or a jump > JUMP .5 for ≤ HOLD 6 masks), SLOW .15 after HOLD, else KEEP .85; g.area follows with k
export function presence(area: number): number        // clamp(area / PRESENCE_FULL .08); rests at 0
export type MaskMode = 'person' | 'background'; interface LayerDoc { /* as today */ mask?: MaskMode }
export function setMask(doc: SceneDoc, layer: number, m: MaskMode | undefined): MaskMode | undefined  // returns the old value, the setBlend shape
// live.ts composite: op *= none ? 1 : person ? m : 1 − m; m = smoothstep(.5 − f, .5 + f, texture(uMask, uv * xf.xy + xf.zw).r), f = .15; a masked layer never takes `direct`
// live.ts users: a layer holds one use(true) while l.mask is set: buildLayer, Live.setMask (none ↔ mode), freeLayer; a tile build (`own` set) takes none (K-3, N-4)
// live.ts hide: while !cam.live || !cam.video a `native/camera` layer is skipped by the `ok` test that `muted` uses: it adds nothing under any blend, multiply included (N-1)
// DEBUG only (app.ts, beside __src): window.__cam = { cam, users(), hosts(), frames(), builds(), readCam, readMask, select: selectCamera }   // harness hooks: mask users, SegmentWorker constructions, frames posted to a host, buildLayer calls (S1.6); readCam / readMask have no other caller outside camprobe.ts (N-5)
// bind.ts: 'presence' ∈ SOURCE_IDS, group 'camera'
