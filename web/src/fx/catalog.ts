// Every effect by id: the bundled ISF files (`isf/<file stem>`) and the natives. A file that fails to parse is logged
// and skipped, so one bad file never breaks the show.
import { glitch } from '../scenes/glitch'
import { particles } from '../scenes/particles'
import { spectrum } from '../scenes/spectrum'
import { tunnel } from '../scenes/tunnel'
import { wrapTransition } from './glsl'
import { parseIsf } from './isf'
import type { EffectDef, ShaderDef } from './types'

const files = import.meta.glob('./isf/*.fs', { query: '?raw', import: 'default', eager: true })

export const catalog = new Map<string, EffectDef>([tunnel, spectrum, particles, glitch].map((d) => [d.id, d] as const))
for (const [path, src] of Object.entries(files)) {
  const id = `isf/${path.slice('./isf/'.length, -'.fs'.length)}`
  try {
    catalog.set(id, parseIsf(src, id))
  } catch (e) {
    console.error(e)
  }
}

// Transitions (design E7): a copied gl-transitions file names its Author and becomes `gl/<Name>`; ours `own/<stem>`.
const transitionFiles = import.meta.glob('./transitions/*.glsl', { query: '?raw', import: 'default', eager: true })
export const transitions: readonly string[] = Object.entries(transitionFiles).map(([path, src]) => {
  const name = path.slice('./transitions/'.length, -'.glsl'.length)
  const author = /^\/\/ Author: (.+)$/m.exec(src)?.[1]
  const def: ShaderDef = { id: `${author ? 'gl' : 'own'}/${name}`, name, kind: 'transition', credit: author ?? 'VeeJay Wizard', glsl: 300, passes: [], ...wrapTransition(src) }
  catalog.set(def.id, def)
  return def.id
})
