// The three host (GPU3D S1-T spike; design_gpu3d § Model rev 1, § Host rules rev 1 + rules 2, 4, 6): three r187
// (exactly 0.187.0, MIT) WebGLRenderer on OUR WebGL2 context. Lazy: only scenes/model.ts imports this module, dynamically,
// so a show without a model instance never loads three. It never sizes the canvas (no setSize / setPixelRatio) and
// renders into render targets only, where r187 neither tone-maps nor encodes sRGB (WebGLRenderer.js:2405-2420).
// Every GL-touching call (the constructor, PMREM, compileAsync's synchronous part, the upload render, render, an RT's
// dispose) runs inside guard(): resetState() before it (three's cache is stale: rule 2) and after it, then the restore
// list (rule 1). No uploads after the load: the load's last step renders once (rule 5).
import { AnimationMixer, Box3, HalfFloatType, LinearSRGBColorSpace, MeshStandardMaterial, PerspectiveCamera, PMREMGenerator, Scene, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { diff, glState, KEYS, label, restore } from '../gl/glstate'

/** The harness's switches and records (instrument 1 + 2, line 0, line 4, line 5). */
export interface Spike {
  entry: number // > 0 inside a guard: instrument 2 logs three's calls outside it
  skipCtorReset: boolean // line 0's mutation: no resetState() + restore after the constructor
  diff: boolean // instrument 1 on: a full snapshot around every guard
  diffs: { name: string; needed: string[]; d: Record<string, unknown> }[] // needed: what resetState() alone left changed
  alpha: number // line 4: > 0 = the RT holds display white at this alpha, no scene drawn
  info: { calls: number; triangles: number; textures: number; geometries: number; programs: number } | null
  list: readonly string[] | null // null: the shipped restore list for render (RENDER_LIST); else this one
  readyAt: number // performance.now() when the load resolved (model.ts)
  draws: number // instance draws so far (model.ts): the first visible frame
  drawMs: number[] // main-thread ms of each instance draw (model.ts)
}

/** The restore list of render(), per frame: what the S1-T diff reported left changed after resetState() (dst and the
 *  viewport among them; UNPACK_ALIGNMENT because twgl leaves our ambient at 1, three's reset() writes 4; the units are
 *  the ones this material samples: 0 2D, 1 the env cube, 2 the bone texture) + ACTIVE_TEXTURE. A material with more
 *  samplers touches more units: re-run the S1-T diff. */
export const RENDER_LIST: readonly string[] = ['blendFunc', 'VIEWPORT', 'SCISSOR_BOX', 'COLOR_CLEAR_VALUE', 'UNPACK_ALIGNMENT', 'DRAW_FRAMEBUFFER_BINDING', 'READ_FRAMEBUFFER_BINDING', 'CURRENT_PROGRAM', 'ARRAY_BUFFER_BINDING', 'unit0.TEXTURE_2D', 'unit1.TEXTURE_CUBE_MAP', 'unit2.TEXTURE_2D', 'ACTIVE_TEXTURE']
const WHITE = 1e4 // line 4: a linear value the composite's tone map turns into display 1.0

// Single-pass glass (C5, § Model rev 1): the PMREM reflection (three's own specular, weighted by fresnel at metalness
// 0) plus one PMREM lookup along the refracted ray, weighted by `glass`; alpha = mix(body alpha, 1, fresnel) at glass 1,
// 1 at glass 0. Uniforms only: one program for every `glass` (transparent always, N5). The layers below show through
// the body by the alpha, undisplaced.
const GLASS = `#ifdef ENVMAP_TYPE_PMREM
{
  float fr = 0.04 + 0.96 * pow(1.0 - saturate(dot(geometryNormal, geometryViewDir)), 5.0);
  vec3 rd = transformDirectionByInverseViewMatrix(refract(-geometryViewDir, geometryNormal, 0.67), viewMatrix);
  vec3 through = textureLod(envMap, envMapRotation * rd, roughnessToMip(material.roughness)).rgb * envMapIntensity;
  outgoingLight += uGlass * (1.0 - fr) * through * vec3(0.8, 0.92, 1.0);
  diffuseColor.a = mix(1.0, mix(uBodyAlpha, 1.0, fr), uGlass);
}
#endif
#include <opaque_fragment>`

/** The one material of every mesh at every `glass` value (M-U1): transparent always (N5), so `glass` moves uniforms
 *  only and the program never changes. */
export function makeMaterial() {
  const glass = { value: 0 }, bodyAlpha = { value: 0.22 }
  const material = new MeshStandardMaterial({ color: 0xf2f2f2, metalness: 1, roughness: 0.06, flatShading: true, transparent: true }) // flat facets: the low-poly look in chrome
  material.userData.glass = glass
  material.onBeforeCompile = (sh: { uniforms: Record<string, unknown>; fragmentShader: string }) => {
    sh.uniforms.uGlass = glass
    sh.uniforms.uBodyAlpha = bodyAlpha
    sh.fragmentShader = `uniform float uGlass;\nuniform float uBodyAlpha;\n${sh.fragmentShader.replace('#include <opaque_fragment>', GLASS)}`
  }
  return material
}
/** `glass` 0 (chrome) .. 1 (glass): uniforms only. */
export function setGlass(material: InstanceType<typeof MeshStandardMaterial>, g: number) {
  material.userData.glass.value = g
  material.metalness = 1 - g
  material.color.setScalar(0.95 * (1 - g))
}

/** The pure pose seam (design L183-L185), the S1-T mapping: at layer time t, the clip time (`d` s ahead: what `speed`
 *  ≠ 1 integrated, so 0 keeps the clip on the layer clock) and the camera's orbit yaw. */
export const pose = (t: number, d = 0) => ({ clip: t + d, yaw: 0.9 + 0.12 * t })

const target = (w: number, h: number, samples: number) => new WebGLRenderTarget(w, h, { type: HalfFloatType, depthBuffer: true, samples })
/** An instance's RT (M-U2): rebuilt only when `samples` changes; a size change resizes it in place. */
export function fit(rt: InstanceType<typeof WebGLRenderTarget> | null, w: number, h: number, samples: 1 | 4) {
  const n = samples === 4 ? 4 : 0 // three: 0 = no MSAA buffer (1 would be a 1-sample MSAA blit)
  if (rt && rt.samples !== n) {
    rt.dispose()
    rt = null
  }
  rt ??= target(w, h, n)
  rt.setSize(w, h)
  return rt
}

/** The GL-free half of the load (Vitest runs it on the shipped model: M-U1, M-U3): the shared scene graph with the one
 *  material, the camera framed on the model, and the clip playing. */
export function rig(gltf: { scene: InstanceType<typeof Scene>; animations: { name: string }[] }) {
  const scene = new Scene()
  scene.environmentIntensity = 0.4 // the room's walls darker, its lights as bright: chrome reads by contrast
  const material = makeMaterial()
  const animal = gltf.scene
  animal.traverse((o: { isMesh?: boolean; material: unknown; frustumCulled: boolean }) => {
    if (!o.isMesh) return
    o.material = material // the model's own materials and textures are never uploaded: chrome and glass read the environment only
    o.frustumCulled = false // a skinned bind-pose box culls a running animal wrongly
  })
  scene.add(animal)
  const box = new Box3().setFromObject(animal)
  const centre = box.getCenter(new Vector3()), size = box.getSize(new Vector3()).length()
  const camera = new PerspectiveCamera(32, 16 / 10, size * 0.05, size * 10)
  const mixer = new AnimationMixer(animal)
  // A run cycle by name (the last `|` segment: exporters prefix the armature), else a walk, else the first clip.
  const clip = ['Gallop', 'Run', 'Walk'].map((n) => gltf.animations.find((a) => a.name.split('|').pop() === n)).find(Boolean) ?? gltf.animations[0]
  mixer.clipAction(clip).play()

  /** One instance's pose, camera and `glass`, right before its render: instances share the scene graph (§ Model rev 1). */
  function apply(p: ReturnType<typeof pose>, aspect: number, g: number) {
    mixer.setTime(p.clip)
    camera.position.set(centre.x + Math.sin(p.yaw) * size * 1.5, centre.y + size * 0.3, centre.z + Math.cos(p.yaw) * size * 1.5)
    camera.lookAt(centre)
    if (camera.aspect !== aspect) {
      camera.aspect = aspect
      camera.updateProjectionMatrix()
    }
    setGlass(material, g)
  }
  return { scene, camera, material, apply }
}

let shared: ReturnType<typeof make> | undefined
/** The one renderer on OUR context and its guard, made on the first call (one context per page): native/model's load
 *  and the vs3 natives (vs3/host.ts) share it. `S`: the first caller's (both pass MODEL_SPIKE). */
export const three = (gl: WebGL2RenderingContext, S: Spike) => (shared ??= make(gl, S))

function make(gl: WebGL2RenderingContext, S: Spike) {
  let renderer: InstanceType<typeof WebGLRenderer> | null = null
  /** Rule 1. `keys`: what this entry restores (load-time entries: every field, the cost is once). */
  function guard<T>(name: string, fn: () => T, keys: readonly string[] = KEYS): T {
    const full = S.diff ? glState(gl) : null
    const before = glState(gl, keys)
    S.entry++
    try {
      renderer?.resetState()
      const r = fn()
      const R = renderer ?? (r as InstanceType<typeof WebGLRenderer>)
      if (name === 'ctor' && S.skipCtorReset) return r
      R.resetState()
      const left = full && diff(full, glState(gl))
      restore(gl, before)
      if (full) S.diffs.push({ name, needed: Object.keys(left!), d: Object.fromEntries(Object.entries(diff(full, glState(gl))).map(([k, v]) => [k, v.map(label)])) })
      return r
    } finally {
      S.entry--
      if (full && name === 'ctor' && S.skipCtorReset) S.diffs.push({ name, needed: [], d: Object.fromEntries(Object.entries(diff(full, glState(gl))).map(([k, v]) => [k, v.map(label)])) })
    }
  }

  renderer = guard('ctor', () => {
    const r = new WebGLRenderer({ canvas: gl.canvas as HTMLCanvasElement, context: gl })
    r.outputColorSpace = LinearSRGBColorSpace // the program key of a null target = an RT's: compileAsync's programs serve render()
    r.setClearColor(0x000000, 0) // a GL call (instrument 2 caught it outside a guard)
    return r
  })
  const R = renderer
  return {
    R, guard,
    /** Rule 6's hand-over: the RT's colour texture, read from three's properties (undocumented; pinned r187). */
    texture: (rt: InstanceType<typeof WebGLRenderTarget>) => R.properties.get(rt.texture).__webglTexture as WebGLTexture,
    free: (rt: InstanceType<typeof WebGLRenderTarget>) => guard('dispose', () => rt.dispose()),
  }
}

export async function load(gl: WebGL2RenderingContext, url: string, S: Spike) {
  const { R: renderer, guard, texture, free } = three(gl, S)
  const { scene, camera, apply } = rig(await new GLTFLoader().loadAsync(url)) // fetch + parse: no GL
  scene.environment = guard('pmrem', () => {
    const g = new PMREMGenerator(renderer)
    const rt = g.fromScene(new RoomEnvironment(), 0.04)
    g.dispose()
    return rt.texture
  })
  const shot = target(16, 16, 0)
  apply(pose(0), 16 / 10, 0)
  const compiled = guard('compileAsync', () => {
    renderer.setRenderTarget(shot)
    return renderer.compileAsync(scene, camera)
  })
  await compiled
  guard('upload', () => { // rule 5: geometry, the bone texture and the VAO upload here, not on the first visible frame
    renderer.setRenderTarget(shot)
    renderer.render(scene, camera)
  })
  guard('dispose', () => shot.dispose())
  const R = renderer

  return {
    renderer: R,
    texture, free,
    /** One instance's frame into its own RT (fit()) at layer time t, its clip `d` s ahead (pose()): returns the RT. */
    render(rt: InstanceType<typeof WebGLRenderTarget> | null, w: number, h: number, samples: 1 | 4, t: number, d: number, g: number) {
      return guard('render', () => {
        rt = fit(rt, w, h, samples)
        R.setRenderTarget(rt)
        if (S.alpha > 0) {
          gl.clearColor(WHITE * S.alpha, WHITE * S.alpha, WHITE * S.alpha, S.alpha)
          gl.clear(gl.COLOR_BUFFER_BIT)
          return rt
        }
        apply(pose(t, d), w / h, g)
        R.render(scene, camera)
        S.info = { calls: R.info.render.calls, triangles: R.info.render.triangles, textures: R.info.memory.textures, geometries: R.info.memory.geometries, programs: R.info.programs.length }
        return rt
      }, S.list ?? RENDER_LIST)
    },
  }
}
