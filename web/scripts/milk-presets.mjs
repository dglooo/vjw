// Copies MilkDrop presets out of butterchurn-presets (plan S2.1, design C1) into src/milkdrop/presets/<slug>.json =
// { name, author, url, license, preset }. JSON has no comment header, so these fields carry the spec §6 credit. Prints
// the `| slug | name | author | license |` rows for THIRD_PARTY.md. Run: node scripts/milk-presets.mjs "<preset name>"…
import { readFileSync, writeFileSync } from 'node:fs'

const converted = new URL('../node_modules/butterchurn-presets/presets/converted/', import.meta.url)
// The installed package.json has no `repository` field; this is the repo research_donor_milkdrop.md §5 cites.
const url = 'https://github.com/jberg/butterchurn-presets'
const license = 'content unknown (preset author); packaging MIT (butterchurn-presets, Jordan Berg)'

console.log('| slug | name | author | license |\n|---|---|---|---|')
for (const name of process.argv.slice(2)) {
  const preset = JSON.parse(readFileSync(new URL(`${encodeURIComponent(name)}.json`, converted), 'utf8'))
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const author = name.split(' - ')[0] // MilkDrop's "author - title"; a `+` list stays whole; no ` - ` → the whole name
  const file = new URL(`../src/milkdrop/presets/${slug}.json`, import.meta.url)
  writeFileSync(file, JSON.stringify({ name, author, url, license, preset }, null, 2) + '\n')
  console.log(`| \`${slug}\` | ${name} | ${author} | ${license} |`)
}
