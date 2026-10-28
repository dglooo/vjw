// Every effect by id: the bundled ISF files (`isf/<file stem>`), our own (`own/<file stem>`) and the natives. A file
// that fails to parse is logged and skipped, so one bad file never breaks the show.
import { glitch } from '../scenes/glitch'
import { particles } from '../scenes/particles'
import { spectrum } from '../scenes/spectrum'
import { tunnel } from '../scenes/tunnel'
import { parseIsf } from './isf'
import type { EffectDef } from './types'

const files = import.meta.glob(['./isf/*.fs', './own/*.fs'], { query: '?raw', import: 'default', eager: true })

export const catalog = new Map<string, EffectDef>([tunnel, spectrum, particles, glitch].map((d) => [d.id, d] as const))
for (const [path, src] of Object.entries(files)) {
  const id = path.slice('./'.length, -'.fs'.length) // isf/<stem> or own/<stem>
  try {
    catalog.set(id, parseIsf(src, id))
  } catch (e) {
    console.error(e)
  }
}
