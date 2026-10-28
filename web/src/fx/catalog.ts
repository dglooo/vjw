// Every effect by id: the bundled ISF files (`isf/<file stem>`) and the natives. A file that fails to parse is logged
// and skipped, so one bad file never breaks the show.
import { tunnel } from '../scenes/tunnel'
import { parseIsf } from './isf'
import type { EffectDef } from './types'

const files = import.meta.glob('./isf/*.fs', { query: '?raw', import: 'default', eager: true })

export const catalog = new Map<string, EffectDef>([[tunnel.id, tunnel]])
for (const [path, src] of Object.entries(files)) {
  const id = `isf/${path.slice('./isf/'.length, -'.fs'.length)}`
  try {
    catalog.set(id, parseIsf(src, id))
  } catch (e) {
    console.error(e)
  }
}
