// Copies every ISF-Files *.fs into public/isf-sweep/ (git-ignored) and writes index.json, `[{ name, vs }]`, for
// ?bench&sweep (plan S2.2). `vs`: a sibling .vs exists, i.e. a custom vertex shader we don't run.
// Run: node scripts/isf-sweep.mjs [ISF-Files dir]   (or ISF_FILES=<dir>; default: the main checkout's donor/)
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = process.argv[2] ?? process.env.ISF_FILES ?? '/Users/shaixee/Codered/Veejay-Wizard/donor/ISF-Files'
const out = fileURLToPath(new URL('../public/isf-sweep/', import.meta.url))
mkdirSync(out, { recursive: true })
const files = readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.fs')) // all in ISF/: no name clashes
for (const f of files) copyFileSync(join(dir, f), join(out, basename(f)))
const index = files.map((f) => ({ name: basename(f), vs: existsSync(join(dir, `${f.slice(0, -3)}.vs`)) }))
writeFileSync(join(out, 'index.json'), JSON.stringify(index))
console.log(`${files.length} .fs (${index.filter((x) => x.vs).length} with a .vs) → ${out}`)
