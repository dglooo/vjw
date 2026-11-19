// Copied from donor/vs3/visual_kit/src/lib/context.js (the friends' engine, used with permission, 2026-11-19).
// vjw: verbatim; vs3/host.ts sets ctx.renderer to our three renderer (three/host.ts three()).
// Shared engine context — set by main.js so scenes that run their own
// render-to-texture passes (e.g. actual's melt simulation) can reach the
// renderer without circular imports.
// scenes: the roster, factoryPresets: the curated looks, and gpuFactor:
// the machine's speed against the reference, for a scene that draws
// another (main stage's LED wall). logo: the logo layer's uniforms
// (morphogen 2.0 grows a pattern in its shape); pickLogo opens a file
// picker that lands a logo.
export const ctx = { renderer: null, scenes: [], factoryPresets: {}, gpuFactor: () => 1, logo: null, pickLogo: null };
