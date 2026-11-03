// ?bench (plan S2.2, design_effects.md gaps G1–G3), the page the lead runs with Playwright. Line 1 is G3 (timer query,
// parallel compile). After Start: G1 (compile+link ms of every catalog shader), G2 (late frames per target-allocation
// burst on Tunnel), then each generator alone and each filter over Tunnel for 3 s, then each transition over a fade
// between Tunnel and Spectrum (GPU ms, GL error, console errors) into window.__bench. With &sweep, every ISF-Files .fs
// is compiled last (run `node scripts/isf-sweep.mjs` first) into window.__sweep: last, because its compile storm makes
// the governor step the scale down. Lines also go to a <pre>.
import { bindFramebufferInfo } from 'twgl.js'
import { director } from './app'
import { ctx, underruns } from './audio/input'
import { catalog, transitions } from './fx/catalog'
import { parseIsf } from './fx/isf'
import type { ShaderDef } from './fx/types'
import { gl, gpuMs, program, renderTarget, setTransition, stage, temps } from './gl/engine'
import { docs } from './gl/live'
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

// ?bench&milk (plan_milkdrop S1.1): Butterchurn boots on a detached bitmaprenderer canvas, whose getContext('2d') is
// null, so Butterchurn skips its drawImage copy and the frame stays in the undocumented internalCanvas (G2). Then every
// shader-bearing candidate is loaded and rendered once on silence (G3). The dist never checks a shader's compile status,
// so a broken warp/comp throws nothing: the GL error flag after that render is its own line.
async function milk() {
  const { default: butterchurn } = await import('butterchurn')
  // Two file names hold '#', a URL fragment in an import specifier; neither has a shader, so no candidate is dropped.
  const files = import.meta.glob<{ warp: string; comp: string }>(
    ['/node_modules/butterchurn-presets/presets/converted/*.json', '!/node_modules/butterchurn-presets/presets/converted/*#*'],
    { import: 'default', exhaustive: true },
  )
  const canvas = document.createElement('canvas')
  canvas.getContext('bitmaprenderer')
  const t0 = performance.now()
  const v = butterchurn.createVisualizer(ctx, canvas, { width: temps[0].width, height: temps[0].height, pixelRatio: 1, textureRatio: 1 })
  const createdMs = performance.now() - t0
  const boot = {
    internalCanvas: v.internalCanvas instanceof OffscreenCanvas,
    nullCtx2d: canvas.getContext('2d') === null,
    createdMs,
    candidates: 0,
    loadErrors: [] as string[],
    glErrors: [] as string[],
  }
  Object.assign(bench, { milk: { boot } })
  print(`boot: internalCanvas ${boot.internalCanvas ? 'yes' : 'no'}, 2d null ${boot.nullCtx2d ? 'yes' : 'no'}, created ${fmt(createdMs)} ms`)

  const g = v.internalCanvas.getContext('webgl2')! // Butterchurn's own context: a second getContext returns it
  const silence = new Uint8Array(1024).fill(128)
  const audioLevels = { timeByteArray: silence, timeByteArrayL: silence, timeByteArrayR: silence }
  for (const [path, load] of Object.entries(files)) {
    const preset = await load()
    if (!preset.warp && !preset.comp) continue
    boot.candidates++
    const name = path.slice(path.lastIndexOf('/') + 1, -'.json'.length)
    while (g.getError()); // drain, so a flag read below is this preset's
    try {
      await v.loadPreset(preset, 0)
      v.render({ audioLevels, elapsedTime: 1 / 60 })
      const e = g.getError()
      if (e) boot.glErrors.push(`${name} (0x${e.toString(16)})`)
    } catch (e) {
      boot.loadErrors.push(`${name} (${String(e).split('\n')[0]})`)
    }
  }
  const list = (xs: string[]) => xs.map((s) => `\n  ${s}`).join('')
  print(`load errors ${boot.loadErrors.length}/${boot.candidates}${list(boot.loadErrors)}`)
  print(`gl errors ${boot.glErrors.length}/${boot.candidates}${list(boot.glErrors)}`)
}

void run()
  .catch((e) => print(`bench failed: ${e}`))
  .finally(() => (bench.done = true))
