// Copied from donor/vs3/visual_kit/src/lib/common.js (the friends' engine, used with permission, 2026-11-19).
// vjw: the window listeners stripped (marked below); particleSprite keeps its detached 2D canvas (a texture, no I/O).
// Shared palette and helpers for App scenes.
import * as THREE from 'three';

// Drastic slider scaling: 0.25× at 0, 1× at 0.5, 4× at 1. Used for macros
// and scene params so the ends of every slider feel like different worlds.
export const drastic = (p) => Math.pow(4, (p - 0.5) * 2);

// Five semantic slots, mutated in place by the palette engine. Scenes hold
// references to these Color objects, so a palette morph recolors everything.
export const PAL = {
  bg: new THREE.Color('#05030a'),
  shadow: new THREE.Color('#140a2e'),
  mid: new THREE.Color('#7b3ff2'),
  accent: new THREE.Color('#2fd6a8'),
  glow: new THREE.Color('#ffb46b'),
};

// Points material with per-particle size, alpha, and color attributes
// (PointsMaterial only supports uniform size/opacity). Additive glow sprites.
export function glowPointsMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: particleSprite() }, uScale: { value: 380 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute float aAlpha;
      attribute vec3 aColor;
      uniform float uScale;
      varying float vA;
      varying vec3 vC;
      void main() {
        vA = aAlpha;
        vC = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (uScale / max(0.1, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      varying float vA;
      varying vec3 vC;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vA;
        gl_FragColor = vec4(vC * a, a);
      }`,
  });
}

// Shared mouse state for pointer-interactive scenes (anemone is the
// first; more are planned). One convention everywhere:
// - Only the canvas steers: pointer events whose target is the panel,
//   HUD, or any other chrome are ignored, so tuning in the g panel
//   never drags the visual around.
// - SHIFT+SPACE detaches the mouse entirely (and reattaches). While
//   detached, scenes read a dead pointer and ease home. Plain space
//   belonged to this toggle until 2026-08-21; the web player uses
//   space for play/pause, so every transport press was silently
//   flipping the mouse too. One chord everywhere now, both surfaces.
// - `held` is true while the button is down on the canvas.
// Scenes treat the pointer as alive when `ndc` is set and `lastMove`
// is recent; both go stale on detach, so the same idle path handles
// letting go and pressing space.
// - `remote` is true while the position came from another window (the
//   pointer relay) and false once this window's own mouse moves it. A
//   scene that puts its own result on the wire (limitless 3d's dragged
//   angle) integrates local gestures only, so a drag is counted once.
export const scenePointer = { ndc: null, lastMove: -1e9, held: false, detached: false, remote: false };

const pointerNow = () => (typeof performance !== 'undefined' ? performance.now() : 0);
const pointerUnit = (v) => Math.max(-1, Math.min(1, v));

// The web output relay writes through these helpers too. Keep the pointer as
// one shared mutable object: scenes import this exact reference, so a remote
// gesture reaches the same path as a local canvas gesture.
export function setScenePointer(x, y, held = scenePointer.held, at = pointerNow()) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  scenePointer.ndc = { x: pointerUnit(x), y: pointerUnit(y) };
  scenePointer.lastMove = at;
  scenePointer.held = !!held;
  return true;
}

export function setScenePointerHeld(held) {
  scenePointer.held = !!held;
}
// vjw: the window pointer/key listeners (Shift+Space detach, canvas #scene steering) and window.appPointerFollower
// are stripped. vs3/host.ts fills this object before each update: the #stage pointer for a scene registered with
// look.pointer (its listeners sit on #stage only), the dead stub (ndc null, held false) for every other.

let sprite = null;
export function particleSprite() {
  if (sprite) return sprite;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  sprite = new THREE.CanvasTexture(c);
  return sprite;
}
