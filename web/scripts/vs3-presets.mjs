// The vs3 factory presets of every scene we have → web/src/vs3/presets.json, their thumbs → web/public/vs3/thumbs/presets/
// (user 2026-11-20: presets «как у них»; 2026-11-21: all of them). Reads the friends' FACTORY_PRESETS table in
// donor/vs3/visual_system_3/renderer/main.js AS TEXT (the literal turned into JSON, never evaluated) and maps each
// preset's palette and its scene's rows (mode, model, sliders, checkboxes) onto our inputs (vs3/params.json + the palette
// select). The post chain and the macros have no input here (the post-chain epic): dropped and counted, as is a custom
// palette (the preset then leaves the palette as it is). A preset whose look needs what we lack (no native, a scene row
// with no input, a logo or a scene on the LED wall) is dropped whole, with its reason, and so is one that would be
// another's twin here. The thumbs are the donor's jpgs (vendor/thumbs/presets/index.json names them), copied under
// their own file names.
// usage (cwd web/): node scripts/vs3-presets.mjs [path/to/main.js]
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const SRC = process.argv[2] ?? '../donor/vs3/visual_system_3/renderer/main.js'
const THUMBS = join(dirname(SRC), 'vendor/thumbs/presets'), OUT = 'public/vs3/thumbs/presets'
const OURS = { 'main stage': 'lasers', 'morphogen 2.0': 'morphogen2', 'limitless 3d': 'limitless3d' } // donor scene name → our native's (vs3/host.ts), where they differ
const params = JSON.parse(readFileSync('src/vs3/params.json', 'utf8'))
const palettes = [...readFileSync('src/vs3/kit/lib/palette.js', 'utf8').matchAll(/\{ name: '([\w-]+)',\s+colors/g)].map((m) => m[1])
if (palettes.length !== 24) throw new Error(`palette.js: ${palettes.length} palettes, expected 24`)
// The LED wall's stops (laser-stage.js LASER_SCREENS, by the `screen` slider): ours draws off and the wall's own
// visuals; a logo needs one loaded, a scene there ctx.scenes, empty in our port (rings would show in its place).
const SCREENS = [...readFileSync('src/vs3/kit/lib/laser-stage.js', 'utf8').match(/LASER_SCREENS = Object\.freeze\(\[([^\]]+)\]/)[1].matchAll(/'(\w+)'/g)].map((m) => m[1])
const WALL = new Set(['off', 'rings', 'tunnel', 'bars', 'waves', 'grid'])
const thumbs = JSON.parse(readFileSync(join(THUMBS, 'index.json'), 'utf8'))

// The table literal: from `const FACTORY_PRESETS = {` to its matching brace, strings kept apart while braces count.
const text = readFileSync(SRC, 'utf8')
const at = text.indexOf('const FACTORY_PRESETS = {') + 'const FACTORY_PRESETS = '.length
const parts = text.slice(at).split(/('(?:[^'\\]|\\.)*')/) // odd: a single-quoted string
let depth = 0, end = -1
for (let i = 0; i < parts.length && end < 0; i += 2)
  for (let j = 0; j < parts[i].length; j++) {
    depth += parts[i][j] === '{' ? 1 : parts[i][j] === '}' ? -1 : 0
    if (depth === 0) {
      parts[i] = parts[i].slice(0, j + 1)
      end = i
      break
    }
  }
const json = parts.slice(0, end + 1).map((p, i) =>
  i % 2 ? JSON.stringify(p.slice(1, -1).replace(/\\'/g, "'")) : p.replace(/\/\/.*$/gm, '').replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/,(\s*[}\]])/g, '$1'),
).join('')
const table = JSON.parse(json)

const out = {}, dropped = {}, gone = []
const drop = (k) => (dropped[k] = (dropped[k] ?? 0) + 1)
// Scene rows with no look while at these values, so no input needs them: morphogen 2.0's legacy cream flag (the scene
// turns it into its mode), its logo chip (no logo here) and its regrow / clear buttons' counters.
const IDLE = { cream: false, logo: 0, regrowN: 0, clearN: 0 }
/** The preset's values on our inputs, or why its look cannot be had here. A custom palette (limitless: its own
 *  colours, from the clip it was tuned on) is none of ours: the preset leaves the palette as it is. */
function map(full, p) {
  const name = OURS[p.scene] ?? p.scene, inputs = params[name]
  if (!inputs) return `no vs3 native "${p.scene}" here`
  const values = p.palette === 'custom' ? {} : { palette: palettes.indexOf(p.palette) }
  if (values.palette < 0) return `palette "${p.palette}"`
  for (const [k, v] of Object.entries(p)) {
    if (k === 'post' || k === 'macros') Object.keys(v).forEach((x) => drop(`${k}.${x}`))
    else if (k === 'sceneParams') Object.keys(v).filter((s) => s !== p.scene).forEach((s) => drop(`sceneParams.${s}`))
    else if (k !== 'scene' && (k !== 'palette' || v === 'custom')) drop(k)
  }
  const own = Object.entries(p.sceneParams?.[p.scene] ?? {}).filter(([k, v]) => IDLE[k] !== v), none = own.filter(([k]) => !inputs.some((x) => x.name === k)).map(([k]) => k)
  if (none.length) return `its scene rows ${none.join(', ')} have no input here`
  for (const [k, v] of own) {
    const i = inputs.find((x) => x.name === k)
    values[k] = i.type === 'long' ? i.labels.indexOf(v) : v
    if (i.type === 'long' ? values[k] < 0 : typeof v !== (i.type === 'bool' ? 'boolean' : 'number')) return `${k} ${JSON.stringify(v)}`
  }
  const wall = SCREENS[Math.round(Math.min(1, Math.max(0, values.screen ?? 0)) * (SCREENS.length - 1))]
  if (name === 'lasers' && !WALL.has(wall)) return `the LED wall plays "${wall}", which our port does not draw`
  return { ref: `native/vs3-${name}`, values }
}
rmSync(OUT, { recursive: true, force: true }) // all generated: a preset dropped since takes its thumb along
mkdirSync(OUT, { recursive: true })
for (const [full, p] of Object.entries(table)) {
  const m = map(full, p)
  if (typeof m === 'string') {
    gone.push(`${full}: ${m}`)
    continue
  }
  const name = full.replace(/^★ (.+?)(?: · | — )/, (all, s) => (s === p.scene ? '★ ' : all)), thumb = thumbs[full]
  const list = (out[m.ref] ??= [])
  if (list.some((x) => x.name === name)) throw new Error(`${m.ref}: two presets "${name}"`)
  // An earlier preset the node would then match (presets.ts presetOf, the first wins): the picker would name that one.
  const cur = { ...Object.fromEntries(params[m.ref.slice(11)].map((i) => [i.name, i.default])), ...m.values }
  const twin = list.find((q) => Object.entries(q.values).every(([k, v]) => cur[k] === v))
  if (twin) {
    gone.push(`${full}: the same look here as "${twin.name}" (the two differ in the post chain or the macros only)`)
    continue
  }
  if (thumb) copyFileSync(join(THUMBS, thumb), join(OUT, thumb))
  list.push({ name, values: m.values, ...(thumb && { thumb }) })
}
// Ours: chorus at the hall (formation 1) in sodium, the rest at the scene's defaults: vs3 Chorus Hall's look.
const chorus = Object.fromEntries(params.chorus.map((i) => [i.name, i.default]))
out['native/vs3-chorus'].push({ name: '★ hall', values: { palette: palettes.indexOf('sodium'), ...chorus, shape: 1 } })

const file = `{\n${Object.entries(out).map(([ref, ps]) => `${JSON.stringify(ref)}: [${ps.map((x) => `\n  ${JSON.stringify(x)}`).join(',')}\n]`).join(',\n')}\n}\n`
writeFileSync('src/vs3/presets.json', file)
const n = Object.values(out).flat().length
console.log(`${Object.keys(table).length} in the table → ${n} shipped (${n - 1} theirs + ★ hall), ${gone.length} dropped, ${Object.values(out).flat().filter((x) => x.thumb).length} thumbs`)
console.log(Object.entries(out).map(([ref, ps]) => `${ref.slice(11)} ${ps.length}`).join(' · '))
console.log(`dropped presets:\n  ${gone.join('\n  ')}`)
console.log('dropped fields (field: presets):', JSON.stringify(dropped))
