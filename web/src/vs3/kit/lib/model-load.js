// Copied from donor/vs3/visual_kit/src/lib/model-load.js (the friends' engine, used with permission, 2026-11-19).
// vjw: parseModel's five loader import()s stripped (a dropped model; our app has no drop). finishModel, the part
// limitless3d-stage.js uses, is verbatim.
// Loading a dropped 3D model for the limitless 3d scene. Parses the
// file with three.js's own loaders, cleans up what exporters get wrong,
// and hands back the model centered on the origin with its bounding
// sphere at radius 1. The scene (scenes/limitless3d.js) does the rest.
//
// Formats: .glb and .gltf (Blender's own export, Unreal's glTF exporter),
// .fbx (Unreal's and Mixamo's default), .obj, .stl, .ply (phone scans,
// including gaussian splat files, which draw as colored points). The
// parsers are imported on the first drop, so a session that never sees
// a model never pays for them.
//
// Two rules keep a shared file from reaching outside itself. A model is
// one file: anything it names beside it (a .gltf's .bin, an FBX's
// texture folder) is refused up front with a reason, and every URL a
// loader asks for resolves only when it is data: or blob: (the pieces a
// .glb or FBX carries inside itself). Nothing a model says can make this
// window fetch from the network.
//
// Color: the model keeps its own materials and textures. A model with no
// materials of its own (most STL, PLY and OBJ files) comes out as palette
// chrome, which the scene's palette room lights.
import * as THREE from 'three';

export const MODEL_EXTS = ['glb', 'gltf', 'fbx', 'obj', 'stl', 'ply'];
const MODEL_EXT = new Set(MODEL_EXTS);

// The model file's extension, or '' when the name is not a model.
export function modelExtOf(nameOrFile) {
  const name = typeof nameOrFile === 'string' ? nameOrFile : (nameOrFile && nameOrFile.name) || '';
  const m = /\.([a-z0-9]{2,4})$/i.exec(name);
  const ext = m ? m[1].toLowerCase() : '';
  return MODEL_EXT.has(ext) ? ext : '';
}

// A refusal the drop chip can read out. Everything else a parser throws
// is reported as an unreadable file.
export class ModelRefused extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

// Hard ceiling on geometry. Past it the turntable would cost more than
// the rest of the frame put together.
const MAX_TRIANGLES = 8e6;
const MAX_POINTS = 6e6;

// ---------------------------------------------------------------- loading

// Anything a loader asks for resolves only when it is embedded. The
// manager also counts the loads still running (textures decode after
// the parse returns), so the source can wait for them before it decides
// which textures made it.
function sealedManager() {
  const m = new THREE.LoadingManager();
  m.setURLModifier((url) => (/^(data|blob):/i.test(url) ? url : 'data:,'));
  let pending = 0;
  let waiters = [];
  const start = m.itemStart, end = m.itemEnd;
  m.itemStart = (url) => { pending++; start(url); };
  m.itemEnd = (url) => {
    pending = Math.max(0, pending - 1);
    end(url);
    if (!pending) { const w = waiters; waiters = []; w.forEach((f) => f()); }
  };
  // Resolves once nothing is loading, or after ms whatever is left.
  m.settled = (ms) => new Promise((resolve) => {
    if (!pending) { resolve(); return; }
    waiters.push(resolve);
    setTimeout(resolve, ms);
  });
  return m;
}

function gltfJSON(buffer) {
  const u8 = new Uint8Array(buffer);
  // A .glb opens with the magic "glTF", then the JSON chunk.
  if (u8.length >= 20 && u8[0] === 0x67 && u8[1] === 0x6c && u8[2] === 0x54 && u8[3] === 0x46) {
    const dv = new DataView(buffer);
    const len = dv.getUint32(12, true);
    if (dv.getUint32(16, true) !== 0x4e4f534a) throw new ModelRefused('that .glb is damaged');
    return JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + len)));
  }
  return JSON.parse(new TextDecoder().decode(u8));
}

// Refuse what the loaders here cannot finish before handing it over, so
// the chip says why instead of showing half a model.
function preflightGLTF(buffer) {
  let json;
  try { json = gltfJSON(buffer); } catch (e) {
    if (e instanceof ModelRefused) throw e;
    throw new ModelRefused('that file is not a readable glTF');
  }
  const outside = (uri) => typeof uri === 'string' && !/^data:/i.test(uri);
  if ((json.buffers || []).some((b) => outside(b.uri)) || (json.images || []).some((i) => outside(i.uri))) {
    throw new ModelRefused('that .gltf needs files beside it: export a single .glb');
  }
  const NEEDS = {
    KHR_draco_mesh_compression: 'Draco compression',
    EXT_meshopt_compression: 'meshopt compression',
    KHR_texture_basisu: 'KTX2 textures',
  };
  for (const ext of json.extensionsRequired || []) {
    if (NEEDS[ext]) throw new ModelRefused(`that model uses ${NEEDS[ext]}: export it without compression`);
  }
}

async function parseModel() { // vjw: the five loaders' import() (GLTF, FBX, OBJ, STL, PLY) stripped: no model drop here
  throw new ModelRefused('no model drop in VeeJay Wizard');
}

function splatColors(fdc) {
  const n = fdc.count;
  const out = new Float32Array(n * 3);
  const c = new THREE.Color();
  const SH0 = 0.28209479177387814;
  for (let i = 0; i < n; i++) {
    const r = Math.min(1, Math.max(0, 0.5 + SH0 * fdc.getX(i)));
    const g = Math.min(1, Math.max(0, 0.5 + SH0 * fdc.getY(i)));
    const b = Math.min(1, Math.max(0, 0.5 + SH0 * fdc.getZ(i)));
    c.setRGB(r, g, b, THREE.SRGBColorSpace);
    out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b;
  }
  return new THREE.BufferAttribute(out, 3);
}

// ---------------------------------------------------------------- materials

// The look for a model with no materials of its own: palette chrome.
// It reflects the palette room, so it recolors with every palette.
// Vertex colors (painted scans, colored OBJ) keep their paint instead.
function chromeMaterial(vertexColors) {
  return vertexColors
    ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.5 })
    : new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.85, roughness: 0.3 });
}

// FBX and OBJ arrive as Phong or Lambert, which never see the palette
// room's reflections. They move to the standard material with every
// map carried across; shininess becomes roughness.
const CARRY = ['map', 'normalMap', 'bumpMap', 'emissiveMap', 'alphaMap', 'aoMap', 'lightMap',
  'displacementMap'];
function toStandard(m) {
  if (!m || m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isShaderMaterial) return m;
  if (!m.isMeshPhongMaterial && !m.isMeshLambertMaterial) return m;
  const s = new THREE.MeshStandardMaterial();
  s.name = m.name;
  if (m.color) s.color.copy(m.color);
  if (m.emissive) s.emissive.copy(m.emissive);
  s.emissiveIntensity = m.emissiveIntensity ?? 1;
  for (const k of CARRY) if (m[k]) s[k] = m[k];
  if (m.normalScale) s.normalScale.copy(m.normalScale);
  if (m.bumpScale !== undefined) s.bumpScale = m.bumpScale;
  // Exporters often flag a solid material transparent at full opacity,
  // which only buys sorting flicker between body parts.
  s.transparent = m.transparent && (m.opacity < 0.99 || !!m.alphaMap);
  s.opacity = m.opacity;
  s.alphaTest = m.alphaTest;
  s.side = m.side;
  s.vertexColors = m.vertexColors;
  s.flatShading = m.flatShading;
  const shine = m.isMeshPhongMaterial ? (m.shininess ?? 30) : 4;
  s.roughness = Math.min(0.92, Math.max(0.08, 1 - Math.sqrt(Math.max(0, shine)) / 10));
  s.metalness = 0;
  return s;
}

// Returns the point materials that take the palette's glow, so the
// turntable can keep them on the current palette every frame.
function dressMaterials(root, kind) {
  const tinted = [];
  const drop = [];
  let chrome = null;
  let painted = null;
  // Meshes share materials (an FBX character's body parts often share
  // one), so each original converts once and every mesh gets the same
  // new material. Converting per mesh handed the maps to the first mesh
  // and left the rest bare white.
  const converted = new Map();
  const convert = (m) => {
    if (!m) return m;
    if (!converted.has(m)) converted.set(m, toStandard(m));
    return converted.get(m);
  };
  root.traverse((o) => {
    // The palette is the light here. Lamps and cameras a file brings
    // along (Blender's punctual lights export in candela) come out.
    if (o.isLight || o.isCamera) { drop.push(o); return; }
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    o.frustumCulled = false; // skinned bounds go stale mid-animation
    const hasColors = !!(o.geometry && o.geometry.getAttribute('color'));
    if (o.isPoints) {
      o.material = new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: hasColors });
      if (!hasColors) tinted.push(o.material);
      return;
    }
    if (o.isLine) return;
    // Shading needs normals, and PLY and some OBJ files carry none.
    if (o.geometry && !o.geometry.getAttribute('normal')) o.geometry.computeVertexNormals();
    // OBJ here has no .mtl beside it, and STL and PLY carry no material
    // at all: those are chrome, or their own vertex colors.
    if (kind === 'obj' || kind === 'stl' || kind === 'ply' || !o.material) {
      if (hasColors) o.material = painted || (painted = chromeMaterial(true));
      else o.material = chrome || (chrome = chromeMaterial(false));
      return;
    }
    o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
  });
  for (const o of drop) o.removeFromParent();
  // A material at zero opacity with no alpha map to cut it is an export
  // slip, not a wish: FBX writers mark opaque materials that way often
  // enough (a rock from an Unreal asset pack came through invisible),
  // and nobody drops a model to see nothing.
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m && m.opacity < 0.02 && !m.alphaMap) { m.opacity = 1; m.transparent = false; m.needsUpdate = true; }
    }
  });
  // The originals are done with. Their maps now belong to the new
  // materials, so only the material objects themselves are freed.
  for (const [orig, next] of converted) if (orig !== next) orig.dispose();
  return tinted;
}

// A texture the file only named (an FBX's texture folder, refused by
// the sealed manager) never gets an image, and an empty map samples as
// black: the whole model went dark. Such maps come off the material so
// its own color shows instead. Runs after the loads settle.
const MAP_KEYS = ['map', 'normalMap', 'bumpMap', 'emissiveMap', 'alphaMap', 'aoMap', 'lightMap',
  'displacementMap', 'roughnessMap', 'metalnessMap', 'specularMap', 'clearcoatMap',
  'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap',
  'transmissionMap', 'thicknessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'specularColorMap', 'specularIntensityMap', 'anisotropyMap'];
function dropMissingMaps(root) {
  let dropped = 0;
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      for (const k of MAP_KEYS) {
        const tex = m[k];
        if (!tex || !tex.isTexture || tex.isRenderTargetTexture) continue;
        const img = tex.image;
        const ok = img && ((img.width > 0 && img.height > 0) || img.data);
        if (ok) continue;
        m[k] = null;
        m.needsUpdate = true;
        tex.dispose();
        dropped++;
      }
    }
  });
  return dropped;
}

// QA: what each material ended up as.
function describeMaterials(root) {
  const out = [];
  const seen = new Set();
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      const maps = MAP_KEYS.filter((k) => m[k]).map((k) => {
        const img = m[k].image;
        return `${k}:${img ? `${img.width}x${img.height}` : 'none'}`;
      });
      out.push({
        type: m.type, name: m.name || '',
        color: m.color ? m.color.getHexString() : null,
        emissive: m.emissive ? m.emissive.getHexString() : null,
        rough: m.roughness ?? null, metal: m.metalness ?? null,
        transparent: !!m.transparent, opacity: m.opacity, maps,
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------- measuring

function measure(root) {
  let tris = 0, points = 0, meshes = 0, verts = 0;
  root.traverse((o) => {
    const g = o.geometry;
    if (!g || !g.getAttribute || !g.getAttribute('position')) return;
    const n = g.getAttribute('position').count;
    const inst = o.isInstancedMesh ? o.count : 1;
    verts += n * inst;
    if (o.isMesh) { meshes++; tris += (g.index ? g.index.count : n) / 3 * inst; }
    else if (o.isPoints) points += n * inst;
  });
  return { tris: Math.round(tris), points, meshes, verts };
}

// ---------------------------------------------------------------- the model

export async function loadModel(buffer, ext, name = '') {
  if (!MODEL_EXT.has(ext)) throw new ModelRefused('that file type is not a 3D model App reads');
  const manager = sealedManager();
  const { root, clips, kind } = await parseModel(buffer, ext, manager);
  if (!root) throw new ModelRefused('that file holds no model');
  // Embedded textures decode after the parse returns; wait for them (and
  // for the refused ones to fail) before judging which maps are real.
  await manager.settled(4000);
  const mapsDropped = dropMissingMaps(root);
  const stats = measure(root);
  if (!stats.meshes && !stats.points) throw new ModelRefused('that file holds no geometry to show');
  if (stats.tris > MAX_TRIANGLES) {
    throw new ModelRefused(`that model is too heavy (${(stats.tris / 1e6).toFixed(1)} million triangles, the limit is ${MAX_TRIANGLES / 1e6})`);
  }
  if (stats.points > MAX_POINTS) {
    throw new ModelRefused(`that scan is too heavy (${(stats.points / 1e6).toFixed(1)} million points, the limit is ${MAX_POINTS / 1e6})`);
  }
  const tinted = dressMaterials(root, kind);

  // Animation: the richest clip loops (most keyframes: Mixamo files
  // lead with an empty "Take 001" and carry the motion in the next
  // one). Its first frame is the pose the model is measured in, so a
  // crouch is framed as a crouch.
  const keysOf = (c) => c.tracks.reduce((n, tr) => n + tr.times.length, 0);
  const clip = clips.reduce((best, c) => (keysOf(c) > (best ? keysOf(best) : 0) ? c : best), null);
  const mixer = clip ? new THREE.AnimationMixer(root) : null;
  if (mixer) {
    mixer.clipAction(clip).play();
    mixer.update(0);
  }
  return finishModel(root, { kind, ext, name, clip, clips: clips.length, mixer, tinted, stats: { ...stats, mapsDropped } });
}

// Up to this many vertices are read to find a dropped model's mass
// center and its reach from it (an even stride over the rest).
const PIVOT_SAMPLES = 200000;

function eachVertex(root, fn) {
  let total = 0;
  root.traverse((o) => { if (o.isMesh && o.geometry?.attributes.position) total += o.geometry.attributes.position.count; });
  const step = Math.max(1, Math.floor(total / PIVOT_SAMPLES));
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const pos = o.isMesh && o.geometry?.attributes.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i += step) fn(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  });
}

// The mean of the surface's vertices, in world space.
function massCenter(root) {
  const sum = new THREE.Vector3();
  let n = 0;
  eachVertex(root, (v) => { sum.add(v); n++; });
  return n ? sum.divideScalar(n) : null;
}

function farthestFrom(root, c) {
  let r2 = 0;
  eachVertex(root, (v) => { r2 = Math.max(r2, v.distanceToSquared(c)); });
  return Math.sqrt(r2);
}

// Center a model and scale its bounding sphere to radius 1, inside a
// holder group the scene parents under its turntable. The built-in
// models (lib/model-shapes.js) come through here too, so every model
// lands the same size.
export function finishModel(root, info = {}) {
  root.updateMatrixWorld(true);
  const stats = info.stats || measure(root);
  // Precise bounds follow skinning and morphs, but walk every vertex, so
  // a very dense model settles for its geometry boxes.
  const box = new THREE.Box3().setFromObject(root, stats.verts < 2e6);
  if (box.isEmpty()) throw new ModelRefused('that file holds no geometry to show');
  const center = box.getCenter(new THREE.Vector3());
  let radius = Math.max(1e-6, box.getSize(new THREE.Vector3()).length() / 2);
  // A dropped model turns about its mass, not its box: a bust with a
  // long beak or an arm out has a box center far off the body, and the
  // turn then swings the body around in an orbit (Alec, 2026-10-20).
  // Height stays the box's, so the framing does not climb. The radius
  // grows if the shifted center leaves a vertex outside it, so nothing
  // turns out of frame. The built-ins and scans keep their tuned pivot.
  if (info.kind !== 'shape' && info.kind !== 'scan') {
    const mass = massCenter(root);
    if (mass) {
      center.x = mass.x; center.z = mass.z;
      radius = Math.max(radius, farthestFrom(root, center));
    }
  }
  root.position.sub(center);
  const holder = new THREE.Group();
  holder.scale.setScalar(1 / radius);
  holder.add(root);
  holder.updateMatrixWorld(true);
  const tinted = info.tinted || [];
  const mixer = info.mixer || null;
  const clip = info.clip || null;
  let disposed = false;
  return {
    holder, root, mixer, radius,
    kind: info.kind || 'shape', ext: info.ext || '', name: info.name || '',
    clip: clip ? clip.name : null, clips: info.clips || 0,
    // Point materials with no colors of their own; they take the glow.
    tinted,
    stats,
    describe: () => describeMaterials(root),
    dispose() {
      if (disposed) return;
      disposed = true;
      if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(root); }
      const textures = new Set();
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          for (const v of Object.values(m)) if (v && v.isTexture) textures.add(v);
          m.dispose();
        }
      });
      for (const tex of textures) tex.dispose();
    },
    get disposed() { return disposed; },
  };
}
