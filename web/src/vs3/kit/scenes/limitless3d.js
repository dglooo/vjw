// Copied from donor/vs3/visual_kit/src/scenes/limitless3d.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one staged scene per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: limitless 3d. limitless for 3D models: a model sits in a
// palette-lit space and the mode picks what happens to it in 3D. It
// comes with six built-in models made from math (lib/model-shapes.js),
// three meshes (a skull, a marble bust and a hand, lib/model-scans.js),
// and takes any model dropped on the window (lib/model-load.js).
//   form     the model itself, lit by the palette. shape pulls every
//            material toward palette chrome, complexity melts the
//            surface
//   shatter  the model split into shards that hang apart and tumble;
//            shape spreads them, complexity breaks it finer
//   dust     the model as a cloud of glowing grains on its surface,
//            drifting on the flow
//   hologram glowing wireframe and a rim of light; a scan line climbs
//            the model on every accent
//   slices   the model cut into floating layers that turn slowly
//            against each other
//   voxel    the model rebuilt from palette cubes on a grid. An
//            animated model is re-measured a few times a second, a
//            stop-motion step
// The shape holds still: the sliders own it, and the music moves the
// light, the melt and a small push on each kick. Nothing
// jumps to a new pose or blows apart on a beat (Alec 2026-09-24: "It
// should just stay as it is"). The one accent response left is the
// hologram's scan line, light only, gated like the other structural
// kicks (a 0.55 hit after a 3.2 s rest, see kick-response-cadence).
//
// Drag to turn and tilt the model. Releasing the mouse holds the angle:
// no automatic spin, throw or cursor lean (Alec, 2026-09-27).
// Shift+Space explicitly detaches the mouse and restores the resting tilt.
//
// How the effects reach any model: each mesh gets a non-indexed copy of
// its geometry carrying per-face data (the face's center, normal, a
// random triple, barycentrics, and the center of the chunk it belongs
// to), and its materials get a small vertex and fragment patch through
// onBeforeCompile. The model keeps its own materials, maps, skinning and
// animation; the patch moves faces in world space around the model's
// center, and the skinning is applied to the face centers too so an
// animated character shatters along its current pose.
import { PAL } from '../lib/common.js'; // the site's hero build hands PAL to the staged scene
import { createLimitless3D } from '../lib/limitless3d-stage.js';

export default function create() { // vjw

// Literal metadata only: the stage fills in the scene, the camera and
// every method (lib/limitless3d-stage.js).
const limitless3d = {
  name: 'limitless 3d',
  bloom: { strength: 0.25, gain: 0.3 },
  edgeAA: true,
  pixelBudget: 3.5,
  modes: ['form', 'shatter', 'dust', 'hologram', 'slices', 'voxel'],
  params: { mode: 'form', model: 'knot', speed: 0.5, shape: 0, complexity: 0.4, density: 0.5, fill: 0.5, tilt: 0.5, contrast: 0.5 },
  // What each slider does per mode, and which ones a mode hides (the
  // dead-slider rule). fill, tilt, speed and contrast mean the same
  // thing everywhere: size, camera crane, tempo, display curve.
  paramLabels: {
    form: { shape: 'chrome', complexity: 'melt', density: null },
    shatter: { shape: 'spread', complexity: 'shards', density: null },
    dust: { shape: 'drift', complexity: 'flow', density: 'grains' },
    hologram: { shape: 'scan', complexity: 'lines', density: 'glass' },
    slices: { shape: 'twist', complexity: 'slices', density: 'gap' },
    voxel: { shape: 'gap', complexity: 'blocks', density: 'solid' },
  },
  paramOrder: ['speed', 'shape', 'complexity', 'density', 'fill', 'tilt', 'contrast'],
};
createLimitless3D(limitless3d);

return limitless3d; // vjw: was `export default limitless3d;`
} // vjw: the factory
