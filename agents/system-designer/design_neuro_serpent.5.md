- Depth lives in the native's own framebuffer only; `renderTarget` (engine.ts L80) and the engine targets stay depth-less. Two AA modes, A/B'd at the spike. Mode M: two multisampled renderbuffers (RGBA16F, DEPTH_COMPONENT24), resolved by `blitFramebuffer` into a `renderTarget(true)`; about 15 raw WebGL2 lines. Mode S: one DEPTH_COMPONENT24 renderbuffer on that target (about 6 lines) + a 4-tap edge smooth in the composite, after the tone map. Both follow `f.width` / `f.height` and are deleted in `dispose`.
- ⚠️ Assumption, needs confirmation (mode M): Chrome (ANGLE) accepts MSAA on RGBA16F with EXT_color_buffer_float (engine.ts L22). The spike checks `getInternalformatParameter(RENDERBUFFER, RGBA16F, SAMPLES)`. Without the extension the format is RGBA8, as in `renderTarget` (engine.ts L81).
- Body draw: one ring buffer bound twice with a one-ring offset (divisor 1), so an instance is the segment between ring i and ring i+1 (the attribute pattern of lasers.ts L590-594). 192 x 24 x 2 = 9216 triangles, up to about 100 px² each at Groove scale.
- Frame order: clear colour + depth -> body -> core glow + particles (blend ONE, ONE on rgb; alpha untouched) -> restore the GL defaults (depth test off, cull off, depth mask on) -> blit (mode M) -> 1/4 box -> 1/8 blur (`BLUR` from isobars.ts, as lasers.ts L14) -> composite into the engine target (lasers.ts L602, L640-642).
- Composite: the fog background + glow band + shock ring (x `shock`), the body over them (premultiplied), + glow, the lasers max-channel tone map (lasers.ts L543-544), hash dither (L545-546).
- Tile mode (`size` given, scene.ts L11-12): 64 rings, mode S.
- Reuse: own code only (the lasers.ts pipeline, isobars.ts `BLUR`, view.ts, the `env()` structure of liquid-chrome.fs, the helix frame of wireform.ts L60-69). `NOISE` (webgl-noise, MIT) only if the haze noise is built. Not used: matcaps (no licence, research §4), TD snippets.

| Cost part (A) | Basis | Normal ms | Slow ms |
|---|---|---|---|
| Frame: clear + 1/8 chain + composite | b1 loud minus its thin beam fill (⚠️ the split is not measured) | 1.3-1.6 | 2.2-2.6 |
| Body FS: about 2x a b3 shader x coverage (Groove 26 %, cap 35 %) x overdraw <= 1.5 | b3 | 0.5-1.0 | 0.9-1.7 |
| MSAA 4x + depth + resolve (mode M) | none in the repo (⚠️ assumed) | 0.3-0.8 | 0.5-1.3 |
| Core glow + particles | b1 (thin fill) | <= 0.1 | <= 0.2 |
| **Total p95 at the drop, mode M** | | **2.2-3.5** | **3.7-5.8** |
| **Total, mode S** (edge smooth 0.1-0.2 ms slow instead of MSAA) | | **2.0-2.8** | **3.3-4.7** |

**Risks, ranked**
1. Budget in a slow session: mode M centre 4.7 ms, top 5.8 ms; mode S top 4.7 ms. The spike measures both first; the levers are in §4.
2. Look: an analytic studio has no self-reflection and can read as plastic or "1991" (creative §6). Mitigation: roughness contrast, tangent lobes, rim, HDR + glow. The S3 stills gate decides; architecture cannot fix it.
3. Edge quality: the MSAA resolve averages HDR samples before the tone map (WebGL2 has no custom resolve), so edges above about HDR 2x keep some stair-step. Mode S smooths after the tone map but softens the silhouette by about 1 px. The spike compares both on S7 and a 10 s clip.
4. GL state bleed: the first user of DEPTH_TEST, CULL_FACE, depthMask and READ_FRAMEBUFFER; every other native assumes the defaults (isobars.ts L489). Restore after the pass + one harness row: GL state diff = {} after `draw` (the camera K5 precedent, STATE Queue 2).
5. MSAA float support (the ⚠️ above). Fallback: mode S.
6. Lifecycle: renderbuffers are new GL objects. The lasers T-LC and T-CTX rows apply (create / dispose delta 0, context loss).
7. Frames: an RMF recomputed every frame can roll the far end when the curve changes (hence the mid-body anchor). A self-crossing in the whip renders as a clean intersection, not a pop.
- Effort: L (one file about the size of lasers.ts; the rig is about half of it). A second depth scene lifts the renderbuffer lines into `renderTarget` then, not now.
