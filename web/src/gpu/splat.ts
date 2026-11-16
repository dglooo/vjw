// native/particles' WebGPU path (GPU3D CP2, plan_gpu3d S2.2; design § Variant C rev 1), from the S1-W spike (55d06ba,
// scratchpad/gpu3d/s1w.md). One compute pass integrates the TF path's physics (scenes/particles.ts's VS, in WGSL) in
// place and splats each particle with ONE atomicAdd into a w × h u32 count buffer (1 × 1 footprint, no point raster);
// one fullscreen resolve writes the count as data into an opaque canvas: R = count & 255, G = count >> 8, saturated at
// 65 535; B of texel (0, 0) = the frame index mod 256 (the same-frame marker; the look reads R and G only).
// The only module that touches navigator.gpu. VeeJay Wizard's own code; pcg_hash as cited below.
import { grownCapacity } from '../scenes/particles'

/** One frame's inputs: the TF pass's uniforms, as particles.ts's draw() computes them (s, s, radial impulse units/s,
 *  att.bass 0..3, beat envelope, swirl). The aspect is the count buffer's w / h. */
export interface SplatUniforms { dt: number; time: number; kick: number; bass: number; pulse: number; swirl: number }

export interface SplatPath {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas // count as data, alphaMode 'opaque'
  readonly particles: GPUBuffer // pos.xy, vel.xy per particle (vec4f); harness readback only
  readonly counts: GPUBuffer // u32 per texel, row-major from the top; harness readback only
  readonly index: number // frame index of the last submit (0: none yet)
  /** clear, integrate + atomicAdd, resolve, submitted. n > capacity or a new w × h schedules a build between frames;
   *  meanwhile the frame runs min(n, capacity) at the built size. Before the first build it submits nothing. */
  frame(n: number, w: number, h: number, u: SplatUniforms): void
  webgpuMs(): number | undefined // p95 of the last WINDOW frames' timestamp-query ms; undefined without the feature
  dispose(): void // this instance's buffers, never the device
}

const WINDOW = 120 // frames in webgpuMs()'s p95: the governor's window (quality.ts N)

// Scene units: y −1..1, x scaled by the aspect. Each id has its own state slot; ids ≥ u.seeded are new (GPU3D C8).
const WGSL = /* wgsl */ `
struct U { dt: f32, time: f32, kick: f32, bass: f32, pulse: f32, swirl: f32, aspect: f32, n: u32, w: u32, h: u32, seeded: u32, index: u32 }
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> parts: array<vec4f>; // pos.xy, vel.xy
@group(0) @binding(2) var<storage, read_write> counts: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read> img: array<u32>; // the same buffer, for the resolve

// pcg_hash (Jarzynski & Olano 2020, "Hash Functions for GPU Rendering", JCGT 9(3), https://jcgt.org/published/0009/03/02/),
// 24-bit uniform in [0, 1): particles.ts's idHash. hash() = its respawn hash (time-keyed, so no fixed pattern).
fn idHash(m: u32) -> f32 {
  let s = m * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return f32(((w >> 22u) ^ w) >> 8u) * (1.0 / 16777216.0);
}
fn hash(x: f32) -> f32 { return fract(sin(x) * 43758.5453); }

@compute @workgroup_size(256)
fn step(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= u.n) { return; }
  let id = f32(i);
  let k = i * 4u; // 4 streams per id
  let r1 = idHash(k);
  let r2 = idHash(k + 1u);
  var s = parts[i];
  if (i >= u.seeded) { // a new id: a random point of the disc, at rest
    let a = 6.2831853 * idHash(k + 2u);
    s = vec4f((0.06 + 0.66 * sqrt(idHash(k + 3u))) * vec2f(cos(a), sin(a)), 0.0, 0.0);
  }
  var p = s.xy;
  var v = s.zw;
  let d = length(p);
  let dir = select(vec2f(cos(id), sin(id)), p / d, d > 1e-5);
  let home = (0.06 + 0.66 * sqrt(r1)) * (0.8 + 0.2 * u.bass + 0.1 * u.pulse);
  v += dir * u.kick * (0.35 + r2);
  v += vec2f(-dir.y, dir.x) * u.swirl * d * (0.6 + 0.8 * r2) * u.dt;
  v -= dir * (d - home) * 40.0 * u.dt; // particles.ts's SPRING
  v *= exp(-3.0 * u.dt); // its DRAG
  p += v * u.dt;
  if (length(p) > 3.0) { // flung off-screen: respawn at the centre
    let a = 6.2831853 * hash(id + u.time);
    p = vec2f(cos(a), sin(a)) * 0.05 * hash(id * 1.7 + u.time);
    v = vec2f(0.0);
  }
  parts[i] = vec4f(p, v);
  let q = vec2f(p.x / u.aspect, p.y) * 0.5 + 0.5; // clip → 0..1, y up: the TF path's gl_Position
  let x = i32(floor(q.x * f32(u.w)));
  let y = i32(floor((1.0 - q.y) * f32(u.h))); // rows top-down, as the resolve's frag coord
  if (x >= 0 && y >= 0 && x < i32(u.w) && y < i32(u.h)) { atomicAdd(&counts[u32(y) * u.w + u32(x)], 1u); }
}

@compute @workgroup_size(1) fn mark() {} // the frame-start timestamp: an empty pass writes none (s1w.md)

@vertex fn vs(@builtin(vertex_index) k: u32) -> @builtin(position) vec4f {
  return vec4f(f32(k & 1u) * 4.0 - 1.0, f32(k >> 1u) * 4.0 - 1.0, 0.0, 1.0);
}
@fragment fn fs(@builtin(position) c: vec4f) -> @location(0) vec4f {
  let x = u32(c.x);
  let y = u32(c.y);
  let n = min(img[y * u.w + x], 65535u);
  let b = select(0u, u.index & 255u, x == 0u && y == 0u);
  return vec4f(vec3f(f32(n & 255u), f32(n >> 8u), f32(b)) / 255.0, 1.0);
}`

// TS 6.0's lib.dom has the WebGPU interfaces but not these two runtime globals, nor getContext('webgpu') (S1-W).
declare const GPUBufferUsage: Record<'MAP_READ' | 'COPY_SRC' | 'COPY_DST' | 'UNIFORM' | 'STORAGE' | 'QUERY_RESOLVE', number>
declare const GPUMapMode: { READ: number }

let device: Promise<GPUDevice | null> | undefined
/** One device per page, with timestamp-query when the adapter has it. null, never a throw: no navigator.gpu, no
 *  adapter, a failed request, or a lost device (dead for the page: no retry). */
export function splatDevice(): Promise<GPUDevice | null> {
  return (device ??= (async () => {
    const a = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' })
    if (!a) return null
    const d = await a.requestDevice({ requiredFeatures: a.features.has('timestamp-query') ? ['timestamp-query'] : [] })
    void d.lost.then((i) => {
      device = Promise.resolve(null)
      console.warn(`splat: WebGPU device lost (${i.reason}): ${i.message}`)
    })
    return d
  })().catch(() => null))
}

export function createSplat(dev: GPUDevice): SplatPath {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('webgpu') as unknown as GPUCanvasContext
  const format = navigator.gpu.getPreferredCanvasFormat()
  ctx.configure({ device: dev, format, alphaMode: 'opaque' })
  const mod = dev.createShaderModule({ code: WGSL })
  void mod.getCompilationInfo().then((c) => {
    for (const m of c.messages) if (m.type === 'error') console.error(`splat: WGSL ${m.lineNum}:${m.linePos} ${m.message}`)
  })
  const sim = dev.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: 'step' } })
  const mark = dev.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: 'mark' } })
  const resolve = dev.createRenderPipeline({
    layout: 'auto', vertex: { module: mod, entryPoint: 'vs' }, fragment: { module: mod, entryPoint: 'fs', targets: [{ format }] },
  })
  const B = GPUBufferUsage
  const ubuf = dev.createBuffer({ size: 48, usage: B.UNIFORM | B.COPY_DST })
  const u = new ArrayBuffer(48)
  const uf = new Float32Array(u)
  const uu = new Uint32Array(u)
  const store = (size: number) => dev.createBuffer({ size, usage: B.STORAGE | B.COPY_SRC | B.COPY_DST })
  let parts = store(16) // placeholders until the first build: capacity 0, size 0 × 0
  let counts = store(4)
  let capacity = 0, w = 0, h = 0, seeded = 0, index = 0 // seeded: high-water mark, the ids a pass has covered
  let want = [0, 0, 0] // the last frame()'s n, w, h: what a build makes
  let task: ReturnType<typeof setTimeout> | undefined // the pending build: at most one
  let simBG!: GPUBindGroup
  let resBG!: GPUBindGroup
  const ts = dev.features.has('timestamp-query') ? (() => {
    const maps = [0, 1, 2, 3].map(() => dev.createBuffer({ size: 16, usage: B.MAP_READ | B.COPY_DST }))
    return { qs: dev.createQuerySet({ type: 'timestamp', count: 2 }), res: dev.createBuffer({ size: 16, usage: B.QUERY_RESOLVE | B.COPY_SRC }), maps, free: [...maps] }
  })() : undefined
  const times: number[] = [] // GPU ms per frame, the last WINDOW
  const end = (i: number) => (ts ? { timestampWrites: { querySet: ts.qs, endOfPassWriteIndex: i } } : {}) // pass ends only: starts do not order (s1w.md)

  /** GPU3D C8: a task between frames, never inside frame(). The particle buffer grows to grownCapacity() with its state
   *  copied on the GPU (`seeded` stays, so the new ids take their hash seed in the next pass); a new size rebuilds the
   *  count buffer and resizes the canvas. */
  const build = () => {
    task = undefined
    const [n, W, H] = want
    if (n > capacity) {
      const next = store(16 * grownCapacity(capacity, n))
      const enc = dev.createCommandEncoder()
      enc.copyBufferToBuffer(parts, 0, next, 0, 16 * capacity)
      dev.queue.submit([enc.finish()])
      parts.destroy() // after the submit: the copy still runs
      parts = next
      capacity = next.size / 16
    }
    if (W !== w || H !== h) {
      counts.destroy()
      counts = store(4 * W * H)
      w = canvas.width = W
      h = canvas.height = H
    }
    const e = (binding: number, buffer: GPUBuffer) => ({ binding, resource: { buffer } })
    simBG = dev.createBindGroup({ layout: sim.getBindGroupLayout(0), entries: [e(0, ubuf), e(1, parts), e(2, counts)] })
    resBG = dev.createBindGroup({ layout: resolve.getBindGroupLayout(0), entries: [e(0, ubuf), e(3, counts)] })
  }

  return {
    canvas,
    get particles() { return parts },
    get counts() { return counts },
    get index() { return index },
    frame(n, W, H, p) {
      want = [n, W, H]
      if (n > capacity || W !== w || H !== h) task ??= setTimeout(build, 0)
      if (!w) return
      const m = Math.min(n, capacity)
      uf.set([p.dt, p.time, p.kick, p.bass, p.pulse, p.swirl, w / h])
      uu.set([m, w, h, seeded, ++index], 7)
      seeded = Math.max(seeded, m)
      dev.queue.writeBuffer(ubuf, 0, u)
      const enc = dev.createCommandEncoder()
      const mp = enc.beginComputePass(end(0)) // 1 empty thread: its end marks the frame start
      mp.setPipeline(mark)
      mp.dispatchWorkgroups(1)
      mp.end()
      enc.clearBuffer(counts)
      const cp = enc.beginComputePass()
      cp.setPipeline(sim)
      cp.setBindGroup(0, simBG)
      cp.dispatchWorkgroups(Math.ceil(m / 256))
      cp.end()
      const rp = enc.beginRenderPass({
        colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
        ...end(1),
      })
      rp.setPipeline(resolve)
      rp.setBindGroup(0, resBG)
      rp.draw(3)
      rp.end()
      const mb = ts?.free.pop()
      if (ts && mb) {
        enc.resolveQuerySet(ts.qs, 0, 2, ts.res, 0)
        enc.copyBufferToBuffer(ts.res, 0, mb, 0, 16)
      }
      dev.queue.submit([enc.finish()])
      if (ts && mb) {
        mb.mapAsync(GPUMapMode.READ).then(() => {
          const t = new BigUint64Array(mb.getMappedRange())
          times.push(Number(t[1] - t[0]) / 1e6)
          if (times.length > WINDOW) times.shift()
          mb.unmap()
          ts.free.push(mb)
        }).catch(() => {}) // disposed or lost: the buffer is gone
      }
    },
    webgpuMs() {
      if (!times.length) return undefined
      const s = [...times].sort((a, b) => a - b)
      return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]
    },
    dispose() {
      clearTimeout(task) // a pending build does nothing on a disposed instance
      for (const b of [ubuf, parts, counts, ts?.res, ...(ts?.maps ?? [])]) b?.destroy()
      ts?.qs.destroy()
      ctx.unconfigure()
    },
  }
}
