// S1-T instrument 1 (design_gpu3d § Spike list rev 1, skeptic C9): a GL-state snapshot, its diff, and a restore.
// Fields: the enables, blend, depth, cull, masks, stencil, viewport/scissor/clear, every pixel-store parameter, the
// bindings (FBOs, renderbuffer, program, VAO, buffers incl. the indexed UBO/TF points, TF object) and units 0-15 x
// (2D, cube, 3D, 2D array, sampler). Values stay raw (GL objects by identity) so restore() can set them back.
export type GLState = Map<string, unknown>
type GL = WebGL2RenderingContext
interface Field { key: string; get(gl: GL): unknown; set(gl: GL, v: unknown): void }

const p = (gl: GL, name: keyof GL) => gl.getParameter(gl[name] as GLenum)
const n = (v: unknown) => v as number
const arr = (v: unknown) => Array.from(v as ArrayLike<number>)
const cap = (name: string): Field => ({ key: name, get: (gl) => gl.isEnabled(gl[name as keyof GL] as GLenum), set: (gl, v) => (v ? gl.enable : gl.disable).call(gl, gl[name as keyof GL] as GLenum) })
const store = (name: string): Field => ({ key: name, get: (gl) => p(gl, name as keyof GL), set: (gl, v) => gl.pixelStorei(gl[name as keyof GL] as GLenum, n(v)) })
const buffer = (name: string, target: string): Field => ({ key: name, get: (gl) => p(gl, name as keyof GL), set: (gl, v) => gl.bindBuffer(gl[target as keyof GL] as GLenum, v as WebGLBuffer | null) })
const many = (key: string, names: string[], set: (gl: GL, v: number[]) => void): Field => ({ key, get: (gl) => names.map((x) => n(p(gl, x as keyof GL))), set: (gl, v) => set(gl, v as number[]) })
const TEX = [['TEXTURE_2D', 'TEXTURE_BINDING_2D'], ['TEXTURE_CUBE_MAP', 'TEXTURE_BINDING_CUBE_MAP'], ['TEXTURE_3D', 'TEXTURE_BINDING_3D'], ['TEXTURE_2D_ARRAY', 'TEXTURE_BINDING_2D_ARRAY']] as const
const UNITS = 16
const UBO_POINTS = 8 // ponytail: the first 8 indexed UBO points; our engine binds none, three binds them only for UniformsGroups
const TF_POINTS = 4 // MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS minimum

const FIELDS: Field[] = [
  ...['BLEND', 'CULL_FACE', 'DEPTH_TEST', 'STENCIL_TEST', 'SCISSOR_TEST', 'POLYGON_OFFSET_FILL', 'SAMPLE_ALPHA_TO_COVERAGE', 'RASTERIZER_DISCARD', 'DITHER'].map(cap),
  many('blendFunc', ['BLEND_SRC_RGB', 'BLEND_DST_RGB', 'BLEND_SRC_ALPHA', 'BLEND_DST_ALPHA'], (gl, v) => gl.blendFuncSeparate(v[0], v[1], v[2], v[3])),
  many('blendEquation', ['BLEND_EQUATION_RGB', 'BLEND_EQUATION_ALPHA'], (gl, v) => gl.blendEquationSeparate(v[0], v[1])),
  { key: 'BLEND_COLOR', get: (gl) => arr(p(gl, 'BLEND_COLOR')), set: (gl, v) => gl.blendColor(...(v as [number, number, number, number])) },
  { key: 'DEPTH_FUNC', get: (gl) => p(gl, 'DEPTH_FUNC'), set: (gl, v) => gl.depthFunc(n(v)) },
  { key: 'DEPTH_WRITEMASK', get: (gl) => p(gl, 'DEPTH_WRITEMASK'), set: (gl, v) => gl.depthMask(!!v) },
  { key: 'CULL_FACE_MODE', get: (gl) => p(gl, 'CULL_FACE_MODE'), set: (gl, v) => gl.cullFace(n(v)) },
  { key: 'FRONT_FACE', get: (gl) => p(gl, 'FRONT_FACE'), set: (gl, v) => gl.frontFace(n(v)) },
  { key: 'COLOR_WRITEMASK', get: (gl) => Array.from(p(gl, 'COLOR_WRITEMASK') as boolean[]), set: (gl, v) => gl.colorMask(...(v as [boolean, boolean, boolean, boolean])) },
  many('stencilFront', ['STENCIL_FUNC', 'STENCIL_REF', 'STENCIL_VALUE_MASK', 'STENCIL_FAIL', 'STENCIL_PASS_DEPTH_FAIL', 'STENCIL_PASS_DEPTH_PASS', 'STENCIL_WRITEMASK'], (gl, v) => {
    gl.stencilFuncSeparate(gl.FRONT, v[0], v[1], v[2])
    gl.stencilOpSeparate(gl.FRONT, v[3], v[4], v[5])
    gl.stencilMaskSeparate(gl.FRONT, v[6])
  }),
  many('stencilBack', ['STENCIL_BACK_FUNC', 'STENCIL_BACK_REF', 'STENCIL_BACK_VALUE_MASK', 'STENCIL_BACK_FAIL', 'STENCIL_BACK_PASS_DEPTH_FAIL', 'STENCIL_BACK_PASS_DEPTH_PASS', 'STENCIL_BACK_WRITEMASK'], (gl, v) => {
    gl.stencilFuncSeparate(gl.BACK, v[0], v[1], v[2])
    gl.stencilOpSeparate(gl.BACK, v[3], v[4], v[5])
    gl.stencilMaskSeparate(gl.BACK, v[6])
  }),
  { key: 'VIEWPORT', get: (gl) => arr(p(gl, 'VIEWPORT')), set: (gl, v) => gl.viewport(...(v as [number, number, number, number])) },
  { key: 'SCISSOR_BOX', get: (gl) => arr(p(gl, 'SCISSOR_BOX')), set: (gl, v) => gl.scissor(...(v as [number, number, number, number])) },
  { key: 'COLOR_CLEAR_VALUE', get: (gl) => arr(p(gl, 'COLOR_CLEAR_VALUE')), set: (gl, v) => gl.clearColor(...(v as [number, number, number, number])) },
  { key: 'DEPTH_CLEAR_VALUE', get: (gl) => p(gl, 'DEPTH_CLEAR_VALUE'), set: (gl, v) => gl.clearDepth(n(v)) },
  { key: 'STENCIL_CLEAR_VALUE', get: (gl) => p(gl, 'STENCIL_CLEAR_VALUE'), set: (gl, v) => gl.clearStencil(n(v)) },
  { key: 'LINE_WIDTH', get: (gl) => p(gl, 'LINE_WIDTH'), set: (gl, v) => gl.lineWidth(n(v)) },
  many('polygonOffset', ['POLYGON_OFFSET_FACTOR', 'POLYGON_OFFSET_UNITS'], (gl, v) => gl.polygonOffset(v[0], v[1])),
  ...['PACK_ALIGNMENT', 'UNPACK_ALIGNMENT', 'UNPACK_FLIP_Y_WEBGL', 'UNPACK_PREMULTIPLY_ALPHA_WEBGL', 'UNPACK_COLORSPACE_CONVERSION_WEBGL', 'PACK_ROW_LENGTH', 'PACK_SKIP_PIXELS', 'PACK_SKIP_ROWS', 'UNPACK_ROW_LENGTH', 'UNPACK_IMAGE_HEIGHT', 'UNPACK_SKIP_PIXELS', 'UNPACK_SKIP_ROWS', 'UNPACK_SKIP_IMAGES'].map(store),
  { key: 'DRAW_FRAMEBUFFER_BINDING', get: (gl) => p(gl, 'DRAW_FRAMEBUFFER_BINDING'), set: (gl, v) => gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, v as WebGLFramebuffer | null) },
  { key: 'READ_FRAMEBUFFER_BINDING', get: (gl) => p(gl, 'READ_FRAMEBUFFER_BINDING'), set: (gl, v) => gl.bindFramebuffer(gl.READ_FRAMEBUFFER, v as WebGLFramebuffer | null) },
  { key: 'RENDERBUFFER_BINDING', get: (gl) => p(gl, 'RENDERBUFFER_BINDING'), set: (gl, v) => gl.bindRenderbuffer(gl.RENDERBUFFER, v as WebGLRenderbuffer | null) },
  { key: 'CURRENT_PROGRAM', get: (gl) => p(gl, 'CURRENT_PROGRAM'), set: (gl, v) => gl.useProgram(v as WebGLProgram | null) },
  { key: 'VERTEX_ARRAY_BINDING', get: (gl) => p(gl, 'VERTEX_ARRAY_BINDING'), set: (gl, v) => gl.bindVertexArray(v as WebGLVertexArrayObject | null) },
  buffer('ELEMENT_ARRAY_BUFFER_BINDING', 'ELEMENT_ARRAY_BUFFER'), // VAO state: after the VAO
  buffer('ARRAY_BUFFER_BINDING', 'ARRAY_BUFFER'),
  { key: 'TRANSFORM_FEEDBACK_BINDING', get: (gl) => p(gl, 'TRANSFORM_FEEDBACK_BINDING'), set: (gl, v) => gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, v as WebGLTransformFeedback | null) },
  ...Array.from({ length: TF_POINTS }, (_, i): Field => ({ key: `TF_BUFFER[${i}]`, get: (gl) => gl.getIndexedParameter(gl.TRANSFORM_FEEDBACK_BUFFER_BINDING, i), set: (gl, v) => gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, i, v as WebGLBuffer | null) })),
  buffer('TRANSFORM_FEEDBACK_BUFFER_BINDING', 'TRANSFORM_FEEDBACK_BUFFER'), // the generic point, after bindBufferBase moved it
  ...Array.from({ length: UBO_POINTS }, (_, i): Field => ({ key: `UBO[${i}]`, get: (gl) => gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, i), set: (gl, v) => gl.bindBufferBase(gl.UNIFORM_BUFFER, i, v as WebGLBuffer | null) })),
  buffer('UNIFORM_BUFFER_BINDING', 'UNIFORM_BUFFER'),
  buffer('PIXEL_PACK_BUFFER_BINDING', 'PIXEL_PACK_BUFFER'),
  buffer('PIXEL_UNPACK_BUFFER_BINDING', 'PIXEL_UNPACK_BUFFER'),
  buffer('COPY_READ_BUFFER_BINDING', 'COPY_READ_BUFFER'),
  buffer('COPY_WRITE_BUFFER_BINDING', 'COPY_WRITE_BUFFER'),
  ...Array.from({ length: UNITS }, (_, u) => [
    ...TEX.map(([target, binding]): Field => ({
      key: `unit${u}.${target}`,
      get: (gl) => (gl.activeTexture(gl.TEXTURE0 + u), p(gl, binding)),
      set: (gl, v) => (gl.activeTexture(gl.TEXTURE0 + u), gl.bindTexture(gl[target], v as WebGLTexture | null)),
    })),
    { key: `unit${u}.SAMPLER`, get: (gl) => (gl.activeTexture(gl.TEXTURE0 + u), p(gl, 'SAMPLER_BINDING')), set: (gl, v) => gl.bindSampler(u, v as WebGLSampler | null) } satisfies Field,
  ]).flat(),
  { key: 'ACTIVE_TEXTURE', get: (gl) => p(gl, 'ACTIVE_TEXTURE'), set: (gl, v) => gl.activeTexture(n(v)) }, // last: the unit reads move it
]
export const KEYS: readonly string[] = FIELDS.map((f) => f.key)
/** What our own passes change on every draw (the engine's program + twgl's sampler units and attribute buffer, bloom's
 *  blendFunc, a clear's colour): a native that restores these leaves the GL state as it found it (GPU3D I-GL2,
 *  plan_gpu3d S5.1; the field list `g3-state.mjs leak` reported). ponytail: units 0-1, as our passes sample at most two
 *  textures; a pass with a third sampler touches unit 2: re-run the leak mode. */
export const PASS_LIST: readonly string[] = ['blendFunc', 'COLOR_CLEAR_VALUE', 'CURRENT_PROGRAM', 'ARRAY_BUFFER_BINDING', 'unit0.TEXTURE_2D', 'unit1.TEXTURE_2D', 'ACTIVE_TEXTURE']

/** The state of `keys` (default: every field). Leaves ACTIVE_TEXTURE as it found it. Empty on a lost context, where
 *  getParameter reads null and restore() of the empty snapshot sets nothing (GPU3D I-CL1: frames run until the reload). */
export function glState(gl: GL, keys: readonly string[] = KEYS): GLState {
  if (gl.isContextLost()) return new Map()
  const unit = gl.getParameter(gl.ACTIVE_TEXTURE)
  const s: GLState = new Map()
  for (const f of FIELDS) if (keys.includes(f.key)) s.set(f.key, f.get(gl))
  if (s.has('ACTIVE_TEXTURE')) s.set('ACTIVE_TEXTURE', unit) // as found, not as the unit reads left it
  gl.activeTexture(unit)
  return s
}

const same = (a: unknown, b: unknown) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => x === b[i]) : a === b)
/** The fields whose value differs: key → [a, b]. {} = no change. */
export function diff(a: GLState, b: GLState): Record<string, [unknown, unknown]> {
  const d: Record<string, [unknown, unknown]> = {}
  for (const [k, v] of a) if (!same(v, b.get(k))) d[k] = [v, b.get(k)]
  return d
}

/** Sets every field of `s` back, in table order (VAO before its element buffer, units before ACTIVE_TEXTURE). */
export function restore(gl: GL, s: GLState) {
  const unit = s.has('ACTIVE_TEXTURE') ? null : gl.getParameter(gl.ACTIVE_TEXTURE) // a unit field moves it
  for (const f of FIELDS) if (s.has(f.key)) f.set(gl, s.get(f.key))
  if (unit !== null) gl.activeTexture(unit)
}

const ids = new WeakMap<object, number>()
let next = 0
/** A JSON-able label: GL objects as `WebGLTexture#3` (one id per object for the page's life). */
export const label = (v: unknown): unknown => (v && typeof v === 'object' && !Array.isArray(v) ? `${v.constructor.name}#${ids.get(v) ?? (ids.set(v, ++next), next)}` : v)
