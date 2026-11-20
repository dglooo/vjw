// native/text (backlog 6): the title cleanup, the input declaration (+ the built-ins' binds), and the raster's upload
// only on change. The GL and the canvas are fakes: the picture itself is the browser check.
import { expect, test, vi } from 'vitest'
import { bindable } from '../bind'
import type { FrameInput } from '../frame'
import { store } from '../store'
import { BUILTIN } from './builtin'
import { cleanTitle, text } from './text'

vi.mock('../gl/engine', () => ({ fullscreenProgram: () => () => {} })) // takes the page's canvas + WebGL at import

test.each([
  ['1-Kanine-Feel-The-Vibrat-EW6MXW.flac', 'Kanine Feel The Vibrat'],
  ['1-Sili-TRONCE-6WKOXI.flac', 'Sili TRONCE'], // only the last 6-char block is the code
  ['1-Sub-Focus-Elevate--SOTA-Remix--CHJWAE.flac', 'Sub Focus Elevate - SOTA Remix'], // a letters-only code, a "--" run
  ['1-Darude-Sandstorm---Dimension-Remix-V82GVI.flac', 'Darude Sandstorm - Dimension Remix'],
  ['12-Kanine-Release-Me---VIP-M2ICKR.flac', 'Kanine Release Me - VIP'],
  ['1-1991-Full-Send--Pirapus-Remix--IH3T8N.flac', '1991 Full Send - Pirapus Remix'], // the track number only, not 1991
  ['1-Monty-Grind-Mode-SSJ3DH.mp3', 'Monty Grind Mode'],
  ['Bicep - Glue (Kanine Bootleg).wav', 'Bicep - Glue (Kanine Bootleg)'], // spaced: the extension only
  ['Place 2b - Escape.mp3', 'Place 2b - Escape'],
  ['Mr. Oizo - Flat Beat', 'Mr. Oizo - Flat Beat'], // no extension: the dot stays
])('cleanTitle %s', (file, title) => expect(cleanTitle(file)).toBe(title))

test('inputs: the raster-shaping ones and the strings never bound; ⚡ hit the only flash; the built-ins bind declared, bindable inputs', () => {
  const by = new Map(text.inputs.map((i) => [i.name, i]))
  for (const n of ['source', 'text', 'dj', 'font', 'size', 'outline', 'glow']) expect(bindable(by.get(n)!), n).toBe(false)
  for (const n of ['x', 'y', 'rotation', 'pulse', 'glitch', 'hit']) expect(bindable(by.get(n)!), n).toBe(true)
  expect(by.get('text')!.type).toBe('text')
  expect(text.flash).toEqual(['hit'])
  expect(text.alpha).toBe('straight')
  const gens = BUILTIN.filter((d) => d.id.startsWith('builtin:text-')).flatMap((d) => d.layers.map((l) => l.gen)).filter((g) => g.ref === 'native/text')
  expect(gens.length).toBe(2)
  for (const g of gens) {
    for (const k of Object.keys(g.bind ?? {})) expect(by.get(k) && bindable(by.get(k)!), k).toBe(true)
    for (const k of Object.keys(g.values ?? {})) expect(by.has(k), k).toBe(true)
    if (g.bind?.hit) expect(g.bind.hit, 'flashGate rests below its ON line at min 0').toMatchObject({ source: 'kick', attack: 0, min: 0, max: 1 })
  }
})

test('the raster uploads only when the text, font, size step or outline change, never per frame', () => {
  const said: string[] = []
  const ctx = new Proxy({ measureText: () => ({ actualBoundingBoxLeft: 0, actualBoundingBoxRight: 400, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 10 }), fillText: (s: string) => said.push(s) }, {
    get: (o, k) => (k in o ? o[k as keyof typeof o] : () => {}), // fillRect, strokeText …: no-ops
    set: () => true, // font, filter, styles
  })
  vi.stubGlobal('OffscreenCanvas', class { width = 1; height = 1; getContext = () => ctx })
  let uploads = 0
  const gl = new Proxy({ texImage2D: () => uploads++ }, { get: (o, k) => (k in o ? o[k as keyof typeof o] : typeof k === 'string' && /^[A-Z]/.test(k) ? 0 : () => null) })
  const n = text.create(gl as unknown as WebGL2RenderingContext)
  const f = { width: 1920, height: 1080, dt: 1 / 60, audioNow: 1 } as FrameInput
  const v: Record<string, unknown> = { source: 0, text: 'VEEJAY', font: 0, size: 0.12, outline: 0, x: 0.5, y: 0.5, rotation: 0, color: [1, 1, 1, 1], accent: [1, 0, 1, 1], glow: 0.5, pulse: 0, glitch: 0, hit: 0 }
  const frame = (p: Record<string, unknown> = {}) => n.draw(f, Object.assign(v, p) as never)
  frame()
  frame()
  frame({ x: 0.3, y: 0.7, rotation: 20, pulse: 0.2, glitch: 0.5, hit: 1, glow: 2, color: [1, 0, 0, 1] }) // the shader's alone
  expect(uploads).toBe(1)
  frame({ size: 0.125 }) // 135 px: the same 32 px step (160) as 129.6
  expect(uploads).toBe(1)
  frame({ text: 'WIZARD' })
  frame({ font: 2 })
  frame({ outline: 0.05 })
  frame({ size: 0.3 })
  frame()
  expect(uploads).toBe(5)
  store.patch({ source: { kind: 'file', name: '1-Kanine-Feel-The-Vibrat-EW6MXW.flac' } })
  frame({ source: 1 })
  frame()
  expect(uploads).toBe(6)
  expect(said.at(-1)).toBe('Kanine Feel The Vibrat')
  vi.unstubAllGlobals()
})
