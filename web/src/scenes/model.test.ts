// native/model rows (GPU3D plan S4.2+; matrix_gpu3d). M-U6: every shipped model carries recorded CC0 provenance.
import { expect, test } from 'vitest'

const CC0 = 'CC0-1.0' // SPDX id of CC0 1.0 Universal: the only licence a shipped model may carry (matrix ruling G4)

test('M-U6: every .glb / .gltf in public/models has exactly one manifest entry, licence CC0-1.0, an https source', async () => {
  const fsId = 'node:fs' // the app tsconfig has no node types (serpent.test.ts T-F2d)
  const { readdirSync, readFileSync } = (await import(/* @vite-ignore */ fsId)) as { readdirSync(p: URL): string[]; readFileSync(p: URL, e: 'utf8'): string }
  const dir = new URL('../../public/models/', import.meta.url)
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as { file: string; licence: string; source: string }[]
  const models = readdirSync(dir).filter((f) => /\.(glb|gltf)$/i.test(f))
  expect(models.length).toBeGreaterThan(0)
  for (const f of models) {
    const entries = manifest.filter((m) => m.file === f)
    expect(entries, f).toHaveLength(1)
    expect(entries[0].licence, f).toBe(CC0)
    expect(new URL(entries[0].source).protocol, f).toBe('https:')
  }
})
