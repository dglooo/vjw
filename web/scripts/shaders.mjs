// Prints the per-file tables of THIRD_PARTY.md "Shaders" (plan S7.1): one row for every file under src/fx/{isf,own,transitions},
// read from its header. Run: node scripts/shaders.mjs
import { readdirSync, readFileSync } from 'node:fs'

const fx = new URL('../src/fx/', import.meta.url)
const grab = (src, re) => src.match(re)?.[1].trim()
// Library code inlined into our own files, spotted by the library's own header line (the file keeps that header);
// for adapted lines, by the donor file's name in the credit comment.
const INLINE = [
  [/Copyright \(C\) 2011 Ashima Arts/, 'webgl-noise snoise (Ian McEwan, Ashima Arts)', 'https://github.com/ashima/webgl-noise', 'MIT (webgl-noise)'],
  [/Copyright \(c\) 2016 Stefan Gustavson/, 'webgl-noise srdnoise (Stefan Gustavson)', 'https://github.com/stegu/webgl-noise', 'MIT (webgl-noise)'],
  [/SPDX-License-Identifier: MIT OR CC-BY-NC-4\.0/, 'hg_sdf (Mercury)', 'https://mercury.sexy/hg_sdf/hg_sdf.glsl', 'MIT (hg_sdf, its MIT option)'],
  [/github\.com\/v002\/v002-Optical-Flow/, 'Optical Flow Generator (VIDVOX / v002 / Andrew Benson)', 'https://github.com/Vidvox/ISF-Files', 'MIT (ISF-Files)'],
  [/FFT Color Lines/, 'FFT Color Lines and FFT Filled Waveform (VIDVOX)', 'https://github.com/Vidvox/ISF-Files', 'MIT (ISF-Files)'],
  [/Triangle Mosaic/, 'Triangle Mosaic (VIDVOX)', 'https://github.com/Vidvox/ISF-Files', 'MIT (ISF-Files)'],
  [/Use the code however you wish/, "Stars2D and PolkaDot2D from Brian Sharpe's Wombat", 'https://github.com/BrianSharpe', 'Wombat permissive ("use the code however you wish, credit"; no licence file in the in-repo TD extract; personal use)'],
]

for (const dir of ['isf', 'own', 'transitions']) {
  const files = readdirSync(new URL(`${dir}/`, fx)).sort()
  console.log(`\n### ${dir} (${files.length})\n\n| path | author | source | license |\n|---|---|---|---|`)
  for (const f of files) {
    const src = readFileSync(new URL(`${dir}/${f}`, fx), 'utf8')
    const ours = src.startsWith('// VeeJay Wizard') // our own header line; every third-party file starts with `// Source:`
    const inl = INLINE.filter(([re]) => re.test(src))
    const author = ours ? ['VeeJay Wizard (own)', ...inl.map((i) => i[1])].join(' + ') : grab(src, /^\/\/ Author: (.+)$/m) ?? grab(src, /"CREDIT"\s*:\s*"(?:by )?([^"]+)"/)
    const source = ours ? inl.map((i) => i[2]).join(' ') || '-' : grab(src, /generated from (\S+)/) ?? grab(src, /^\/\/ Source: (\S+)/m)
    const license = ours ? ['MIT (own)', ...inl.map((i) => i[3])].join(', ') : grab(src, /^\/\/ License: (.+)$/m) ?? grab(src, /^\/\/ Source: .*· (.+)$/m)
    if (!author || !source || !license) throw new Error(`${dir}/${f}: the header gives no author, source or license`)
    console.log(`| \`${dir}/${f}\` | ${author} | ${source} | ${license} |`)
  }
}
