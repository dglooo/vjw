// Copied from donor/vs3/visual_kit/src/scenes/lasers.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one staged scene per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Scene: lasers. The reusable stage owns the room, haze and motion.
// Literal metadata lets the browser hero inspect the scene without loading it.
import { createLasersScene } from '../lib/laser-stage.js';

export default function create() { // vjw

const lasers = {
  name: 'main stage',
  bloom: { strength: 0.26, gain: 0, kick: 0 },
  grain: 0,
  // Beams, halos and the lit haze are drawn per pixel, so the frame's cost
  // tracks its pixel count (M2 Pro: about 10 ms at 1080p, 15 at 1440p).
  // 3.7 MP keeps 1080p and 1440p at full scale on reference hardware and
  // lets a slower GPU or a 4K or Retina frame drop resolution first.
  pixelBudget: 3.7,
  params: {
    pattern: 0, form: 0.08, rig: 0.71, complexity: 0.9, formation: 0.65,
    shape: 0.5, fill: 0.55, tilt: 0.25, phase: 0, movement: 0.5, speed: 0.4,
    color: 0.5, contrast: 0.85, density: 0.65, room: 0.45, screen: 0,
    colors: 0.3333333333333333, wall: 0.5, chase: 0.75, edge: 0.5, strips: 0.5,
  },
  paramOrder: ['movement', 'speed', 'pattern', 'form', 'rig', 'complexity', 'formation', 'shape', 'fill', 'tilt', 'phase', 'chase', 'colors', 'color', 'contrast', 'density', 'room', 'edge', 'strips', 'screen', 'wall'],
  paramLabels: { '*': { movement: 'auto movement', edge: 'stage lights', strips: 'LED strips', pattern: 'pattern', form: 'type', rig: 'lasers', complexity: 'beams', shape: 'sweep', fill: 'spread', contrast: 'intensity', density: 'haze', room: 'room', screen: 'screen', chase: 'chase', colors: 'colors', wall: 'screen level' } },
};
Object.assign(lasers, createLasersScene());
return lasers; // vjw: was `export default lasers;`
} // vjw: the factory
