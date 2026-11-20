// GPU3D LR-7: live.ts's direct path skips a straight-alpha generator, and every other catalog entry keeps it (R5).
import { expect, test, vi } from 'vitest'
import { catalog } from '../fx/catalog'
import { straight } from './scene'

vi.mock('./engine', () => ({ fullscreenProgram: () => () => {}, program: () => ({}), renderTarget: () => ({ fit() {} }), gl: {} })) // the natives take the page's canvas + WebGL at import
vi.mock('butterchurn', () => ({ default: {} })) // reads window at import; milk/* stay in the catalog
vi.mock('../audio/input', () => ({ analyser: {}, ctx: {} })) // reads location at import
vi.mock('twgl.js', async (real: () => Promise<object>) => ({ ...(await real()), createTexture: () => ({}) })) // milkdrop's shared texture, at import

test('LR-7 the direct path skips a straight-alpha generator (native/model, native/text) and stays for every other native and shader (R5)', () => {
  const defs = [...catalog.values()]
  expect(defs.filter((d) => 'create' in d).length).toBeGreaterThan(20) // the natives are really there
  expect(defs.filter(straight).map((d) => d.id)).toEqual(['native/model', 'native/text'])
})
