import { describe, expect, test } from 'vitest'
import { CODE_MAX } from './doc'
import { aiSettings, answerAsk, checkExport, checkPush, localOrigin, newRoom, readShader, roomCode, safeName, SHADER_MAX, writeShader } from './shaderfile'

const CODE = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n    fragColor = vec4(0.5);\n}\n'

describe('safeName', () => {
  test('keeps [A-Za-z0-9 _-] only: no dots, slashes or anything that leaves the folder', () => {
    expect(safeName('Neon tunnel_v2-b')).toBe('Neon tunnel_v2-b')
    expect(safeName('../../etc/passwd')).toBe('etcpasswd')
    expect(safeName('a/b\\c.glsl')).toBe('abcglsl')
    expect(safeName('  Неон  tunnel \n x ')).toBe('tunnel x') // Cyrillic is dropped, spaces squeezed
    expect(safeName('Неон')).toBe('')
    expect(safeName('x'.repeat(100))).toHaveLength(64)
  })
})

describe('writeShader / readShader', () => {
  const meta = { name: 'Neon tunnel', author: 'AI' as const, date: '2026-11-20T14:03:00.000Z', source: 'Toy plasma' }

  test('the header round-trips with the code as it was', () => {
    const file = writeShader(CODE, meta)
    expect(file.split('\n').slice(0, 6)).toEqual(['// VeeJay Wizard shader', '// Name: Neon tunnel', '// Author: AI', '// Date: 2026-11-20T14:03:00.000Z', '// Source: Toy plasma', ''])
    expect(readShader(file)).toEqual({ code: CODE, meta: { name: 'Neon tunnel', author: 'AI', date: '2026-11-20T14:03:00.000Z', source: 'Toy plasma' } })
  })

  test('no source, no Source line; a re-export of an import keeps one header', () => {
    const file = writeShader(CODE, { ...meta, source: undefined })
    expect(file).not.toContain('Source')
    const again = writeShader(file, { ...meta, author: 'user' })
    expect(again.match(/VeeJay Wizard shader/g)).toHaveLength(1)
    expect(readShader(again)).toEqual({ code: CODE, meta: { name: 'Neon tunnel', author: 'user', date: meta.date, source: 'Toy plasma' } })
  })

  test('a field stays on its line: a newline in a name cannot add code', () => {
    const file = writeShader(CODE, { ...meta, name: 'a\n}\nvoid evil() {' })
    expect(readShader(file).code).toBe(CODE)
    expect(readShader(file).meta.name).toBe('a } void evil() {')
  })

  test('a file without our header is all code; CRLF reads as LF', () => {
    expect(readShader(CODE)).toEqual({ code: CODE, meta: {} })
    expect(readShader('// VeeJay Wizard shader\n// not a field\n\nx')).toEqual({ code: '// VeeJay Wizard shader\n// not a field\n\nx', meta: {} })
    expect(readShader(writeShader(CODE, meta).replace(/\n/g, '\r\n')).code).toBe(CODE)
  })
})

describe('the AI channel checks (vite.config.ts)', () => {
  test('the code limit is a toy code limit (doc.ts)', () => expect(SHADER_MAX).toBe(CODE_MAX))

  test('push: a JSON object with GLSL text of 1 to SHADER_MAX chars, an optional string name', () => {
    expect(checkPush({ code: CODE })).toEqual({ code: CODE, name: undefined })
    expect(checkPush({ code: CODE, name: 'x' })).toEqual({ code: CODE, name: 'x' })
    expect(checkPush({ code: 'x'.repeat(SHADER_MAX) })).not.toBeTypeOf('string')
    expect(checkPush({ code: 'x'.repeat(SHADER_MAX + 1) })).toBe(`code: ${SHADER_MAX + 1} chars, at most ${SHADER_MAX}`)
    for (const bad of [null, [], 'code', 42, {}, { code: '' }, { code: '  \n' }, { code: 1 }, { code: CODE, name: 3 }]) expect(checkPush(bad)).toBeTypeOf('string')
    expect(checkPush({ code: 'void main() {}\0' })).toBe('code: not plain text (control characters)')
    expect(checkPush({ code: '\tx\r\n' })).not.toBeTypeOf('string')
  })

  test('export: a name that keeps a letter or digit; overwrite only when true', () => {
    expect(checkExport({ name: ' Neon/../tunnel ' })).toEqual({ name: 'Neon/../tunnel', file: 'Neontunnel', overwrite: false })
    expect(checkExport({ name: 'a', overwrite: true })).toEqual({ name: 'a', file: 'a', overwrite: true })
    expect(checkExport({ name: 'a', overwrite: 'yes' })).toMatchObject({ overwrite: false })
    for (const bad of [null, { name: '' }, { name: '../..' }, { name: 'Неон' }, { name: 5 }]) expect(checkExport(bad)).toBeTypeOf('string')
  })

  test('origin: none (a CLI) or this machine; another site is refused', () => {
    for (const ok of [undefined, 'http://localhost:5173', 'http://127.0.0.1:5177', 'http://[::1]:5173', 'https://localhost']) expect(localOrigin(ok)).toBe(true)
    for (const no of ['https://evil.com', 'http://localhost.evil.com', 'http://evil.com/?http://localhost:5173', 'null', '']) expect(localOrigin(no)).toBe(false)
  })
})

describe('answerAsk: the open editor answers the dev server and the remote relay alike', () => {
  /** A fake editor: what it was asked, in order. */
  const editor = () => {
    const did: unknown[][] = []
    return {
      did,
      state: () => (did.push(['state']), { ok: true, code: CODE }),
      push: async (code: string, name?: string) => (did.push(['push', code, name]), { ok: true, status: 'Playing' }),
      export: (name: string) => (did.push(['export', name]), { ok: true, file: `${name}.glsl` }),
    }
  }

  test('each ask to its handler, the answer under its id', async () => {
    const ed = editor()
    expect(await answerAsk({ id: 1, what: 'state' }, ed)).toEqual({ id: 1, ok: true, code: CODE })
    expect(await answerAsk({ id: 2, what: 'push', code: CODE, name: 'Rings' }, ed)).toEqual({ id: 2, ok: true, status: 'Playing' })
    expect(await answerAsk({ id: 3, what: 'export', name: ' Neon tunnel ', overwrite: true }, ed)).toEqual({ id: 3, ok: true, file: 'Neon tunnel.glsl' })
    expect(ed.did).toEqual([['state'], ['push', CODE, 'Rings'], ['export', 'Neon tunnel']])
  })

  test('a bad ask answers its error under its id and runs nothing; a handler that throws still answers', async () => {
    const ed = editor()
    expect(await answerAsk({ id: 4, what: 'push', code: '' }, ed)).toEqual({ id: 4, ok: false, error: 'code: not a non-empty string' })
    expect(await answerAsk({ id: 5, what: 'push', code: 'x'.repeat(SHADER_MAX + 1) }, ed)).toMatchObject({ id: 5, ok: false })
    expect(await answerAsk({ id: 6, what: 'export', name: '../..' }, ed)).toMatchObject({ id: 6, ok: false })
    expect(await answerAsk({ id: 7, what: 'eval' }, ed)).toEqual({ id: 7, ok: false, error: 'what: push, state or export, not eval' })
    expect(await answerAsk('not an ask', ed)).toMatchObject({ ok: false })
    expect(ed.did).toEqual([])
    const boom = () => {
      throw new Error('boom')
    }
    expect(await answerAsk({ id: 8, what: 'state' }, { ...ed, state: boom })).toEqual({ id: 8, ok: false, error: 'Error: boom' })
    expect(await answerAsk({ id: 9, what: 'push', code: CODE }, { ...ed, push: async () => boom() })).toEqual({ id: 9, ok: false, error: 'Error: boom' })
  })
})

describe('the Remote AI room (Shader.tsx, deploy/ai-relay.mjs)', () => {
  test('roomCode: 1 to 16 of a–z 0–9, case folded and trimmed; anything else is null', () => {
    expect(['main', ' Ab12 ', 'x7k2p', 'z'.repeat(16)].map(roomCode)).toEqual(['main', 'ab12', 'x7k2p', 'z'.repeat(16)])
    for (const bad of ['', '  ', 'a b', 'a_b', 'a-b', '../x', 'ü', 'z'.repeat(17), 'a\nb']) expect(roomCode(bad), bad).toBeNull()
  })

  test('newRoom: 5 characters with no 0 o 1 i l, a valid code; rand picks them', () => {
    expect(newRoom(() => 0)).toBe('aaaaa')
    expect(newRoom(() => 0.9999)).toBe('99999')
    const seen = new Set(Array.from({ length: 200 }, () => newRoom()))
    expect(seen.size).toBeGreaterThan(190) // ≈ 29 M codes: two friends never draw one
    for (const r of seen) expect([r, roomCode(r)]).toEqual([expect.stringMatching(/^[a-hjkmnp-z2-9]{5}$/), r])
  })

  test('aiSettings: { token, room } as stored; a token without a room (before rooms) gets one; no token, no room yet', () => {
    const rand = () => 0.5 // 's' each (ROOM_ABC[15])
    expect(aiSettings('{"token":"abc","room":"Red"}', rand)).toEqual({ token: 'abc', room: 'red' })
    expect(aiSettings('0f3a9c', rand)).toEqual({ token: '0f3a9c', room: 'sssss' }) // the old vjw.ai: the token itself
    expect(aiSettings('123456', rand)).toEqual({ token: '123456', room: 'sssss' }) // a digits-only token parses as a number
    expect(aiSettings(null, rand)).toEqual({ token: '', room: '' }) // the first Connect makes it
    expect(aiSettings('{"token":"","room":""}', rand)).toEqual({ token: '', room: '' })
    expect(aiSettings('{"token":"abc","room":"a b"}', rand)).toEqual({ token: 'abc', room: 'sssss' })
    expect(aiSettings('{"room":"blue","token":7}', rand)).toEqual({ token: '', room: 'blue' })
  })
})
