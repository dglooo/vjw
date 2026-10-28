// Throwaway probe page (plan S1.2: R1, R2, R5, R6, R9). Open with ?probe. Deleted in S6.1.
import workletUrl from './probe.worklet.ts?worker&url'

const TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.64002A,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]
const REC_TYPE = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) // first MP4, else WebM

const VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`
// ~200 iterations per pixel = the GPU load for R2.
const FS = `#version 300 es
precision highp float;
uniform float t;
out vec4 o;
void main() {
  vec2 p = gl_FragCoord.xy * 0.002;
  float v = 0.0;
  for (int i = 0; i < 200; i++) v += sin(p.x * float(i) + t) * cos(p.y * float(i) - t);
  o = vec4(0.5 + 0.5 * sin(v * 0.1 + vec3(0.0, 2.0, 4.0)), 1.0);
}`

const stage = document.getElementById('stage') as HTMLCanvasElement
const ui = document.getElementById('ui')!
const bar = document.createElement('div')
const pre = document.createElement('pre')
ui.style.overflow = 'auto'
bar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px'
pre.style.cssText = 'margin:0;padding:8px;background:#000c;color:#ddd;font:13px/1.4 ui-monospace,monospace;white-space:pre-wrap'
ui.append(bar, pre)

const gl = stage.getContext('webgl2')
const ctx = new AudioContext()
const silent = new MediaStreamAudioDestinationNode(ctx) // silent audio track for the recorder
const osc = new OscillatorNode(ctx)
osc.connect(new GainNode(ctx, { gain: 0 })).connect(silent)
osc.start()

const out = {
  head: `VeeJay probe · ${import.meta.env.DEV ? 'dev' : 'build/preview'} · ${new Date().toISOString()}\n${navigator.userAgent}`,
  codecs: `R1 codecs (MediaRecorder.isTypeSupported):\n${TYPES.map((t) => `  ${MediaRecorder.isTypeSupported(t) ? 'yes' : 'no '}  ${t}`).join('\n')}`,
  size: size().line,
  timer: `R1 timer query: EXT_disjoint_timer_query_webgl2 ${gl ? (gl.getExtension('EXT_disjoint_timer_query_webgl2') ? 'present' : 'absent') : 'n/a (no WebGL2)'}`,
  autoplay: `R6 autoplay: AudioContext.state at load, no gesture = ${ctx.state}`,
  worklet: 'R5 worklet: loading…',
  worklet2: 'R5b worklet via ?worker&url: loading…',
  latency: 'R9 latency: press "Latency test" (10 s)',
  rec: 'R2 rec cost: press "Rec test" (60 s, keep this tab in front)',
  resize: 'R2 resize: press "Resize test" (10 s)',
}
type Section = keyof typeof out
const render = () => (pre.textContent = Object.values(out).join('\n\n'))
const put = (k: Section, s: string, append = false) => {
  out[k] = append ? `${out[k]}\n${s}` : s
  render()
}
render()

function size() {
  const { clientWidth: w, clientHeight: h } = document.documentElement
  const W = Math.round(w * devicePixelRatio)
  const H = Math.round(h * devicePixelRatio)
  const fs = document.fullscreenElement ? ' (fullscreen)' : ''
  return { W, H, line: `R1 size: ${w}×${h} css × dpr ${devicePixelRatio} = ${W}×${H} px${fs}` }
}
const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
const ms = (x: number) => `${x.toFixed(2)} ms`
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`
const heap = () => {
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  return m ? mb(m.usedJSHeapSize) : 'n/a'
}
const sleep = (t: number) => new Promise((r) => setTimeout(r, t))

// R5 + R9: worklet that imports an npm dep and a local TS helper, then reports currentTime.
let samples: number[] | null = null
ctx.audioWorklet.addModule(new URL('./probe.worklet.ts', import.meta.url)).then(
  () => {
    const node = new AudioWorkletNode(ctx, 'probe')
    node.connect(ctx.destination)
    node.onprocessorerror = () => put('worklet', 'R5 worklet: processor error', true)
    node.port.onmessage = ({ data }) => {
      if (data.loaded) put('worklet', `R5 worklet: OK, ${data.loaded}`)
      else if (samples) {
        const ot = ctx.getOutputTimestamp()
        samples.push(performance.now() - (ot.performanceTime! + (data.ctxTime - ot.contextTime!) * 1000))
      }
    }
    put('worklet', 'R5 worklet: addModule OK (processor reports once audio runs, see "Latency test")')
  },
  (e) => put('worklet', `R5 worklet: FAIL, ${e}`),
)
// R5b (drift, see plan S1.2): `vite build` ships the new URL() form above as raw TS; this is Vite's
// bundled-worker path for the same file. Own context, because one scope can't register 'probe' twice.
new AudioContext().audioWorklet.addModule(workletUrl).then(
  () => put('worklet2', `R5b worklet via ?worker&url: addModule OK (${workletUrl})`),
  (e) => put('worklet2', `R5b worklet via ?worker&url: FAIL, ${e}`),
)

async function latency() {
  await ctx.resume()
  const s: number[] = []
  samples = s
  put('latency', 'R9 latency: collecting for 10 s…')
  await sleep(10_000)
  samples = null
  s.sort((a, b) => a - b)
  const lat = s.length ? `median ${ms(pct(s, 0.5))}, p95 ${ms(pct(s, 0.95))}, n = ${s.length}` : 'no messages from the worklet'
  put(
    'latency',
    `R9 latency (worklet currentTime → main receipt): ${lat}\n` +
      `  baseLatency ${ms(ctx.baseLatency * 1000)}, outputLatency ${ms(ctx.outputLatency * 1000)}, sampleRate ${ctx.sampleRate}`,
  )
}

// R2: GPU-loaded canvas, plain vs recorded.
function gpu() {
  if (!gl) throw new Error('no WebGL2')
  const p = gl.createProgram()
  for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    gl.attachShader(p, s)
  }
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`shader: ${gl.getProgramInfoLog(p)}`)
  gl.useProgram(p)
  const t = gl.getUniformLocation(p, 't')
  return (now: number) => {
    gl.viewport(0, 0, stage.width, stage.height)
    gl.uniform1f(t, now / 1000)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

function run(draw: (now: number) => void, duration: number) {
  return new Promise<number[]>((done) => {
    const deltas: number[] = []
    let prev = 0
    let end = 0
    const tick = (now: number) => {
      if (prev) deltas.push(now - prev)
      else end = now + duration
      prev = now
      draw(now)
      if (now < end) requestAnimationFrame(tick)
      else done(deltas)
    }
    requestAnimationFrame(tick)
  })
}

const frames = (d: number[]) => {
  const m = pct([...d].sort((a, b) => a - b), 0.5)
  return `median rAF ${ms(m)}, ${d.filter((x) => x > 1.5 * m).length}/${d.length} frames > 1.5× median`
}

function record() {
  const video = stage.captureStream()
  const rec = new MediaRecorder(new MediaStream([...video.getTracks(), ...silent.stream.getTracks()]), {
    mimeType: REC_TYPE,
    videoBitsPerSecond: 12e6,
  })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => chunks.push(e.data)
  // Settles even if the recorder errors or stops by itself (e.g. codec level too low for the size).
  const stopped = new Promise<Blob>((done, fail) => {
    rec.onerror = (e) => fail(new Error(`MediaRecorder: ${(e as Event & { error?: unknown }).error ?? e.type}`))
    rec.onstop = () => {
      video.getTracks().forEach((t) => t.stop())
      done(new Blob(chunks, { type: rec.mimeType }))
    }
  })
  stopped.catch(() => {}) // reported where the caller awaits it
  rec.start() // no timeslice
  return () => {
    if (rec.state !== 'inactive') rec.stop()
    return stopped
  }
}

async function recTest() {
  await ctx.resume()
  const draw = gpu()
  const { W, H } = size()
  put('rec', `R2 rec cost: ${REC_TYPE}, 12 Mbps, base ${W}×${H}, 15 s per phase`)
  for (const [label, w, h] of [['½ base', W >> 1, H >> 1], ['full base', W, H]] as const) {
    stage.width = w
    stage.height = h
    put('rec', `  ${label} ${w}×${h} plain: ${frames(await run(draw, 15_000))}`, true)
    const before = heap()
    const stop = record()
    const d = await run(draw, 15_000)
    const blob = await stop()
    put('rec', `  ${label} ${w}×${h} +rec:  ${frames(d)}; heap ${before} → ${heap()}; blob ${mb(blob.size)}`, true)
  }
}

async function resizeTest() {
  await ctx.resume()
  const draw = gpu()
  const { W, H } = size()
  put('resize', 'R2 resize: recording for 10 s…')
  stage.width = W >> 1
  stage.height = H >> 1
  const stop = record()
  await run(draw, 5_000)
  stage.width = W
  stage.height = H
  await run(draw, 5_000)
  const blob = await stop()
  const name = `resize-test.${REC_TYPE?.startsWith('video/mp4') ? 'mp4' : 'webm'}`
  bar.append(Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name, textContent: `Download ${name}` }))
  put(
    'resize',
    `R2 resize: ${W >> 1}×${H >> 1} for 5 s, then ${W}×${H} for 5 s; ${REC_TYPE}; blob ${mb(blob.size)}\n` +
      '  QuickTime (fill in): plays to the end? picture OK after the resize?',
  )
}

let busy = false
const test = (k: Section, fn: () => Promise<void>) => async () => {
  if (busy) return
  busy = true
  try {
    await fn()
  } catch (e) {
    put(k, `  ERROR: ${e}`, true)
  } finally {
    busy = false
  }
}
const button = (label: string, onclick: () => unknown) =>
  bar.appendChild(Object.assign(document.createElement('button'), { textContent: label, onclick }))

const copy = button('Copy output', () =>
  navigator.clipboard.writeText(pre.textContent ?? '').then(() => (copy.textContent = 'Copied ✓')),
)
button('Fullscreen', () => document.documentElement.requestFullscreen())
button('Latency test', test('latency', latency))
button('Rec test', test('rec', recTest))
button('Resize test', test('resize', resizeTest))
document.addEventListener('fullscreenchange', () => put('size', size().line, true))
