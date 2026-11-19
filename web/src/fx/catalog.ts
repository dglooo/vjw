// Every effect by id: the bundled ISF files (`isf/<file stem>` ported, `own/<file stem>` ours) and the natives. A file
// that fails to parse is logged and skipped, so one bad file never breaks the show.
import { milkdrop } from '../milkdrop/native'
import { calib } from '../scenes/calib'
import { camera, outline } from '../scenes/camera'
import { creatures } from '../scenes/creatures'
import { fluid } from '../scenes/fluid'
import { glitch } from '../scenes/glitch'
import { isobars } from '../scenes/isobars'
import { lasers } from '../scenes/lasers'
import { model } from '../scenes/model'
import { orb } from '../scenes/orb'
import { rgbaDelay, slitScan, timeMachine } from '../scenes/history'
import { particles } from '../scenes/particles'
import { plexus } from '../scenes/plexus'
import { scatter, swarm } from '../scenes/points'
import { scope } from '../scenes/scope'
import { serpent } from '../scenes/serpent'
import { shatter } from '../scenes/shatter'
import { spectrum } from '../scenes/spectrum'
import type { NodeDoc } from '../doc'
import { tunnel } from '../scenes/tunnel'
import { vortex } from '../scenes/vortex'
import { wireform } from '../scenes/wireform'
import { VS3 } from '../vs3/host'
import { wrapToy, wrapTransition } from './glsl'
import { parseIsf } from './isf'
import { parseSyn } from './syn'
import type { EffectDef, ShaderDef } from './types'

const files = import.meta.glob(['./isf/*.fs', './own/*.fs'], { query: '?raw', import: 'default', eager: true })

export const catalog = new Map<string, EffectDef>([tunnel, spectrum, particles, glitch, rgbaDelay, camera, outline, timeMachine, slitScan, swarm, scatter, scope, plexus, creatures, isobars, lasers, serpent, shatter, wireform, vortex, orb, fluid, model, calib, ...milkdrop, ...VS3].map((d) => [d.id, d] as const))
/** Every bundled `.fs` file's raw text by id: the editor library reads its `// Look: TD` header (parseIsf drops it). */
export const rawFs = new Map<string, string>()
for (const [path, src] of Object.entries(files)) {
  const id = path.slice('./'.length, -'.fs'.length) // isf/<stem> or own/<stem>
  rawFs.set(id, src)
  try {
    catalog.set(id, parseIsf(src, id))
  } catch (e) {
    console.error(e)
  }
}

// Donor synScenes (fx/syn.ts): `syn/<stem>`, the preamble excluded.
const synFiles = import.meta.glob(['./syn/*.glsl', '!./syn/preamble.glsl'], { query: '?raw', import: 'default', eager: true })
for (const [path, src] of Object.entries(synFiles)) {
  const id = path.slice('./'.length, -'.glsl'.length)
  try {
    const d = parseSyn(src as string, id)
    if (d.unsupported) throw new Error(`${id}: unsupported: ${d.unsupported}`) // fx/syn.test.ts keeps the bundled ones clean
    catalog.set(id, d)
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

const toys = new Map<string, ShaderDef & { prefixLines: number }>()
/** A pasted Shadertoy node (design E5): its inline code as a generator, memoised by the code. Line n of the paste is
 *  line n + prefixLines of `fs`. Shadertoy's own prefix defines HW_PERFORMANCE (1: a capable GPU), so ours does too. */
export function toyDef(node: NodeDoc) {
  const code = node.code ?? ''
  let def = toys.get(code)
  if (!def) {
    const w = wrapToy(`#define HW_PERFORMANCE 1\n${code}`)
    def = { id: node.ref, name: 'Shadertoy', kind: 'generator', credit: node.credit ?? '', glsl: 300, passes: [{ persistent: false, float: false }], ...w, prefixLines: w.prefixLines + 1 }
    toys.set(code, def)
  }
  return def
}
