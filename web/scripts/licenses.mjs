// Prints the `| name | version | license |` table for THIRD_PARTY.md (plan S6.1). Run: node scripts/licenses.mjs
import { readFileSync } from 'node:fs'

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const { dependencies, devDependencies } = read('../package.json')

console.log('| name | version | license |\n|---|---|---|')
for (const name of Object.keys({ ...dependencies, ...devDependencies }).sort()) {
  const { version, license } = read(`../node_modules/${name}/package.json`)
  console.log(`| ${name} | ${version} | ${license} |`)
}
