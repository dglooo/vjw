import { describe, expect, test } from 'vitest'
import { CODE_MAX } from './doc'
import { checkExport, checkPush, localOrigin, readShader, safeName, SHADER_MAX, writeShader } from './shaderfile'

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
