// Copied from donor/vs3/visual_kit/src/lib/palette.js (the friends' engine, used with permission, 2026-11-19).
// vjw: stripped the edition.js import (the lite trim; edition.js also carries telemetry, never copied), the
// preset-guard.js import with setCustomPreset (custom palettes from files) and paletteFromImage (a DOM canvas). Kept:
// PRESETS (vs3/host.ts reads a scene's palette by name) and PaletteEngine (unused until a palette UI).
// App palette engine.
// Every scene draws from exactly five shared slots — bg, shadow, mid,
// accent, glow — mutated in place so a palette change recolors everything,
// including mid-morph. No scene invents its own colors.
import * as THREE from 'three';
import { PAL } from './common.js';

// Append-only: the ctl `palette` index is the array position + 1 and it
// lives in Live automation lanes, so new palettes go on the end and
// nothing ever reorders. `group` is display-only (the palette card's
// collapsible rows); keep `colors` right after `name`, check_manual.py
// reads the names with a shape-sensitive regex.
export const PRESETS = [
  { name: 'nocturne', colors: ['#05030a', '#140a2e', '#7b3ff2', '#2fd6a8', '#ffb46b'], group: 'classic' },
  { name: 'ember',    colors: ['#0a0405', '#2e0a0e', '#c2452f', '#ff9d45', '#ffe8c4'], group: 'classic' },
  { name: 'glacial',  colors: ['#030608', '#0a1c2e', '#2f6d9e', '#6fd0e0', '#eafcff'], group: 'classic' },
  { name: 'orchid',   colors: ['#0a0308', '#250a26', '#b03fa0', '#f27ab5', '#ffd9a8'], group: 'classic' },
  { name: 'moss',     colors: ['#040703', '#14260f', '#4f8f3a', '#b5d96b', '#f4ffd6'], group: 'classic' },
  { name: 'sodium',   colors: ['#060504', '#221a08', '#a87b1c', '#ffc93c', '#fff3d0'], group: 'classic' },
  { name: 'pearl',    colors: ['#060607', '#1c1c22', '#8a8a9e', '#cfcfe0', '#ffffff'], group: 'classic' },
  // bold: mid, accent, and glow sit in different hue families, so kicks
  // and highlights change color, not just level.
  { name: 'cobalt',   colors: ['#020410', '#0c2058', '#3f6fe0', '#ff9432', '#fff0d8'], group: 'bold' },
  { name: 'reef',     colors: ['#020707', '#083038', '#1fae9e', '#ff7a5c', '#ffe9c4'], group: 'bold' },
  { name: 'vapor',    colors: ['#050310', '#231043', '#e04fd0', '#3fd6ff', '#ffe0f4'], group: 'bold' },
  { name: 'oxide',    colors: ['#050303', '#291109', '#b5532a', '#3fc4a4', '#ffdfae'], group: 'bold' },
  { name: 'aurora',   colors: ['#020308', '#141038', '#8f54ff', '#38e08f', '#e4ffe9'], group: 'bold' },
  { name: 'velvet',   colors: ['#070312', '#260a44', '#7a3fd6', '#ffcf4a', '#ffefc0'], group: 'bold' },
  { name: 'acid',     colors: ['#030503', '#132808', '#7fe03f', '#e03fb0', '#f4ffd0'], group: 'bold' },
  { name: 'neon',     colors: ['#04030a', '#1c0f2e', '#ff3f6e', '#2fd6ff', '#fff0b0'], group: 'bold' },
  { name: 'mirage',   colors: ['#060408', '#1c1440', '#e05a8c', '#ffb35c', '#fff2d8'], group: 'bold' },
  // earth: quiet materials with one contrast note, so accents read as a
  // change of material rather than a color pop.
  { name: 'canyon',   colors: ['#050302', '#26120a', '#b0602f', '#8fc9a8', '#ffe2b8'], group: 'earth' },
  { name: 'adobe',    colors: ['#060302', '#2c1410', '#c96f4a', '#7f9eb0', '#ffe8cc'], group: 'earth' },
  { name: 'sage',     colors: ['#040504', '#1c2010', '#7f8f5a', '#d9b070', '#f7f0dc'], group: 'earth' },
  { name: 'umber',    colors: ['#050403', '#201207', '#7a4a22', '#d49a3f', '#f4e4c4'], group: 'earth' },
  // rainbow: the four lit slots span distant hue families, so scenes
  // that sweep the ramp pull a full spectrum out of five slots.
  { name: 'prism',    colors: ['#030309', '#2c0a54', '#1f8fe0', '#ff5a3c', '#ffe94a'], group: 'rainbow' },
  { name: 'carnival', colors: ['#060306', '#30104a', '#24c46a', '#ff4f7e', '#ffd94a'], group: 'rainbow' },
  { name: 'candy',    colors: ['#070409', '#3c1450', '#ff6fc4', '#4fd6ff', '#fff29e'], group: 'rainbow' },
  { name: 'tropic',   colors: ['#030503', '#0c3020', '#2fd66f', '#ff5a8c', '#ffe27a'], group: 'rainbow' },
];

const SLOTS = ['bg', 'shadow', 'mid', 'accent', 'glow'];
const MORPH_SECONDS = 1.8;

const HSL = { h: 0, s: 0, l: 0 };

export class PaletteEngine {
  constructor() {
    this.index = 0;
    this.progress = 1;
    this.from = SLOTS.map((s) => PAL[s].clone());
    this.to = SLOTS.map((s) => PAL[s].clone());
    // Hue drift's rotation of the whole palette, in turns. It used to be
    // added into the live slots frame by frame, so the offset existed
    // only as the sum of every frame since the last set() in that one
    // window, and two windows showing the same palette sat at unrelated
    // hues. As a number, windows can compare and exchange it
    // (PROTOCOL.md `phase`). A set() starts it over, which is what the
    // accumulated version did once a morph finished.
    this.hue = 0;
    this.sets = 0; // counts real changes, so callers can see a restart
    this.toHex = '';
  }
  get name() { return PRESETS[this.index].name; }
  // Setting the palette that is already the target is no change: its
  // morph and its hue drift carry on. A whole-look frame from another
  // window (randomize, reset, b) always carries the palette, and
  // restarting it there zeroed the hue drift in that window alone, so
  // the output's colors swung back while the editor's kept turning. A
  // photo palette with new colors is a change and restarts. `force`
  // restarts anyway, for a look that every window loads on its own (a
  // preset, a scene that brings its palette): its colors come back from
  // wherever hue drift turned them, in all the windows at once.
  set(i, { force = false } = {}) {
    if (typeof i === 'string') i = Math.max(0, PRESETS.findIndex((p) => p.name === i));
    // A look with no palette (undefined), a NaN off the wire or a
    // hand-edited file: keep what is showing. PRESETS[NaN] threw on
    // .colors and took the frame with it.
    if (typeof i !== 'number' || !Number.isFinite(i)) return;
    i = Math.round(i);
    const index = ((i % PRESETS.length) + PRESETS.length) % PRESETS.length;
    const hex = PRESETS[index].colors.join(',');
    if (!force && index === this.index && hex === this.toHex) return;
    this.index = index;
    this.toHex = hex;
    this.from = SLOTS.map((s) => PAL[s].clone());
    this.to = PRESETS[this.index].colors.map((c) => new THREE.Color(c));
    this.progress = 0;
    this.hue = 0;
    this.sets++;
  }
  next() { this.set(this.index + 1); }
  // Writes the five slots every frame: the morph (or its end state),
  // then the hue rotation on top.
  update(dt) {
    if (this.progress < 1) this.progress = Math.min(1, this.progress + dt / MORPH_SECONDS);
    const e = this.progress * this.progress * (3 - 2 * this.progress);
    SLOTS.forEach((s, i) => PAL[s].lerpColors(this.from[i], this.to[i], e));
    if (!this.hue) return;
    for (const s of SLOTS) {
      PAL[s].getHSL(HSL);
      PAL[s].setHSL((HSL.h + this.hue) % 1, HSL.s, HSL.l);
    }
  }
}
