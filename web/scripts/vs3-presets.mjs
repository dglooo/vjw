// The vs3 factory presets of every scene we have → web/src/vs3/presets.json, their thumbs → web/public/vs3/thumbs/presets/
// (user 2026-11-20: presets «как у них»; 2026-11-21: all of them). Reads the friends' FACTORY_PRESETS table in
// donor/vs3/visual_system_3/renderer/main.js AS TEXT (the literal turned into JSON, never evaluated) and maps each
// preset's palette and its scene's rows (mode, model, sliders, checkboxes) onto our inputs (vs3/params.json + the palette
// select). The post chain and the macros: only LOOK_NOW's presets carry theirs (the keys with an input so far); the rest
// are dropped and counted, as is a custom palette (the preset then leaves the palette as it is). A preset whose look
// needs what we lack (no native, a scene row with no input, a logo or a scene on the LED wall) is dropped whole, with
// its reason, and so is one that would be
// another's twin here. The thumbs are the donor's jpgs (vendor/thumbs/presets/index.json names them), copied under
// their own file names. Also writes web/src/vs3/look.json, the post chain's defaults, ranges and scene rows (the end).
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

// A literal of main.js as JSON: from `const NAME = {` to its matching brace, the comments out first (a comment may hold
// an apostrophe: «tendril's»; a string's `//` stays, the leftmost of the two wins), strings kept apart while braces count.
const text = readFileSync(SRC, 'utf8')
function literal(name) {
  const at = text.indexOf(`const ${name} = {`)
  if (at < 0) throw new Error(`${SRC}: no const ${name}`)
  const parts = text.slice(at + `const ${name} = `.length).replace(/('(?:[^'\\]|\\.)*')|\/\/.*/g, (c, s) => s ?? '').split(/('(?:[^'\\]|\\.)*')/) // odd: a single-quoted string
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
  return JSON.parse(parts.slice(0, end + 1).map((p, i) =>
    i % 2 ? JSON.stringify(p.slice(1, -1).replace(/\\'/g, "'")) : p.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/,(\s*[}\]])/g, '$1'),
  ).join(''))
}
const table = literal('FACTORY_PRESETS')

const out = {}, dropped = {}, gone = []
const drop = (k) => (dropped[k] = (dropped[k] ?? 0) + 1)
// Scene rows with no look while at these values, so no input needs them: morphogen 2.0's legacy cream flag (the scene
// turns it into its mode), its logo chip (no logo here) and its regrow / clear buttons' counters.
const IDLE = { cream: false, logo: 0, regrowN: 0, clearN: 0 }
// plan_vs3_engine S3.3: the one hot preset for the user's check carries its post and macro values, on the look inputs
// shipped so far (vs3/host.ts LOOK_KEYS); S7.1 deletes LOOK_NOW (every preset its whole look).
const LOOK_NOW = {
  keys: ['bloomMul', 'aber', 'vignette', 'brightness', 'mirror', 'tiles', 'twist', 'slice', 'spin', 'persist', 'zoom', 'trails', 'chaos', 'heat', 'react'],
  names: ['★ morphogen 2.0 · magma — Magmatic Eye'],
}
/** The preset's values on our inputs, or why its look cannot be had here. A custom palette (limitless: its own
 *  colours, from the clip it was tuned on) is none of ours: the preset leaves the palette as it is. */
function map(full, p) {
  const name = OURS[p.scene] ?? p.scene, inputs = params[name], hot = LOOK_NOW.names.includes(full)
  if (!inputs) return `no vs3 native "${p.scene}" here`
  const values = p.palette === 'custom' ? {} : { palette: palettes.indexOf(p.palette) }
  if (values.palette < 0) return `palette "${p.palette}"`
  for (const [k, v] of Object.entries(p)) {
    if (k === 'post' || k === 'macros') {
      for (const [x, y] of Object.entries(v))
        if (hot && LOOK_NOW.keys.includes(x)) values[x] = y
        else drop(`${k}.${x}`)
    } else if (k === 'sceneParams') Object.keys(v).filter((s) => s !== p.scene).forEach((s) => drop(`sceneParams.${s}`))
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

// look.json (plan_vs3_engine S2.1): the look's defaults, ranges and per-scene rows, one source for the host and this
// script. vs3: the friends' three.js engine, used with permission (2026-11-19). Values only, read as text from main.js:
// `post` :280-298 (BASE_POST = { ...post }, :299), `macros` :386, POST_RANGES :10602-10606, FX_DEFAULTS :167-274,
// LATE_TRAILS :279, LENS_STYLES :2349 (the lens shader's uStyle order; visual_kit/src/engine/post-shaders.js:288, :462).
const post = literal('post'), LS = literal('LENS_STYLES'), lensStyles = Object.keys(LS).sort((a, b) => LS[a] - LS[b])
if (!text.includes('const BASE_POST = { ...post };')) throw new Error(`${SRC}: BASE_POST is no longer the post literal`)
// The 14 post keys with an input (quality, decay and the layer keys stay out: the epic's non-goals), then the 4 macros.
const POST = ['mirror', 'persist', 'zoom', 'spin', 'bloomMul', 'aber', 'vignette', 'brightness', 'hueDrift', 'lens', 'lensStyle', 'tiles', 'twist', 'slice']
const base = { ...Object.fromEntries(POST.map((k) => [k, post[k]])), lensStyle: lensStyles.indexOf(post.lensStyle), ...literal('macros') }
// The donor has no slider for persist, zoom, bloomMul, aber: each range holds every FX_DEFAULTS and preset value (design
// l. 212, gap G1). The macros run 0..1; lensStyle is an index into lensStyles.
const MORE = { persist: [0, 1], zoom: [0.9, 1.3], bloomMul: [0, 3], aber: [0, 4], lensStyle: [0, lensStyles.length - 1], react: [0, 1], chaos: [0, 1], trails: [0, 1], heat: [0, 1] }
const PR = literal('POST_RANGES'), ranges = Object.fromEntries(Object.keys(base).map((k) => [k, PR[k] ?? MORE[k]]))
ranges.brightness[0] = Math.max(ranges.brightness[0], 1.36) // below base the limiter's stock bound loosens by (base / brightness)²: 6 % at 1.36, the dimmest preset (skeptic planner note 2)
// lensStyle is a name: the donor draws one it lacks ('water', 2 presets) as style 0 (main.js:15886).
for (const [full, p] of Object.entries(table))
  for (const [k, v] of Object.entries({ ...p.post, ...p.macros }))
    if (ranges[k] && k !== 'lensStyle' && (typeof v !== 'number' || !(v >= ranges[k][0] && v <= ranges[k][1]))) throw new Error(`look.json: ${full}: ${k} ${v} outside [${ranges[k]}]`)
const scenes = {}, skipped = [], ours = (s) => OURS[s] ?? s
for (const [s, row] of Object.entries(literal('FX_DEFAULTS')))
  if (params[ours(s)]) scenes[ours(s)] = row
  else skipped.push(s)
scenes['chorus-hall'] = scenes.chorus // chorus with the stage pointer (host.ts): the same scene
const lateTrails = Object.fromEntries(Object.entries(literal('LATE_TRAILS')).map(([s, v]) => [ours(s), v]))
const look = { base, ranges, scenes, lateTrails, lensStyles }
const rows = (o) => (Array.isArray(o) ? JSON.stringify(o) : `{\n  ${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n  ')}\n}`)
writeFileSync('src/vs3/look.json', `{\n${Object.entries(look).map(([k, v]) => `${JSON.stringify(k)}: ${rows(v)}`).join(',\n')}\n}\n`)
console.log(`look.json: ${Object.keys(base).length} keys, ${Object.keys(scenes).length} scene rows (chorus-hall = chorus); no native here for the row of: ${skipped.join(', ')}`)
