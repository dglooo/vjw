// The vs3 factory presets of chorus, tendril, vesica and locus → web/src/vs3/presets.json (user 2026-11-20: presets
// «как у них»). Reads the friends' FACTORY_PRESETS table in donor/vs3/visual_system_3/renderer/main.js AS TEXT (the
// literal turned into JSON, never evaluated) and maps each preset's palette, mode and scene params onto our inputs
// (vs3/params.json + the palette select); the post chain, macros and anything else are dropped and counted.
// usage (cwd web/): node scripts/vs3-presets.mjs [path/to/main.js]
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = process.argv[2] ?? '../donor/vs3/visual_system_3/renderer/main.js'
const SCENES = ['chorus', 'tendril', 'vesica', 'locus']
const params = JSON.parse(readFileSync('src/vs3/params.json', 'utf8'))
const palettes = [...readFileSync('src/vs3/kit/lib/palette.js', 'utf8').matchAll(/\{ name: '([\w-]+)',\s+colors/g)].map((m) => m[1])
if (palettes.length !== 24) throw new Error(`palette.js: ${palettes.length} palettes, expected 24`)

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

const out = {}, dropped = {}
const drop = (k) => (dropped[k] = (dropped[k] ?? 0) + 1)
for (const [full, p] of Object.entries(table)) {
  const scene = p.scene
  if (!SCENES.includes(scene)) continue
  const inputs = params[scene], has = new Set(inputs.map((i) => i.name)), modes = inputs.find((i) => i.name === 'mode')?.labels
  const values = { palette: palettes.indexOf(p.palette) }
  if (values.palette < 0) throw new Error(`${full}: palette ${p.palette}`)
  for (const [k, v] of Object.entries(p)) {
    if (k === 'post' || k === 'macros') Object.keys(v).forEach((x) => drop(`${k}.${x}`))
    else if (k === 'sceneParams') Object.keys(v).filter((s) => s !== scene).forEach((s) => drop(`sceneParams.${s}`))
    else if (k !== 'scene' && k !== 'palette') drop(k)
  }
  for (const [k, v] of Object.entries(p.sceneParams?.[scene] ?? {})) {
    if (k === 'mode') {
      values.mode = modes?.indexOf(v) ?? -1
      if (values.mode < 0) throw new Error(`${full}: mode ${v}`)
    } else if (has.has(k) && typeof v === 'number') values[k] = v
    else drop(`sceneParams.${scene}.${k}`)
  }
  ;(out[`native/vs3-${scene}`] ??= []).push({ name: full.replace(new RegExp(`^★ ${scene}(?: · | — )`), '★ '), values })
}
// Ours: chorus at the hall (formation 1) in sodium, the rest at the scene's defaults: vs3 Chorus Hall's look.
const chorus = Object.fromEntries(params.chorus.map((i) => [i.name, i.default]))
out['native/vs3-chorus'].push({ name: '★ hall', values: { palette: palettes.indexOf('sodium'), ...chorus, shape: 1 } })

const file = `{\n${Object.entries(out).map(([ref, ps]) => `${JSON.stringify(ref)}: [${ps.map((x) => `\n  ${JSON.stringify(x)}`).join(',')}\n]`).join(',\n')}\n}\n`
writeFileSync('src/vs3/presets.json', file)
console.log(Object.entries(out).map(([ref, ps]) => `${ref} ${ps.length}`).join(' · '))
console.log('dropped (field: presets):', JSON.stringify(dropped))
