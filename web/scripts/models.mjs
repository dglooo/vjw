// postinstall (plan_camera S0.2, design D7): self-host MediaPipe so the page touches localhost only.
// The WASM comes from the installed @mediapipe/tasks-vision (fs.cpSync); the model files come from
// MediaPipe's storage, the URLs the official docs list (their sizes were verified in research_camera.md §1).
// Both copies land in git-ignored dirs; S0.4's arms add their models to MODELS.
import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// [file, url]
const MODELS = [
  [
    'selfie_segmenter_landscape.tflite',
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
  ],
]

const wasm = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
if (!existsSync(wasm)) throw new Error('models.mjs: @mediapipe/tasks-vision not installed — run npm install first')
cpSync(wasm, join(root, 'public/mediapipe'), { recursive: true })

const dir = join(root, 'public/models')
mkdirSync(dir, { recursive: true })
for (const [file, url] of MODELS) {
  const dest = join(dir, file)
  if (existsSync(dest)) {
    console.log(`models.mjs: ${file} already present, skipping the download`)
    continue
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`models.mjs: GET ${url} → ${res.status}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  console.log(`models.mjs: downloaded ${file} (${statSync(dest).size} B)`)
}
