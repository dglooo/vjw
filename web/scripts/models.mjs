// postinstall (plan_camera S0.2, design D7): self-host MediaPipe so the page touches localhost only.
// The WASM comes from the installed @mediapipe/tasks-vision (fs.cpSync); the model files come from
// MediaPipe's storage, the URLs the official docs list (the segmenter sizes were verified in
// research_camera.md §1; the pose URLs/sizes on the pose-landmarker docs page). New probe models go in MODELS.
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
  [
    'selfie_segmenter.tflite',
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  ],
  [
    'selfie_multiclass_256x256.tflite',
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
  ],
  [
    'deeplab_v3.tflite',
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/latest/deeplab_v3.tflite',
  ],
  [
    'pose_landmarker_lite.task',
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  ],
  [
    'pose_landmarker_full.task',
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
  ],
  // RVM (plan S0.5): the official fp16 ONNX from the release page (GPL-3.0, recorded in THIRD_PARTY.md;
  // size 7,503,483 B per research_camera.md §1).
  [
    'rvm_mobilenetv3_fp16.onnx',
    'https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp16.onnx',
  ],
]

const wasm = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
if (!existsSync(wasm)) throw new Error('models.mjs: @mediapipe/tasks-vision not installed — run npm install first')
cpSync(wasm, join(root, 'public/mediapipe'), { recursive: true })

// ORT-Web self-host (plan S0.5, D7): the WebGPU build's wasm binary (the asyncify variant) so the page
// touches localhost only. The emscripten JS glue is inlined in the bundle — only the .wasm is fetched
// (rvm.ts sets wasmPaths = { wasm } precisely so ORT takes that path, not the .mjs import()).
const ortWasm = join(root, 'node_modules/onnxruntime-web/dist')
if (!existsSync(ortWasm)) throw new Error('models.mjs: onnxruntime-web not installed — run npm install first')
cpSync(join(ortWasm, 'ort-wasm-simd-threaded.asyncify.wasm'), join(root, 'public/ort', 'ort-wasm-simd-threaded.asyncify.wasm'))

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
