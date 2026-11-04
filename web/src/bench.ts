// ?bench (plan S2.2, design_effects.md gaps G1–G3), the page the lead runs with Playwright. Line 1 is G3 (timer query,
// parallel compile). After Start: G1 (compile+link ms of every catalog shader), G2 (late frames per target-allocation
// burst on Tunnel), then each generator alone and each filter over Tunnel for 3 s, then each transition over a fade
// between Tunnel and Spectrum (GPU ms, GL error, console errors) into window.__bench. With &sweep, every ISF-Files .fs
// is compiled last (run `node scripts/isf-sweep.mjs` first) into window.__sweep: last, because its compile storm makes
// the governor step the scale down. Lines also go to a <pre>.
import { bindFramebufferInfo } from 'twgl.js'
import { director, governor } from './app'
import { ctx, underruns } from './audio/input'
import { catalog, transitions } from './fx/catalog'
import { parseIsf } from './fx/isf'
import type { ShaderDef } from './fx/types'
import { gl, gpuMs, program, renderTarget, setTransition, stage, temps } from './gl/engine'
import { docs } from './gl/live'
import { copy as milkCopy } from './milkdrop/native'
import { BUILTIN } from './scenes/builtin'
import { store } from './store'

const BURSTS = 10 // G2: bursts …
const BURST_GAP_MS = 2000 // … this far apart, each allocating these targets (hdr = RGBA16F) at the internal size
const BURST = [false, false, false, false, true, true]
// Per effect: next() every ITEM_MS. The fade is the director's 2 s without a confident tempo (run it in silence), then
// gpuMs is sampled over the last MEASURE_MS.
const ITEM_MS = 3000
const MEASURE_MS = 1000

const items = [...catalog.values()].filter((d) => d.kind !== 'transition') // transitions: their own loop, after these
const results: { id: string; gpuMed: number | null; gpuP95: number | null; glError: number; consoleErrors: number; compileMs: number | null }[] = []
const bench = { items: items.map(({ id, kind, category }) => ({ id, kind, category })), results, done: false }
Object.assign(window, { __bench: bench })

const pre = document.body.appendChild(document.createElement('pre'))
pre.style.cssText = 'position:fixed;top:0;left:0;margin:0;padding:6px;font:12px monospace;white-space:pre-wrap;color:#8f8;background:#000b;pointer-events:none'
function print(line: string) {
  console.log(line)
  pre.textContent += `${line}\n`
}
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms))
const raf = () => new Promise<number>((ok) => requestAnimationFrame(ok))
/** Calls `each(t)` with every rAF timestamp for `ms`. */
async function frames(ms: number, each: (t: number) => void) {
  const end = performance.now() + ms
  for (let t = await raf(); t < end; t = await raf()) each(t)
}
/** The p-quantile (p 0.5 = the upper median, as quality.ts), null without samples. */
const q = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length * p)] : null)
const fmt = (x: number | null) => (x === null ? '–' : x.toFixed(2))
const stats = (ms: number[]) =>
  `${ms.length} programs, median ${fmt(q(ms, 0.5))}, max ${fmt(Math.max(0, ...ms))}, total ${fmt(ms.reduce((a, b) => a + b, 0))} ms`
const has = (ext: string) => (gl.getSupportedExtensions()?.includes(ext) ? 'yes' : 'no')
const size = () => `${temps[0].width}×${temps[0].height}`

let uniq = 0
/** Compile + link from scratch, timed until LINK_STATUS answers. A unique tail misses our cache and any keyed by source;
 *  a lower, comment-blind one (ANGLE/Metal) still hits for a program built before on this machine: ~1 ms, vs ~40 ms
 *  the first time (S2.2 run). */
function compile(vs: string, fs: string) {
  const t0 = performance.now()
  const p = gl.createProgram()
  const shaders = [vs, `${fs}\n// bench ${++uniq}`].map((src, i) => {
    const s = gl.createShader(i ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    gl.attachShader(p, s)
    return s
  })
  gl.linkProgram(p)
  const ok = !!gl.getProgramParameter(p, gl.LINK_STATUS)
  const ms = performance.now() - t0
  const log = ok ? '' : shaders.map((s) => gl.getShaderInfoLog(s)).join('') || (gl.getProgramInfoLog(p) ?? '')
  for (const s of shaders) gl.deleteShader(s)
  gl.deleteProgram(p)
  return { ok, ms, log }
}

async function run() {
  print(`timer query: ${has('EXT_disjoint_timer_query_webgl2')} · KHR_parallel_shader_compile: ${has('KHR_parallel_shader_compile')}`)
  while (store.getSnapshot().needsStart) await sleep(100)
  print(`audio underrunEvents at start: ${underruns() ?? 'n/a'}`)
  if (location.search.includes('milk')) return milk()

  // G1: the catalog's shader programs. Natives build theirs inside create(), outside the catalog.
  const compileMs = new Map<string, number>()
  for (const d of [...catalog.values()].filter((d): d is ShaderDef => 'fs' in d)) {
    const r = compile(d.vs, d.fs)
    compileMs.set(d.id, r.ms)
    if (!r.ok) print(`G1 ${d.id} failed: ${r.log}`)
  }
  print(`G1 compile+link: ${stats([...compileMs.values()])}`)

  // G2: on Tunnel, each burst's targets are allocated, cleared and freed inside one frame, as prepare-ahead will.
  director.setPlaylist(['builtin:tunnel'])
  director.setHold(true)
  director.next() // a fade into itself when Tunnel is on already
  await sleep(ITEM_MS)
  print(`G2 at ${size()}: ${BURSTS} bursts of ${BURST.length} targets, ${BURST_GAP_MS / 1000} s apart`)
  for (let i = 1; i <= BURSTS; i++) {
    const drops = store.getSnapshot().drops
    let prev = await raf()
    for (const hdr of BURST) {
      const t = renderTarget(hdr)
      t.fit(temps[0].width, temps[0].height)
      bindFramebufferInfo(gl, t)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.deleteFramebuffer(t.framebuffer)
      gl.deleteTexture(t.attachments[0])
    }
    let max = 0
    await frames(BURST_GAP_MS, (t) => {
      max = Math.max(max, t - prev)
      prev = t
    })
    print(`G2 burst ${i}: drops +${store.getSnapshot().drops - drops}, max rAF Δ ${max.toFixed(1)} ms`)
  }

  // Per effect: test docs through live(), one by one through the director, sampled once each fade is over.
  const ids = items.map((d) => `bench:${d.id}`)
  items.forEach((d, i) =>
    docs.set(ids[i], {
      v: 1, id: ids[i], name: d.name, star: false,
      layers: [{
        gen: { ref: d.kind === 'filter' ? 'native/tunnel' : d.id }, fx: d.kind === 'filter' ? [{ ref: d.id }] : [],
        blend: 'normal', opacity: 1, speed: 1, res: 1,
      }],
    }),
  )
  director.setPlaylist(ids)
  let errors = 0
  const error = console.error
  console.error = (...args: unknown[]) => {
    errors++
    error.apply(console, args)
  }
  gl.getError() // clears the flag: each item reads it once, at its end
  print(`per effect at ${size()}: GPU median / p95 ms over the last ${MEASURE_MS / 1000} s of ${ITEM_MS / 1000}`)
  for (const [i, d] of items.entries()) {
    const n = errors
    director.next()
    await sleep(ITEM_MS - MEASURE_MS)
    const ms: number[] = []
    await frames(MEASURE_MS, () => {
      const v = gpuMs.get(ids[i])
      if (v !== undefined) ms.push(v)
    })
    const r = { id: d.id, gpuMed: q(ms, 0.5), gpuP95: q(ms, 0.95), glError: gl.getError(), consoleErrors: errors - n, compileMs: compileMs.get(d.id) ?? null }
    results.push(r)
    print(`${d.id}: GPU ${fmt(r.gpuMed)} / ${fmt(r.gpuP95)}, glError ${r.glError}, console errors ${r.consoleErrors}`)
  }

  // Each transition fades Tunnel ↔ Spectrum (2 s in silence), set every frame over the app's random pick. The engine
  // times scenes only, so drawArrays gets a timer query while the transition's program is current: the pass alone.
  director.setPlaylist(['builtin:tunnel', 'builtin:spectrum'])
  director.next() // off the last test doc
  await sleep(ITEM_MS)
  const timer: { TIME_ELAPSED_EXT: GLenum } | null = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const drawArrays = gl.drawArrays.bind(gl)
  const flight: WebGLQuery[] = []
  let timed: WebGLProgram | null = null
  gl.drawArrays = (mode, first, count) => {
    if (!timer || gl.getParameter(gl.CURRENT_PROGRAM) !== timed) return drawArrays(mode, first, count)
    const query = gl.createQuery()
    gl.beginQuery(timer.TIME_ELAPSED_EXT, query)
    drawArrays(mode, first, count)
    gl.endQuery(timer.TIME_ELAPSED_EXT)
    flight.push(query)
  }
  print(`transitions at ${stage.width}×${stage.height}: the pass's GPU median / p95 ms over a fade`)
  for (const id of transitions) {
    const n = errors
    const def = catalog.get(id) as ShaderDef
    timed = program(def.vs, def.fs).program
    director.next()
    const ms: number[] = []
    await frames(ITEM_MS, () => {
      setTransition(id)
      while (flight.length && gl.getQueryParameter(flight[0], gl.QUERY_RESULT_AVAILABLE)) {
        const query = flight.shift()!
        ms.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6)
        gl.deleteQuery(query)
      }
    })
    const r = { id, gpuMed: q(ms, 0.5), gpuP95: q(ms, 0.95), glError: gl.getError(), consoleErrors: errors - n, compileMs: compileMs.get(id) ?? null }
    results.push(r)
    print(`${id}: GPU ${fmt(r.gpuMed)} / ${fmt(r.gpuP95)} over ${ms.length} frames, glError ${r.glError}, console errors ${r.consoleErrors}`)
  }
  gl.drawArrays = drawArrays
  print(`scenes over those fades, GPU median: Tunnel ${fmt(gpuMs.get('builtin:tunnel') ?? null)}, Spectrum ${fmt(gpuMs.get('builtin:spectrum') ?? null)} ms`)
  console.error = error
  console.table(results)
  if (location.search.includes('sweep')) await sweep()
  print(`audio underrunEvents at end: ${underruns() ?? 'n/a'}`)
}

/** Every ISF-Files .fs: parse and compile, one row each → console.table, window.__sweep and a tally. */
async function sweep() {
  const index: { name: string; vs: boolean }[] = await fetch('/isf-sweep/index.json')
    .then((r) => r.json())
    .catch(() => {
      throw new Error('no /isf-sweep/index.json: run `node scripts/isf-sweep.mjs` first')
    })
  const rows = await Promise.all(
    index.map(async ({ name, vs }) => {
      const row = { file: name, kind: '', category: '', ok: false, ms: 0, unsupported: '', log: '' }
      try {
        const d = parseIsf(await (await fetch(`/isf-sweep/${encodeURIComponent(name)}`)).text(), `isf/${name.slice(0, -3)}`)
        // A sibling .vs that feeds no varying (3d Rotate, Vertex Manipulator) is invisible to parseIsf.
        Object.assign(row, { kind: d.kind, category: d.category ?? '', unsupported: d.unsupported ?? (vs ? 'custom vertex shader' : ''), ...compile(d.vs, d.fs) })
      } catch (e) {
        row.log = String(e)
      }
      return row
    }),
  )
  console.table(rows)
  Object.assign(window, { __sweep: rows })
  const ok = rows.filter((r) => r.ok)
  const tally: Record<string, [number, number]> = {} // kind/category → [compile OK, of them usable]
  for (const r of ok) {
    const t = (tally[`${r.kind}/${r.category || 'none'}`] ??= [0, 0])
    t[0]++
    if (!r.unsupported) t[1]++
  }
  print(`sweep: ${rows.length} files, ${ok.length} compile OK (${stats(ok.map((r) => r.ms))})`)
  print(`sweep OK / usable by kind/category: ${Object.entries(tally).map(([k, [a, b]]) => `${k} ${a}/${b}`).join(', ')}`)
}

// ?bench&milk (plan_milkdrop S1.1, S1.2): Butterchurn boots on a detached bitmaprenderer canvas, whose getContext('2d')
// is null, so Butterchurn skips its drawImage copy and the frame stays in the undocumented internalCanvas (G2). Then the
// kill measures (design C5), on silence, at temps[0]'s size at the start (the visualizers never resize): K1 the four copy
// paths; K2/K3 every shader-bearing candidate, cold on visualizer A (its first load in the page, which also finds the
// load and GL errors, G3) and warm on B; K3/K4 a 60 s autopilot run with MilkDrop rendered every frame. The dist never
// checks a shader's compile status, so a broken warp/comp throws nothing: the GL error flag after its first render says.
// &n=20: the first 20 candidates only (a quick check). &res=0.75&mesh: K2's repeat; &mesh: K4's (mesh 32×24).
const COPY_FRAMES = 300 // K1: frames per copy path
const PRESET_FRAMES = 45 // K2: frames per preset after its load, measured over the last …
const LAST = 30
const RUN_MS = 60_000 // K3/K4
const FADE_MS = 2000 // the director's fade in silence (fallbackTransition): waited out before a MilkDrop load
const DT = 1 / 60 // Butterchurn's elapsedTime: seconds since its previous frame

type N = number | null
interface Row { name: string; loadErr: string; coldMs: number; coldDrops: N; warmMs: N; warmDrops: N; renderMs: N; gpuP95: N; copyP95: N; k2: boolean; k3: boolean }

/** Timer queries on context `c`, which this enables EXT_disjoint_timer_query_webgl2 on: `time` wraps calls, `poll` (once
 *  a frame) collects the finished ones, `take` returns the ms so far and drops those still in flight. Disjoint events are
 *  ignored, as in the transitions loop. Without the extension nothing is timed (null quantiles). */
function gpuTimer(c: WebGL2RenderingContext) {
  const ext: { TIME_ELAPSED_EXT: GLenum } | null = c.getExtension('EXT_disjoint_timer_query_webgl2')
  const flight: WebGLQuery[] = []
  const ms: number[] = []
  return {
    time(fn: () => void) {
      if (!ext) return fn()
      const query = c.createQuery()
      c.beginQuery(ext.TIME_ELAPSED_EXT, query)
      fn()
      c.endQuery(ext.TIME_ELAPSED_EXT)
      flight.push(query)
    },
    poll() {
      while (flight.length && c.getQueryParameter(flight[0], c.QUERY_RESULT_AVAILABLE)) {
        const query = flight.shift()!
        ms.push(c.getQueryParameter(query, c.QUERY_RESULT) / 1e6)
        c.deleteQuery(query)
      }
    },
    take() {
      for (const query of flight.splice(0)) c.deleteQuery(query)
      return ms.splice(0)
    },
  }
}

async function milk() {
  const { default: butterchurn } = await import('butterchurn')
  // Two file names hold '#', a URL fragment in an import specifier; neither has a shader, so no candidate is dropped.
  const files = import.meta.glob<{ warp: string; comp: string }>(
    ['/node_modules/butterchurn-presets/presets/converted/*.json', '!/node_modules/butterchurn-presets/presets/converted/*#*'],
    { import: 'default', exhaustive: true },
  )
  const qs = new URLSearchParams(location.search)
  const n = Number(qs.get('n')) || Infinity
  const res = Number(qs.get('res')) || 1
  const W = Math.round(temps[0].width * res)
  const H = Math.round(temps[0].height * res)
  const mesh = qs.has('mesh') ? { meshWidth: 32, meshHeight: 24 } : { meshWidth: 48, meshHeight: 36 } // 48×36: the dist's default
  /** A visualizer, its creation timed: ~1 s of main thread on the M4, so never inside a timed window. A bitmaprenderer
   *  canvas leaves the frame in internalCanvas; a `plain` one gets Butterchurn's own drawImage copy (path (c)). */
  const viz = (plain = false) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H })
    if (!plain) canvas.getContext('bitmaprenderer')
    const t0 = performance.now()
    const v = butterchurn.createVisualizer(ctx, canvas, { width: W, height: H, pixelRatio: 1, textureRatio: 1, ...mesh })
    return { v, canvas, ms: performance.now() - t0 }
  }
  const A = viz()
  const a = A.v
  const boot = {
    internalCanvas: a.internalCanvas instanceof OffscreenCanvas,
    nullCtx2d: A.canvas.getContext('2d') === null,
    createdMs: A.ms,
    candidates: 0,
    loadErrors: [] as string[],
    glErrors: [] as string[],
  }
  const copy: { path: string; gpuP95: N; mainP95: N; glError: number }[] = []
  const presets: Row[] = []
  const out = { boot, copy, presets, run: {}, verdict: {} }
  Object.assign(bench, { milk: out })
  print(`boot: internalCanvas ${boot.internalCanvas ? 'yes' : 'no'}, 2d null ${boot.nullCtx2d ? 'yes' : 'no'}, created ${fmt(A.ms)} ms`)
  print(`probe at ${W}×${H}, mesh ${mesh.meshWidth}×${mesh.meshHeight}`)
  director.setHold(true) // no autopilot fade inside a measure, until the run

  const g = a.internalCanvas.getContext('webgl2')! // Butterchurn's own context: a second getContext returns it
  const silence = new Uint8Array(1024).fill(128)
  const audioLevels = { timeByteArray: silence, timeByteArrayL: silence, timeByteArrayR: silence }
  const ours = gpuTimer(gl)
  const theirs = gpuTimer(g)
  /** Copy paths (a)–(c): the natives' copy (milkdrop/native.ts) into temps[1]. */
  const upload = (src: OffscreenCanvas | HTMLCanvasElement | ImageBitmap) => {
    bindFramebufferInfo(gl, temps[1])
    milkCopy(src, temps[1].width, temps[1].height)
  }

  // K1. Path (c) is a second visualizer C on a plain canvas: Butterchurn's drawImage runs inside its render(), so the
  // wrapper times it on the main thread; its GPU side runs on the 2D canvas's context, in no timer of ours. A and C
  // render their blank preset: the copy moves W×H pixels whatever they show.
  const C = viz(true)
  print(`C (plain canvas, path (c)) created ${fmt(C.ms)} ms`)
  const c2d = C.canvas.getContext('2d')! // Butterchurn's own 2D context
  const drawImage = c2d.drawImage.bind(c2d)
  let drawMs: number // 0 at each copy frame; path (c)'s render() sets it
  c2d.drawImage =((image: CanvasImageSource, x: number, y: number) => {
    const t0 = performance.now()
    drawImage(image, x, y)
    drawMs = performance.now() - t0
  }) as typeof c2d.drawImage
  const paths: [string, typeof a, () => void][] = [
    ['(a) texSubImage2D(internalCanvas) + flip', a, () => upload(a.internalCanvas)],
    ['(b) transferToImageBitmap + flip', a, () => {
      const bitmap = a.internalCanvas.transferToImageBitmap()
      upload(bitmap)
      bitmap.close()
    }],
    ['(c) drawImage into a 2D canvas + flip', C.v, () => upload(C.canvas)],
    ['(d) FLIP_Y texSubImage2D into temps[1], no draw', a, () => {
      gl.bindTexture(gl.TEXTURE_2D, temps[1].attachments[0])
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, a.internalCanvas)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    }],
  ]
  print(`copy, ${COPY_FRAMES} frames per path: GPU p95 (our context) / main-thread p95 ms`)
  for (const [path, v, fn] of paths) {
    const main: number[] = []
    while (gl.getError()); // drain, so the flag read below is this path's
    for (let i = 0; i < COPY_FRAMES; i++) {
      await raf()
      drawMs = 0
      v.render({ audioLevels, elapsedTime: DT })
      const t0 = performance.now()
      ours.time(fn)
      main.push(drawMs + performance.now() - t0)
      ours.poll()
    }
    const row = { path, gpuP95: q(ours.take(), 0.95), mainP95: q(main, 0.95), glError: gl.getError() }
    copy.push(row)
    print(`${path}: ${fmt(row.gpuP95)} / ${fmt(row.mainP95)}${row.glError ? `, GL error 0x${row.glError.toString(16)}` : ''}`)
  }

  // K2 (and K3's cold half) on A. Cold and warm are wall ms: loadPreset awaits a WASM compile, so a frame may run inside
  // it; the late-frame delta says whether the load blocked one.
  const loaded: { row: Row; preset: object }[] = []
  print(`per preset on A: cold load + first render ms (late frames) · then over the last ${LAST} of ${PRESET_FRAMES} frames: render() main-thread median, GPU p95 Butterchurn + copy (a)`)
  for (const [path, load] of Object.entries(files)) {
    if (boot.candidates === n) break
    const preset = await load()
    if (!preset.warp && !preset.comp) continue
    boot.candidates++
    const name = path.slice(path.lastIndexOf('/') + 1, -'.json'.length)
    const row: Row = { name, loadErr: '', coldMs: 0, coldDrops: null, warmMs: null, warmDrops: null, renderMs: null, gpuP95: null, copyP95: null, k2: false, k3: false }
    presets.push(row)
    while (g.getError()); // drain, so a flag read below is this preset's
    const drops = governor.drops
    const t0 = performance.now()
    try {
      await a.loadPreset(preset, 0)
      a.render({ audioLevels, elapsedTime: DT })
      row.coldMs = performance.now() - t0
      const e = g.getError()
      if (e) {
        row.loadErr = `GL error 0x${e.toString(16)}`
        boot.glErrors.push(`${name} (0x${e.toString(16)})`)
      }
    } catch (e) {
      row.loadErr = String(e).split('\n')[0]
      boot.loadErrors.push(`${name} (${row.loadErr})`)
    }
    if (row.loadErr) {
      print(`${name}: ${row.loadErr}, out`)
      continue
    }
    await raf() // a frame the load made late is counted by now
    row.coldDrops = governor.drops - drops
    const render: number[] = []
    for (let i = 0; i < PRESET_FRAMES; i++) {
      await raf()
      const t1 = performance.now()
      theirs.time(() => a.render({ audioLevels, elapsedTime: DT }))
      render.push(performance.now() - t1)
      ours.time(() => upload(a.internalCanvas))
      theirs.poll()
      ours.poll()
    }
    // Results come a few frames late: the last LAST in hand are frames ≈ 12–42 of 45, past the load's first frames.
    row.renderMs = q(render.slice(-LAST), 0.5)
    row.gpuP95 = q(theirs.take().slice(-LAST), 0.95)
    row.copyP95 = q(ours.take().slice(-LAST), 0.95)
    row.k2 = row.gpuP95 !== null && row.copyP95 !== null && row.gpuP95 + row.copyP95 <= 5
    loaded.push({ row, preset })
    print(`${name}: ${fmt(row.coldMs)} (${row.coldDrops}) · ${fmt(row.renderMs)} · ${fmt(row.gpuP95)} + ${fmt(row.copyP95)}${row.k2 ? '' : ', K2 out'}`)
  }
  const list = (xs: string[]) => xs.map((s) => `\n  ${s}`).join('')
  print(`load errors ${boot.loadErrors.length}/${boot.candidates}${list(boot.loadErrors)}`)
  print(`gl errors ${boot.glErrors.length}/${boot.candidates}${list(boot.glErrors)}`)

  // K3 warm: every preset that loaded, once more on a fresh visualizer B.
  const B = viz()
  print(`B created ${fmt(B.ms)} ms`)
  const warm: number[] = []
  let warmLate = 0
  for (const { row, preset } of loaded) {
    const drops = governor.drops
    const t0 = performance.now()
    await B.v.loadPreset(preset, 0)
    B.v.render({ audioLevels, elapsedTime: DT })
    row.warmMs = performance.now() - t0
    row.k3 = row.warmMs <= 16
    warm.push(row.warmMs)
    await raf()
    row.warmDrops = governor.drops - drops
    warmLate += row.warmDrops
  }
  print(`warm on B, ${warm.length} presets: median ${fmt(q(warm, 0.5))}, p90 ${fmt(q(warm, 0.9))}, max ${fmt(Math.max(0, ...warm))} ms, late frames ${warmLate}`)

  // K3/K4: the autopilot over the starred built-ins; MilkDrop renders on the front visualizer every frame (+ copy (a)).
  // When a fade starts (sceneName, app.ts:337) and is over, the next K2-passing preset loads on the back one, which then
  // comes to the front (prepare-ahead, app.ts:321).
  director.setPlaylist(BUILTIN.filter((d) => d.star).map((d) => d.id))
  director.setHold(false)
  const pool = loaded.filter(({ row }) => row.k2)
  const show = pool.length ? pool : loaded // no K2 pass: K2 failed already, the run still measures
  const vs = [a, B.v]
  let front = 0
  let k = 0
  await vs[front].loadPreset(show[k++].preset, 0)
  const switches: { scene: string; preset: string; ms: number; late: number }[] = []
  const frameMs: number[] = []
  let scene = store.getSnapshot().sceneName
  let fadeEnd = Infinity
  let busy = false
  let loading = Promise.resolve()
  const prepare = async () => {
    const { row, preset } = show[k++ % show.length]
    const drops = governor.drops
    const t0 = performance.now()
    await vs[1 - front].loadPreset(preset, 0)
    vs[1 - front].render({ audioLevels, elapsedTime: DT })
    const ms = performance.now() - t0
    front = 1 - front
    await raf()
    const s = { scene, preset: row.name, ms, late: governor.drops - drops }
    switches.push(s)
    print(`switch to ${s.scene}, then ${s.preset} on the back visualizer: ${fmt(ms)} ms, late frames ${s.late}`)
  }
  print(`60 s run: starred built-ins in silence, MilkDrop render() + copy (a) every frame, a load after each fade`)
  await frames(RUN_MS, (t) => {
    const t0 = performance.now()
    vs[front].render({ audioLevels, elapsedTime: DT })
    upload(vs[front].internalCanvas)
    frameMs.push(performance.now() - t0)
    const s = store.getSnapshot().sceneName
    if (s !== scene) {
      scene = s
      fadeEnd = t + FADE_MS
    }
    if (busy || t < fadeEnd) return
    busy = true
    fadeEnd = Infinity
    loading = prepare().finally(() => (busy = false))
  })
  await loading
  const jsMs = governor.jsMs
  const probeMs = q(frameMs, 0.5) ?? 0
  const sum = jsMs + probeMs
  print(`60 s run: app JS median ${fmt(jsMs)} + MilkDrop per frame median ${fmt(probeMs)} = ${fmt(sum)} ms (JS with MilkDrop)`)

  const pass = (ok: boolean) => (ok ? 'pass' : 'fail')
  const k2n = loaded.filter(({ row }) => row.k2).length
  const late = switches.filter((s) => s.late).length
  const verdict = {
    K1: pass(copy.some((r) => !r.glError && (r.gpuP95 ?? Infinity) <= 1 && (r.mainP95 ?? Infinity) <= 0.5)),
    K2: pass(k2n >= 20),
    K3: pass((q(warm, 0.5) ?? Infinity) <= 8 && (q(warm, 0.9) ?? Infinity) <= 16 && !late),
    K4: pass(sum < 9),
  }
  Object.assign(out, { run: { switches, jsMs, probeMs, sum }, verdict })
  console.table(presets)
  print(`K1: ${verdict.K1} (GPU / main p95 ms ${copy.map((r) => `${r.path.slice(0, 3)} ${fmt(r.gpuP95)} / ${fmt(r.mainP95)}`).join(', ')}; a path passes at ≤ 1 / ≤ 0.5)`)
  print(`K2: ${verdict.K2} (${k2n} of ${loaded.length} presets ≤ 5 ms GPU + copy p95, 20 needed)${verdict.K2 === 'fail' ? ' → re-run with &res=0.75&mesh' : ''}`)
  print(`K3: ${verdict.K3} (warm median ${fmt(q(warm, 0.5))} ≤ 8, p90 ${fmt(q(warm, 0.9))} ≤ 16 ms; late frames at ${late} of ${switches.length} loads in the run)`)
  print(`K4: ${verdict.K4} (${fmt(jsMs)} + ${fmt(probeMs)} = ${fmt(sum)} ms, fails at ≥ 9)${verdict.K4 === 'fail' ? ' → re-run with &mesh' : ''}`)
}

void run()
  .catch((e) => print(`bench failed: ${e}`))
  .finally(() => (bench.done = true))
