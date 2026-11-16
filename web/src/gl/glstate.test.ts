import { describe, expect, it } from 'vitest'
import { diff, glState, label, restore } from './glstate'

/** A fake context: every enum is its own name, so `TEXTURE0 + 3` is the key 'TEXTURE03'. State is a flat record; the
 *  setters glState/restore need for the checked fields write it, every other method is a no-op. */
function fakeGl() {
  const st: Record<string, unknown> = { ACTIVE_TEXTURE: 'TEXTURE00', VIEWPORT: [0, 0, 8, 8] }
  const unitKey = (pname: string) => `${st.ACTIVE_TEXTURE}:${pname}`
  const impl: Record<string, (...a: never[]) => unknown> = {
    getParameter: (p: string) => (p.startsWith('TEXTURE_BINDING') || p === 'SAMPLER_BINDING' ? (st[unitKey(p)] ?? null) : (st[p] ?? 0)),
    getIndexedParameter: () => null,
    isEnabled: (c: string) => !!st[`en:${c}`],
    enable: (c: string) => (st[`en:${c}`] = true),
    disable: (c: string) => (st[`en:${c}`] = false),
    activeTexture: (u: string) => (st.ACTIVE_TEXTURE = u),
    bindTexture: (t: string, x: unknown) => (st[unitKey(`TEXTURE_BINDING_${t.replace('TEXTURE_', '')}`)] = x),
    viewport: (...v: number[]) => (st.VIEWPORT = v),
    pixelStorei: (p: string, v: number) => (st[p] = v),
  }
  return new Proxy({}, { get: (_, k: string) => impl[k] ?? (/^[A-Z0-9_]+$/.test(k) ? k : () => {}) }) as unknown as WebGL2RenderingContext
}

describe('glstate (S1-T instrument 1)', () => {
  it('I-GL1 diff keys are exact: identical snapshots give {}; a changed CULL_FACE or pixel-store field reports exactly it', () => {
    const gl = fakeGl()
    const a = glState(gl)
    expect(diff(a, glState(gl))).toEqual({})
    gl.enable(gl.CULL_FACE)
    expect(Object.keys(diff(a, glState(gl)))).toEqual(['CULL_FACE'])
    gl.disable(gl.CULL_FACE)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    expect(Object.keys(diff(a, glState(gl)))).toEqual(['UNPACK_ALIGNMENT'])
  })

  it('reports a mutation (line 0: an enabled cap, a texture left on a unit) and restore() undoes it', () => {
    const gl = fakeGl()
    const a = glState(gl)
    gl.enable(gl.CULL_FACE)
    gl.activeTexture(gl.TEXTURE0 + 3)
    gl.bindTexture(gl.TEXTURE_2D, {} as WebGLTexture)
    gl.viewport(0, 0, 4, 4)
    const d = diff(a, glState(gl))
    expect(Object.keys(d).sort()).toEqual(['ACTIVE_TEXTURE', 'CULL_FACE', 'VIEWPORT', 'unit3.TEXTURE_2D'])
    restore(gl, a)
    expect(diff(a, glState(gl))).toEqual({})
  })

  it('reads the units without moving ACTIVE_TEXTURE; a partial restore keeps it too', () => {
    const gl = fakeGl()
    gl.activeTexture(gl.TEXTURE0 + 5)
    const a = glState(gl, ['unit2.TEXTURE_2D'])
    expect(gl.getParameter(gl.ACTIVE_TEXTURE)).toBe('TEXTURE05')
    restore(gl, a)
    expect(gl.getParameter(gl.ACTIVE_TEXTURE)).toBe('TEXTURE05')
  })

  it('labels GL objects by identity, values as they are', () => {
    const t = new (class WebGLTexture {})()
    expect(label(t)).toBe(label(t))
    expect(label(t)).toMatch(/^WebGLTexture#\d+$/)
    expect(label([1, 2])).toEqual([1, 2])
    expect(label(null)).toBe(null)
  })
})
