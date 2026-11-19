// Copied from donor/vs3/visual_kit/src/scenes/limitless.js (the friends' engine, used with permission, 2026-11-19).
// vjw: a filter of our previous layer (vs3/host.ts `filter`): its source is that layer, shown as the donor shows a dropped clip (uFaithful); factory; marked below.
// Scene: Limitless — the image trip engine. A user photo/texture is the raw
// material; the `mode` setting picks the physics applied to it:
//   smear   — domain-warped liquid (the old mirage recipe)
//   melt    — feedback advection: the image dissolves into flow and every
//             kick re-stamps reality (runs its own ping-pong simulation)
//   droste  — log-polar infinite spiral: fall into the picture forever
//   shatter — voronoi fracture: kicks explode the image into glass cells,
//             quiet passages let it reassemble
//   prism   — spectral tearing: RGB channels ride separate warp paths
//   breathe — the realistic trip. Restraint is the recipe: the image
//             stays the image while it breathes slowly, its textures
//             crawl along their own contours, edges shimmy, chromatic
//             fringe rides the energy, and a strong accent occasionally
//             slides the frame toward recursion and back
//   mosh    — datamosh: motion in the source drags its own pixels into
//             smears (normal-flow accumulation in the sim ping-pong);
//             kicks snap a clean keyframe. Built for video and camera,
//             photos get a faint drifting smear instead
//   sort    — pixel-sort glitch: bright runs stretch into sorted
//             streaks down their columns; kicks re-cut the columns
//   coral   — reaction-diffusion (Gray-Scott) growing through the
//             image, bright zones feed the growth; kicks drop new
//             colonies on the golden angle
//   scanline— slit-scan time shear: each row refreshes at its own
//             lag and laggards slide sideways, motion shreds into
//             scans; kicks snap every row back to now
//   thresh  — screen-print posterize: the image's own colors slam
//             into flat bands with inked contours between them;
//             kicks knock the level count down for a beat
//   solar   — solarize: everything past a wandering threshold flips
//             negative; kicks widen the flipped zone
//   halftone— rotated dot screen, dots in the image's own colors;
//             kicks click the screen angle
//   vhs     — tape damage: tracking wobble, chroma bleed, speckle,
//             head-switch mess; kicks slam the tracking
//   none    — no physics at all: the plain source, full brightness,
//             a clean canvas for the lens rack, symmetry, and tiles
//   infinite— the infinity mirror: nested reflections recede toward
//             the center, each layer dimmer and closer to the
//             palette, neon frame at every boundary; kicks send a
//             light pulse diving down the tunnel. The shape slider
//             morphs the frame from rectangle to circle
//   corridor— one-point perspective hallway papered with the source;
//             corner seams glow, and kicks send the same light pulse
//             away down the hall
//   cube    — flying through closed rooms papered with the source;
//             the back wall approaches, lights up, and you pass
//             through it; kicks send the corridor light pulse
//   planet  — the picture wrapped on a turning sphere in the dark,
//             palette halo around it; kicks relight it from a new
//             bearing
//   windows — a wall of screens each holding the frame at its own
//             lag (per-cell sim); kicks snap every screen to now
// Cut 2026-08-22 on Alec's feel checks: wake, paint, edge, riso,
// dither, radial, depth, hall, monolith (and mosh went back to its
// smooth pre-macroblock form). A preset holding a cut mode name
// falls back to none.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { NOISE_GLSL } from '../lib/noise-glsl.js';
import { PAL, drastic } from '../lib/common.js';
import { ctx } from '../lib/context.js';
import { KickRise } from '../lib/kick-rise.js';

export default function create() { // vjw

// Display order is Alec's (2026-08-22): smear and droste lead, the
// spatial batch follows, everything else after. The shader branch
// index is pinned separately in MODE_IDX so reordering or cutting
// modes never renumbers GLSL branches again (a renumber blacked out
// corridor once). A mode name missing from MODE_IDX falls back to 0,
// none, which is also where presets holding cut modes land.
const MODES = ['none', 'smear', 'droste', 'infinite', 'corridor', 'cube', 'planet',
  'windows', 'melt', 'shatter', 'prism', 'terrain', 'breathe', 'mosh', 'sort', 'coral',
  'scanline', 'thresh', 'solar', 'halftone', 'vhs'];
const MODE_IDX = {
  none: 0, melt: 1, smear: 2, droste: 3, shatter: 4, prism: 5, terrain: 6, breathe: 7,
  mosh: 8, sort: 9, coral: 10, scanline: 11, thresh: 12, solar: 13, halftone: 14,
  vhs: 15, infinite: 16, corridor: 17, cube: 21, planet: 22, windows: 23,
};

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// vjw: defaultPhoto() stripped (a DOM canvas of random gradient blobs): the source is our previous layer.

function makeTexture(source) {
  // A video source (dropped clip or camera feed) gets a VideoTexture:
  // three re-uploads on every new decoded frame via
  // requestVideoFrameCallback, so a 30 fps clip costs 30 uploads a
  // second regardless of render rate. The instanceof guard keeps the
  // module drivable headlessly in Node, where HTMLVideoElement is absent.
  // The clip player (lib/clip-player.js, DXV and Motion JPEG) brings its
  // own texture and refreshes it as frames decode.
  const isVideo = typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
  const tex = source && source.isClipPlayer ? source.texture
    : isVideo ? new THREE.VideoTexture(source) : new THREE.Texture(source);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// The generated source the scene boots with, kept by reference so a
// photo drop can be taken back. defaultPhoto() is random per call, so
// regenerating would hand back a different picture than the one the
// scene booted with, and setPhoto disposes the outgoing texture, which
// on the first drop would destroy the only way back.
const defaultTex = new THREE.ExternalTexture(null); // vjw: was makeTexture(defaultPhoto()). The host points sourceTexture at our layer's texture each frame (`source` below); three binds it as is, never uploads or frees it

const uniforms = {
  uMode: { value: 0 },
  tSrc: { value: defaultTex },
  tSim: { value: null },
  uPhotoAspect: { value: 1 },
  uAspect: { value: 1 },
  uPhase: { value: 0 },
  uKick: { value: 0 },
  uSub: { value: 0 },
  uHighs: { value: 0 },
  uEnergy: { value: 0 },
  uShock: { value: 0 },
  uFall: { value: 0 },
  uTwist: { value: 0.4 },
  uBreak: { value: 0 },
  uSep: { value: 0.005 },
  uCells: { value: 8 },
  uComplex: { value: 1 },
  uFill: { value: 0.75 },
  uFit: { value: 0 },
  uBg: { value: PAL.bg },
  uContrast: { value: 0.5 },
  uWet: { value: 1 },
  uBreathe: { value: 0 },
  uCrawl: { value: 0.012 },
  uWobble: { value: 0.004 },
  uFringe: { value: 0.002 },
  uRecurse: { value: 0 },
  uFlipX: { value: 0 },
  uLive: { value: 0 },
  uFaithful: { value: 1 }, // vjw: was 0. Our layer is a dropped clip: its own exposure (setPhoto's path)
  uSeed: { value: 0 },
  uPulse: { value: -30 },
  uShape: { value: 0 },
  uAccent: { value: PAL.accent },
  uGlow: { value: PAL.glow },
};

const quad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    uniforms,
    depthWrite: false,
    depthTest: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: NOISE_GLSL + /* glsl */`
      uniform int uMode;
      uniform sampler2D tSrc, tSim;
      #define SRC(t) texture2D(tSrc, 1.0 - abs(1.0 - mod(t, 2.0))) // vjw: MirroredRepeatWrapping (our layer's texture clamps)
      uniform float uPhotoAspect, uAspect, uPhase, uKick, uSub, uHighs, uEnergy;
      uniform float uShock, uFall, uTwist, uBreak, uSep, uCells;
      uniform float uComplex, uFill, uFit, uContrast, uWet;
      uniform vec3 uBg;
      uniform float uBreathe, uCrawl, uWobble, uFringe, uRecurse;
      uniform float uFlipX, uLive, uFaithful, uSeed, uPulse, uShape;
      uniform vec3 uAccent, uGlow;
      varying vec2 vUv;

      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * snoise(p);
          p = p * 2.03 + vec3(1.7, 9.2, 4.1);
          a *= 0.5;
        }
        return v;
      }

      // uFlipX mirrors the source (camera feeds arrive selfie-style).
      vec2 fit(vec2 p) {
        p.x *= 1.0 - 2.0 * uFlipX;
        return p * vec2(1.0 / uPhotoAspect, 1.0) * uFill + 0.5;
      }
      // The photo itself. fit photo (uFit) clears the mirrored repeats
      // outside the picture to the background, so a photo that does not
      // match the window shows once, centered, instead of filling the
      // sides with flipped copies (Ross Anderson, 2026-11-01). The
      // repeats clear the moment fit leaves 0: cover leaves nothing
      // outside the photo there, so no copy ever shows while the photo
      // shrinks.
      vec4 src(vec2 p) {
        vec2 t = fit(p);
        vec2 o = max(-t, t - 1.0);
        float out1 = smoothstep(0.0, 0.004, max(o.x, o.y));
        return mix(SRC(t), vec4(uBg, 1.0), out1 * step(0.001, uFit));
      }
      float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
      vec2 hash2(vec2 p) {
        return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
      }

      // corridor and cube: the dry picture is a flat wall straight ahead
      // at depth zw. At wet 0 it sits at the frame (zw 1) and fills the
      // screen exactly as none shows it; as wet rises it recedes down
      // the hall, shrinking in perspective and taking the hall's fog,
      // until at wet 1 it is gone and the mode is unchanged. z is the
      // depth the mode's own walls have at this pixel.
      vec3 dryWall(vec3 col, vec2 qn, float z, vec2 uv, float wet) {
        if (wet >= 1.0) return col;
        float zw = 1.0 / max(1.0 - wet, 1e-3);
        if (max(abs(qn.x), abs(qn.y)) * zw > 1.0) return col;
        return src(uv * zw).rgb * exp(-(zw - 1.0) * 0.22);
      }

      // melt, scanline, windows: the sim already relaxes to the live
      // source as wet falls (uWet in the sim pass), but it runs at 0.6x
      // resolution, so over the bottom of the range the display hands
      // over to the full-resolution source. The two agree there apart
      // from sharpness, so this reads as the picture coming into focus,
      // and the mode's own motion carries the rest of the range.
      vec3 simShow(vec3 sim, vec2 uv, float wet) {
        return mix(src(uv).rgb, sim, smoothstep(0.0, 0.3, wet));
      }

      void main() {
        vec2 uv = (vUv - 0.5) * vec2(uAspect, 1.0);
        float r = length(uv);
        vec3 col;
        // dry/wet amount. Every mode scales its OWN effect by wet, so the
        // distortion grows in from the raw picture instead of the picture
        // dissolving under a finished frame (a buyer asked for exactly
        // this, 2026-10-26: automate 0 to 100 and watch reality bend).
        // wet 0 is the plain picture in every mode, exactly what none
        // shows; wet 1 is the full mode, unchanged. There is no crossfade
        // anywhere: warps scale their displacement, filters scale their
        // strength, the tunnels and rooms open out of the flat picture,
        // and the sim modes (melt, scanline, windows) relax toward the
        // live source through the sim's own uWet.
        float wet = clamp(uWet, 0.0, 1.0);

        if (uMode == 0) {
          // none: the plain source at full brightness. The whole point
          // is a clean canvas for the lens rack, symmetry, and tiles.
          col = src(uv).rgb;

        } else if (uMode == 1) {
          // melt: display the advection simulation
          col = simShow(texture2D(tSim, vUv).rgb, uv, wet);

        } else if (uMode == 2) {
          // smear
          vec3 P = vec3(uv * 1.3 * uComplex, uPhase);
          float q = fbm(P);
          float w = fbm(P + vec3(q * 1.4 * uComplex, q * 0.9, 0.4));
          float ripple = uShock * 0.12 * sin(r * 9.0 - uPhase * 40.0) * exp(-r * 1.2);
          vec2 duv = uv + wet * ((0.16 + uSub * 0.45 + uShock * 0.25) * vec2(q, w)
            + normalize(uv + 1e-4) * ripple
            - uv * uKick * 0.1 * exp(-r * 2.0));
          col = src(duv).rgb;
          col += wet * uAccent * exp(-abs(w) * 5.0) * (0.08 + 0.3 * uHighs);

        } else if (uMode == 3) {
          // droste: log-polar spiral into the image
          float L = 1.1;
          float lr = log(max(r, 1e-4));
          float ang = atan(uv.y, uv.x);
          float k = fract((lr + uFall) / L);
          // wet eases the spiral out of the flat picture: the radius
          // map and the twist both start at identity
          float rr = mix(r, exp(k * L) * 0.32, wet);
          float a2 = ang + lr * uTwist * wet;
          vec2 q = rr * vec2(cos(a2), sin(a2));
          q += wet * 0.02 * uComplex * vec2(
            snoise(vec3(q * 3.0, uPhase)),
            snoise(vec3(q * 3.0 + 7.0, uPhase)));
          col = src(q).rgb;
          col *= 1.0 - wet * 0.4 * (1.0 - smoothstep(0.0, 0.35, r));

        } else if (uMode == 4) {
          // shatter: voronoi cells fly apart on uBreak
          float cells = uCells;
          vec2 g = uv * cells;
          float f1 = 1e9, f2 = 1e9;
          vec2 bid = vec2(0.0);
          for (int dx = -1; dx <= 1; dx++)
          for (int dy = -1; dy <= 1; dy++) {
            vec2 cid = floor(g) + vec2(float(dx), float(dy));
            vec2 site = cid + hash2(cid);
            float d = length(g - site);
            if (d < f1) { f2 = f1; f1 = d; bid = cid; }
            else if (d < f2) { f2 = d; }
          }
          vec2 h = hash2(bid + 31.7) * 2.0 - 1.0;
          float rotA = wet * (hash2(bid + 57.3).x - 0.5) * (uBreak * 1.6 + sin(uPhase * 3.0 + bid.x + bid.y) * 0.25);
          vec2 ctr = (bid + 0.5) / cells;
          float cs = cos(rotA), sn = sin(rotA);
          vec2 local = ctr + mat2(cs, -sn, sn, cs) * (uv - ctr) - h * uBreak * 0.3 * wet;
          col = src(local).rgb;
          // the cracks draw in with wet, then the cells fly
          float border = mix(1.0, smoothstep(0.02, 0.14, f2 - f1), wet);
          col *= 0.3 + 0.7 * border;
          col += uGlow * (1.0 - border) * uBreak * 0.5;

        } else if (uMode == 7) {
          // breathe: the realistic trip. The image never stops being
          // the image; everything is small, slow, and tied to what the
          // picture already contains.
          // slow breathing: the center swells gently and settles
          vec2 buv = uv * (1.0 - wet * uBreathe * exp(-r * 0.8));
          // the image's own luminance gradient steers everything
          vec2 e2 = vec2(0.006, 0.0);
          vec2 g2 = vec2(
            luma(src(buv + e2.xy).rgb) - luma(src(buv - e2.xy).rgb),
            luma(src(buv + e2.yx).rgb) - luma(src(buv - e2.yx).rgb));
          float gm = length(g2);
          // pattern crawl: flow ALONG iso-luminance contours, phase
          // oscillates so the texture never walks away from itself
          vec2 tang = vec2(-g2.y, g2.x) / max(gm, 1e-4);
          float crawlPh = snoise(vec3(buv * 3.0 * uComplex, uPhase * 0.6));
          vec2 crawl = tang * uCrawl * crawlPh * smoothstep(0.005, 0.06, gm);
          // edge wobble: contours shimmy where contrast is high
          vec2 wob = vec2(
            snoise(vec3(buv * 6.0, uPhase * 0.8)),
            snoise(vec3(buv * 6.0 + 11.0, uPhase * 0.8)))
            * uWobble * smoothstep(0.01, 0.12, gm);
          vec2 duv = buv + (crawl + wob) * wet;
          // the occasional slide toward recursion and back
          vec2 fuv = mix(duv, duv * 0.62, uRecurse * wet);
          // chromatic fringe across the gradient, rides the energy
          vec2 fr = (g2 / max(gm, 1e-4)) * uFringe * wet;
          col.r = src(fuv + fr).r;
          col.g = src(fuv).g;
          col.b = src(fuv - fr).b;

        } else if (uMode == 8) {
          // mosh: the sim accumulates where the source moves; sampling
          // through that field drags the picture's own motion into
          // smears. Dispersion rides displacement like the lens rack.
          vec2 off = texture2D(tSim, vUv).rg * wet; // the drag eases in with wet
          float dm = length(off);
          vec2 dir = dm > 1e-5 ? off / dm : vec2(0.0);
          vec2 duv = uv + off;
          col.r = src(duv + dir * dm * 0.08).r;
          col.g = src(duv).g;
          col.b = src(duv - dir * dm * 0.08).b;
          col += uAccent * min(1.0, dm * 5.0) * (0.06 + 0.22 * uHighs);

        } else if (uMode == 9) {
          // sort: bright runs stretch into sorted streaks down their
          // columns. Threshold and cut points re-roll per kick (uSeed).
          float cols = 22.0 + 70.0 * clamp((uComplex - 0.3) / 1.5, 0.0, 1.0);
          float id = floor(vUv.x * cols);
          vec2 hh = hash2(vec2(id, uSeed));
          float th = 0.20 + 0.45 * hh.x;
          float dir = hh.y < 0.85 ? 1.0 : -1.0;
          float run = 0.0;
          vec3 mx = vec3(0.0);
          float mxl = -1.0;
          for (int i = 0; i < 24; i++) {
            vec2 q = uv + vec2(0.0, dir * float(i) * 0.016);
            vec3 sv = src(q).rgb;
            float l = luma(sv);
            if (l > th) {
              run += 1.0;
              if (l > mxl) { mxl = l; mx = sv; }
            } else { break; }
          }
          float stretch = run / 24.0 * wet; // the streaks pull longer with wet
          vec2 duv = uv + vec2(0.0, dir * stretch * (0.08 + 0.30 * uSub + 0.30 * uShock));
          col = src(duv).rgb;
          col = mix(col, mx, stretch * 0.55);
          col += uGlow * stretch * 0.10;

        } else if (uMode == 10) {
          // coral: the Gray-Scott pattern refracts the image and the
          // palette lights the growth crawling through it.
          float B = texture2D(tSim, vUv).g;
          vec2 e3 = vec2(0.004, 0.0);
          vec2 gB = vec2(
            texture2D(tSim, vUv + e3.xy).g - texture2D(tSim, vUv - e3.xy).g,
            texture2D(tSim, vUv + e3.yx).g - texture2D(tSim, vUv - e3.yx).g);
          // the growth refracts, darkens, and lights in with wet
          col = src(uv + gB * 0.4 * wet).rgb;
          B *= wet;
          col *= 1.0 - B * 0.5;
          col += uGlow * B * (0.25 + 0.55 * uHighs);
          col += uAccent * wet * smoothstep(0.06, 0.0, abs(B / max(wet, 1e-3) - 0.28)) * 0.18;

        } else if (uMode == 11) {
          // scanline: the sim holds the row-lagged frame; a faint
          // scan shimmer rides the highs.
          col = simShow(texture2D(tSim, vUv).rgb, uv, wet);
          col *= 1.0 - 0.06 * wet * (0.5 + 0.5 * sin(vUv.y * 900.0)) * uHighs;

        } else if (uMode == 12) {
          // thresh: screen-print posterize. Luminance slams into flat
          // bands while every pixel keeps its own hue, with an inked
          // contour where bands meet. Complexity sweeps the level
          // count; a kick knocks it toward two for a beat, the hard
          // poster snap.
          vec3 s = src(uv).rgb;
          float l = luma(s);
          float lv = floor(2.0 + clamp((uComplex - 0.3) / 1.5, 0.0, 1.0) * 5.0);
          lv = max(2.0, lv - floor(uShock * 3.0));
          // wet flattens each band from the picture's own ramp (wet 0 is
          // the tone as it is) to the poster's flat step, so the print
          // presses in without any band hopping
          float xl = l * lv;
          float ql = (floor(xl) + mix(fract(xl), 0.5, wet)) / lv;
          col = s * (ql / max(l, 1e-3));
          float band = fract(l * lv);
          float ew = fwidth(l * lv) * 1.5 + 1e-4;
          float line = 1.0 - smoothstep(0.0, ew, min(band, 1.0 - band));
          col *= 1.0 - line * 0.65 * wet;

        } else if (uMode == 13) {
          // solar: solarize. Everything past the threshold flips
          // negative; the threshold wanders slowly so the flipped
          // territory breathes, sub pulls it deeper, and a kick
          // widens the flip for a beat.
          vec3 s = src(uv).rgb;
          float th = 0.5 + 0.18 * sin(uPhase * 0.5) - uSub * 0.12 - uShock * 0.2;
          // wet lowers the threshold from above white, so the flip
          // creeps in from the highlights down
          th = mix(1.12, th, wet);
          vec3 m = smoothstep(th - 0.06, th + 0.06, s);
          col = mix(s, 1.0 - s, m);

        } else if (uMode == 14) {
          // halftone: a rotated dot screen, every dot carrying the
          // image's own color at its cell. Complexity is the pitch,
          // sub swells the dots, kicks click the screen angle.
          float pitch = mix(110.0, 40.0, clamp((uComplex - 0.3) / 1.5, 0.0, 1.0));
          float hAng = 0.26 + uSeed * 2.399963;
          float hc = cos(hAng), hs = sin(hAng);
          vec2 gp = mat2(hc, -hs, hs, hc) * uv * pitch;
          vec2 cellC = floor(gp) + 0.5;
          vec2 cuv = (mat2(hc, hs, -hs, hc) * cellC) / pitch;
          // wet quantizes the color to the cells and shrinks the dots out
          // of a solid fill (0.8 covers the whole cell), so the screen
          // opens up out of the plain picture
          vec3 s = src(mix(uv, cuv, wet)).rgb;
          float l = luma(s);
          float rdot = mix(0.8, sqrt(max(l, 0.0)) * 0.62 * (1.0 + uSub * 0.22), wet);
          float d = length(fract(gp) - 0.5);
          float m = 1.0 - smoothstep(rdot - 0.09, rdot + 0.03, d);
          col = s * m * (1.0 + 0.18 * wet);

        } else if (uMode == 15) {
          // vhs: tracking wobble, a scrolling tear band, chroma
          // bleeding sideways off a sharp luma, tape speckle, and the
          // head-switch mess at the bottom of the frame. Kicks slam
          // the tracking.
          float bandV = fract(vUv.y - uPhase * 0.11);
          float trackingB = smoothstep(0.0, 0.05, bandV) * (1.0 - smoothstep(0.07, 0.12, bandV));
          float wob = wet * sin(vUv.y * 700.0 + uPhase * 9.0) * 0.0012 * (1.0 + uSub * 2.0);
          float tear = wet * trackingB * (0.02 + uShock * 0.06)
            * (hash2(vec2(floor(vUv.y * 220.0), floor(uPhase * 7.0))).x - 0.3);
          vec2 vuv = uv + vec2(wob + tear, 0.0);
          vec3 sV = src(vuv).rgb;
          float y0 = luma(sV);
          // wet widens the chroma bleed from none, so the tape smears in
          vec2 bw = vec2(0.006 * wet, 0.0);
          vec3 cb = (src(vuv + bw).rgb
                   + src(vuv + 2.0 * bw).rgb
                   + src(vuv - bw).rgb) / 3.0;
          col = vec3(y0) + (cb - vec3(luma(cb))) * (1.0 + 0.15 * wet);
          float sp = hash2(floor(vUv * vec2(320.0, 240.0)) + floor(uPhase * 13.0)).x;
          col += vec3(step(0.996 - uHighs * 0.004, sp)) * 0.5 * wet;
          float hsw = step(vUv.y, 0.035 * wet);
          float hoff = 0.03 * hash2(vec2(floor(uPhase * 11.0), 2.0)).x;
          col = mix(col, src(vuv + vec2(hoff, 0.0)).rgb, hsw * 0.9);
          col = mix(col, col * 0.92 + 0.015, wet);

        } else if (uMode == 16) {
          // infinite: the infinity mirror. Box-nested reflections
          // recede toward the center, each layer dimmer and pulled
          // toward the palette, a neon frame at every boundary. This
          // exact form is the one Alec locked ("put it back"): the
          // translucent-pileup rework lost the look and was reverted.
          // Complexity tightens layer spacing, speed dives (uFall),
          // and a kick sends a light pulse down the tunnel (uPulse is
          // its depth in layers).
          // Depth is measured from the frame edge and stays put; only
          // the layer grid rides uFall, so the dive never darkens the
          // whole tunnel (uFall grows without bound).
          float kk = mix(0.86, 0.72, clamp((uComplex - 0.3) / 1.5, 0.0, 1.0));
          // shape morphs the frame: superellipse norm, 14 reads as a
          // crisp rectangle, 2 is a true circle (the sand plate trick).
          float nrm = mix(14.0, 2.0, clamp(uShape, 0.0, 1.0));
          float axn = abs(uv.x) / (0.5 * uAspect);
          float ayn = abs(uv.y) / 0.5;
          float bt = max(pow(pow(axn, nrm) + pow(ayn, nrm), 1.0 / nrm), 1e-4);
          float L = log(bt) / log(kk);
          float A = L + uFall;
          float li = floor(A);
          float lf = A - li;
          // wet scales each layer's zoom exponent from zero, so the
          // nested copies telescope out of the one flat picture
          vec2 suv = uv / pow(kk, (li - uFall) * wet);
          col = src(suv).rgb;
          float depth = max(L, 0.0) * wet;
          col *= pow(0.80, depth);
          col = mix(col, uAccent * luma(col) * 1.3, clamp(depth * 0.09, 0.0, 0.55));
          vec3 ink = mix(uGlow, uAccent, mod(li, 2.0)) * wet;
          col += ink * exp(-lf * 9.0) * (0.30 + 0.5 * uEnergy);
          col += ink * exp(-abs(L - uPulse) * 0.8) * 0.9;

        } else if (uMode == 17) {
          // corridor: one-point perspective hallway, the source
          // papering every wall. z runs away from the camera, a slow
          // sway keeps the eye human, corner seams glow, and kicks
          // send the same light pulse down the hall that infinite
          // uses (uPulse).
          vec2 qn = vec2(uv.x / (0.5 * uAspect), uv.y / 0.5);
          qn.x += sin(uPhase * 0.4) * 0.06 * wet;
          float ax2 = max(abs(qn.x), 1e-3);
          float ay2 = max(abs(qn.y), 1e-3);
          bool sideWall = ax2 > ay2;
          float z = 1.0 / max(sideWall ? ax2 : ay2, 1e-3);
          float across = (sideWall ? qn.y : qn.x) * z;
          float along = z * 0.35 + uFall;
          float acrossT = mix(across * 0.5 + 0.5, 0.5 - across * 0.5, uFlipX);
          col = SRC(vec2(along, acrossT)).rgb;
          col *= exp(-max(z - 1.0, 0.0) * 0.22);
          float seam = 1.0 - smoothstep(0.0, 0.10, abs(ax2 - ay2));
          col += uAccent * seam * (0.10 + 0.25 * uEnergy);
          vec3 inkC = mix(uGlow, uAccent, mod(floor(along), 2.0));
          col += inkC * exp(-abs(z * 0.35 - uPulse * 0.6) * 1.6) * 0.7;
          col = dryWall(col, qn, z, uv, wet);

        } else if (uMode == 21) {
          // cube: flying through closed rooms. The side walls run
          // like the corridor; the back wall approaches, lights up as
          // you reach it, and you pass through into the next room.
          vec2 qn = vec2(uv.x / (0.5 * uAspect), uv.y / 0.5);
          float ax3 = max(abs(qn.x), 1e-3);
          float ay3 = max(abs(qn.y), 1e-3);
          float zSide = 1.0 / max(max(ax3, ay3), 1e-3);
          float roomLen = 2.2;
          float backZ = roomLen * (1.0 - fract(uFall * 0.45)) + 0.35;
          vec3 inkB = mix(uGlow, uAccent, mod(floor(uFall * 0.45), 2.0));
          if (backZ < zSide) {
            vec2 suv = qn * backZ * 0.5;
            col = src(suv).rgb * exp(-(backZ - 0.35) * 0.45);
          } else {
            bool sideWall = ax3 > ay3;
            float across = (sideWall ? qn.y : qn.x) * zSide;
            float along = zSide * 0.35 + uFall;
            float acrossT = mix(across * 0.5 + 0.5, 0.5 - across * 0.5, uFlipX);
            col = SRC(vec2(along, acrossT)).rgb * exp(-max(zSide - 1.0, 0.0) * 0.25);
          }
          col += inkB * exp(-(backZ - 0.35) * 9.0) * 0.5 * wet;
          col += inkB * exp(-abs(zSide * 0.35 - uPulse * 0.6) * 1.6) * 0.55;
          col = dryWall(col, qn, zSide, uv, wet);

        } else if (uMode == 22) {
          // planet: the picture wrapped on a turning sphere, lit from
          // a bearing each kick moves, palette halo and a dust of
          // stars around it. Sub breathes the radius.
          // wet is the curvature: at 0 the sphere is infinitely large and
          // its surface IS the flat picture (arc length equals screen
          // distance); as wet rises the picture bends around a smaller
          // and smaller ball until it is the planet. uFall here is the
          // spin, which the JS side homes to a seamless turn as wet
          // falls, so the dry end lands on the unrotated picture.
          float R = 0.42 * (1.0 + uSub * 0.08);
          // (floored at 0.05: GPU asin/atan lose their relative precision
          // near zero, and at 0.05 the bulge is 0.2% at the frame edge)
          float kap = max(wet, 0.05) / R;
          vec2 p2 = uv * kap;
          float rr2 = dot(p2, p2);
          if (rr2 < 1.0) {
            float z2 = sqrt(1.0 - rr2);
            vec2 arc = vec2(atan(p2.x, z2), asin(clamp(p2.y, -1.0, 1.0))) / kap;
            arc = mix(uv, arc, smoothstep(0.0, 0.05, wet)); // exact at dry
            vec2 sc = mix(vec2(uFill / uPhotoAspect, uFill),
                          vec2(0.5 / (3.14159 * R), 1.0 / (3.14159 * R)), wet);
            float lon = arc.x * sc.x + uFall * 0.15;
            float u2 = mix(lon + 0.5, 0.5 - lon, uFlipX);
            col = SRC(vec2(u2, arc.y * sc.y + 0.5)).rgb;
            float bear = uSeed * 2.399963;
            vec3 nrm3 = vec3(p2.x, p2.y, z2);
            vec3 key = normalize(vec3(cos(bear), 0.45, sin(bear)));
            float diff = clamp(dot(nrm3, key), 0.0, 1.0);
            col *= mix(1.0, 0.18 + 1.05 * diff, wet);
            col += uAccent * pow(1.0 - z2, 3.0) * (0.2 + 0.4 * uEnergy) * wet;
          } else {
            float rlen = sqrt(rr2);
            col = uAccent * exp(-(rlen - 1.0) * 7.0) * (0.12 + 0.25 * uEnergy);
          }

        } else if (uMode == 23) {
          // windows: a wall of screens, each holding the frame at its
          // own lag (the sim keeps per-cell time). Dark bezels, a
          // glow line, and kicks snap every screen to now through the
          // sim's uStamp.
          vec2 wgrid = vec2(9.0, 6.0);
          vec2 gpw = vUv * wgrid;
          vec2 cw = fract(gpw);
          // wet opens the bezels from nothing (the sim's per-screen lag
          // grows in with it too)
          vec2 inset = (cw - 0.5) * (1.0 + 0.12 * wet) + 0.5;
          // the gap between screens is antialiased: cov is the share of
          // the pixel that falls outside the gap (box filter over the
          // band hb either side of each cell boundary), so as wet opens
          // the bezels they grow smoothly instead of stepping a pixel row
          // at a time, and at wet 0 the gap has no width at all
          vec2 pxw = max(fwidth(gpw), vec2(1e-5));
          float hb = 0.5 * (1.0 - 1.0 / (1.0 + 0.12 * wet));
          vec2 db = min(cw, 1.0 - cw);
          vec2 gf = clamp((min(db + 0.5 * pxw, vec2(hb)) - max(db - 0.5 * pxw, vec2(-hb))) / pxw, 0.0, 1.0);
          float cov = (1.0 - gf.x) * (1.0 - gf.y);
          vec2 suv = (floor(gpw) + clamp(inset, 0.0, 1.0)) / wgrid;
          col = simShow(texture2D(tSim, suv).rgb, (suv - 0.5) * vec2(uAspect, 1.0), wet) * cov;
          float bez = smoothstep(0.0, 0.045, min(min(cw.x, 1.0 - cw.x), min(cw.y, 1.0 - cw.y)));
          col *= mix(1.0, bez, wet);
          float gl = 1.0 - smoothstep(0.03, 0.09, min(min(cw.x, 1.0 - cw.x), min(cw.y, 1.0 - cw.y)));
          col += uAccent * gl * (0.05 + 0.15 * uEnergy) * wet;

        } else {
          // prism: RGB channels tear apart along the image's own edges
          vec2 e = vec2(0.005, 0.0);
          vec2 grad = vec2(
            luma(src(uv + e.xy).rgb) - luma(src(uv - e.xy).rgb),
            luma(src(uv + e.yx).rgb) - luma(src(uv - e.yx).rgb));
          vec2 disp = grad * uSub * 0.9 * uComplex
            + 0.02 * uComplex * vec2(snoise(vec3(uv * 2.0, uPhase)), snoise(vec3(uv * 2.0 + 5.0, uPhase)));
          vec2 sep = vec2(uSep, uSep * 0.6);
          disp *= wet; sep *= wet; // the channel tear grows in with wet
          col.r = src(uv + disp + sep).r;
          col.g = src(uv + disp).g;
          col.b = src(uv + disp - sep).b;
        }

        // The photo keeps its own colors: never remap the image toward
        // PAL here. The palette rides only the additive accents above.
        // (A riso print mode broke this rule deliberately for one day
        // in 2026-08 and was cut on feel; the rule stands.)
        // A live source (camera) holds a normal-exposure baseline at
        // rest so the feed reads like a camera app before the music
        // takes hold; generated content keeps the full energy sweep. A
        // dialed-down dry/wet is the raw picture too, which the none mode
        // holds at full brightness, so lift toward that baseline as wet
        // falls and the dry image never sinks into the energy sweep.
        // A photo or clip someone dropped (uFaithful) keeps its own
        // exposure outright: no energy sweep and no edge falloff, so it
        // shows exactly as the file. The music still drives
        // the mode and the accents on top.
        float liveF = max(max(uLive, uMode == 0 ? 1.0 : 0.0), 1.0 - wet);
        col *= mix(mix(0.55 + 0.75 * uEnergy, 1.0 + 0.22 * uEnergy, liveF), 1.0, uFaithful);
        vec3 hi = col * col * (3.0 - 2.0 * col);
        vec3 lo = pow(max(col, 0.0), vec3(0.72));
        col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.6);
        col = mix(col, lo, max(0.0, 0.5 - uContrast) * 1.6);
        col *= 1.0 - 0.2 * (1.0 - uFaithful) * smoothstep(0.6, 1.15, r);
        gl_FragColor = vec4(clamp(col, 0.0, 1.15), 1.0);
      }`,
  })
);
scene.add(quad);

// --- the sim ping-pong (melt advection / mosh flow / coral growth) ----
// One pair of targets serves all three sim modes; only one runs at a
// time and a mode switch re-seeds (stamp), so they can share state.
const simUniforms = {
  tPrev: { value: null },
  tSrc: { value: uniforms.tSrc.value },
  uPhotoAspect: { value: 1 },
  uAspect: { value: 1 },
  uPhase: { value: 0 },
  uFlow: { value: 1 },
  uStamp: { value: 1 },
  uFill: { value: 0.75 },
  uFit: { value: 0 },
  uBg: { value: PAL.bg },
  uFlipX: { value: 0 },
  uSimMode: { value: 0 },
  uFaithful: { value: 1 }, // vjw: was 0. Our layer is a dropped clip: its own exposure (setPhoto's path)
  uWet: { value: 1 },
  uSimRes: { value: new THREE.Vector2(1, 1) },
  uSplat: { value: new THREE.Vector3(0, 0, 0) },
};
const simQuad = new FullScreenQuad(new THREE.ShaderMaterial({
  uniforms: simUniforms,
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tPrev, tSrc;
    #define SRC(t) texture2D(tSrc, 1.0 - abs(1.0 - mod(t, 2.0))) // vjw: MirroredRepeatWrapping (our layer's texture clamps)
    uniform float uPhotoAspect, uAspect, uPhase, uFlow, uStamp, uFill, uFit, uFlipX, uFaithful, uWet;
    uniform int uSimMode;
    uniform vec2 uSimRes;
    uniform vec3 uSplat, uBg;
    varying vec2 vUv;
    vec2 fitS(vec2 p) {
      p.x *= 1.0 - 2.0 * uFlipX;
      return p * vec2(1.0 / uPhotoAspect, 1.0) * uFill + 0.5;
    }
    // The photo itself. fit photo (uFit) clears the mirrored repeats
    // outside the picture to the background, so a photo that does not
    // match the window shows once, centered, instead of filling the
    // sides with flipped copies (Ross Anderson, 2026-11-01).
    vec4 srcS(vec2 p) {
      vec2 t = fitS(p);
      vec2 o = max(-t, t - 1.0);
      float out1 = smoothstep(0.0, 0.004, max(o.x, o.y));
      return mix(SRC(t), vec4(uBg, 1.0), out1 * step(0.001, uFit));
    }
    float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
      vec2 fl = vec2(
        sin(p.y * 3.1 + uPhase * 1.3) + 0.6 * cos(p.x * 4.7 - uPhase),
        sin(p.x * 3.7 - uPhase) + 0.6 * cos(p.y * 4.1 + uPhase * 0.8));

      if (uSimMode == 0) {
        // melt: advect history toward the flow, stamp the source in.
        // The history fades a little each frame, which settles the
        // picture near 45% of the source; a dropped file holds its own
        // brightness instead (uFaithful), so it melts without sinking.
        // Dry/wet: the flow scales with wet and the re-stamp rises as wet
        // falls, so a dry melt holds the live source and the dissolve
        // grows in as wet comes up.
        float dry = 1.0 - uWet;
        vec3 prev = texture2D(tPrev, vUv - fl * 0.0016 * uFlow * uWet).rgb
          * mix(0.997, 1.0, max(uFaithful, dry));
        vec3 src = srcS(p).rgb;
        gl_FragColor = vec4(mix(prev, src, min(1.0, uStamp * 0.35 + 0.0025 + dry * dry * 0.6)), 1.0);

      } else if (uSimMode == 1) {
        // mosh: normal-flow accumulation, per-texel and smooth (the
        // macroblock version was tried and cut on feel). rg holds the
        // displacement field, b remembers last frame's luminance.
        // Where the source moves, flow builds and drags; a kick zeroes
        // the field, the clean keyframe. A whisper of the melt flow
        // keeps photos faintly alive.
        vec4 prev = texture2D(tPrev, vUv);
        float ln = lum(srcS(p).rgb);
        vec2 e = vec2(0.006, 0.0);
        vec2 g = vec2(
          lum(srcS(p + e.xy).rgb) - lum(srcS(p - e.xy).rgb),
          lum(srcS(p + e.yx).rgb) - lum(srcS(p - e.yx).rgb));
        float It = ln - prev.b;
        vec2 v = -It * g / (dot(g, g) + 0.015);
        vec2 off = prev.rg * 0.985
          + clamp(v, vec2(-0.06), vec2(0.06)) * uFlow * 0.35
          + fl * 0.00035 * uFlow;
        off *= 1.0 - uStamp;
        off = clamp(off, vec2(-0.45), vec2(0.45));
        gl_FragColor = vec4(off, ln, 1.0);

      } else if (uSimMode == 4) {
        // scanline: slit-scan time shear. Each row blends toward the
        // live frame at its own hashed rate, so laggard rows carry
        // the past and motion smears into scans. The lag deal slowly
        // re-shuffles with phase; a kick (uStamp) snaps every row to
        // now.
        float row = floor(vUv.y * 220.0);
        float hr = fract(sin(row * 127.1 + floor(uPhase * 0.13) * 311.7) * 43758.5453);
        float rate = mix(1.0, mix(0.03, 1.0, pow(hr, 2.2)), uWet); // dry rows are live
        // Laggard rows also slide sideways as they age, alternating
        // direction by row, so held scans shear like a broken feed
        // instead of just freezing in place.
        float dir = mod(row, 2.0) < 1.0 ? 1.0 : -1.0;
        vec2 slide = vec2(dir * (1.0 - rate) * 0.0009 * uFlow, 0.0);
        vec3 srcC = srcS(p).rgb;
        vec3 prev = texture2D(tPrev, vUv - slide).rgb;
        vec3 col = mix(prev, srcC, clamp(rate + uStamp, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);

      } else if (uSimMode == 6) {
        // windows: per-cell time. Each screen blends toward the live
        // frame at its own hashed rate, re-dealt slowly with phase; a
        // kick (uStamp) snaps every screen to now.
        vec2 cellW = floor(vUv * vec2(9.0, 6.0));
        float hw = fract(sin(dot(cellW, vec2(127.1, 311.7)) + floor(uPhase * 0.09) * 17.0) * 43758.5453);
        float rateW = mix(1.0, mix(0.02, 1.0, pow(hw, 2.4)), uWet); // dry screens are live
        vec3 srcW = srcS(p).rgb;
        vec3 prevW = texture2D(tPrev, vUv).rgb;
        gl_FragColor = vec4(mix(prevW, srcW, clamp(rateW + uStamp, 0.0, 1.0)), 1.0);

      } else {
        // coral: Gray-Scott. r is chemical A, g is the pattern B; the
        // image's brightness steers the feed rate so growth follows
        // the picture. uStamp re-seeds sparse colonies, uSplat drops
        // one on a kick.
        vec2 px = 1.0 / uSimRes;
        vec4 c = texture2D(tPrev, vUv);
        vec4 lap = -c;
        lap += 0.2 * (texture2D(tPrev, vUv + vec2(px.x, 0.0)) + texture2D(tPrev, vUv - vec2(px.x, 0.0))
                    + texture2D(tPrev, vUv + vec2(0.0, px.y)) + texture2D(tPrev, vUv - vec2(0.0, px.y)));
        lap += 0.05 * (texture2D(tPrev, vUv + px) + texture2D(tPrev, vUv - px)
                     + texture2D(tPrev, vUv + vec2(px.x, -px.y)) + texture2D(tPrev, vUv - vec2(px.x, -px.y)));
        float srcL = lum(srcS(p).rgb);
        float F = mix(0.026, 0.058, clamp(srcL, 0.0, 1.0));
        float K = 0.060;
        float A = c.r;
        float B = c.g;
        float ABB = A * B * B;
        A += (1.0 * lap.r - ABB + F * (1.0 - A)) * 0.9;
        B += (0.5 * lap.g + ABB - (K + F) * B) * 0.9;
        if (uStamp > 0.5) {
          vec2 cell = floor(vUv * 24.0);
          float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
          if (h > 0.965) B = max(B, 0.5);
          A = max(A, 1.0 - B);
        }
        float d = length(p - uSplat.xy);
        B += uSplat.z * exp(-d * d * 320.0) * 0.6;
        gl_FragColor = vec4(clamp(A, 0.0, 1.0), clamp(B, 0.0, 1.0), srcL, 1.0);
      }
    }`,
}));
let simA = null;
let simB = null;

// --- terrain sub-scene (image luminance → endless heightfield) ---------
const terrainScene = new THREE.Scene();
terrainScene.background = PAL.bg;
terrainScene.fog = null;
const terrainCam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
terrainCam.position.set(0, 2.4, 6.5);
terrainCam.lookAt(0, 0.4, -8);

const terrainUniforms = {
  tSrc: { value: uniforms.tSrc.value },
  uPhotoAspect: { value: 1 },
  uScroll: { value: 0 },
  uAmp: { value: 2.0 },
  uDetail: { value: 0.3 },
  uRipplePos: { value: -1 },
  uRippleAmt: { value: 0 },
  uHighs: { value: 0 },
  uEnergy: { value: 0 },
  uContrast: { value: 0.5 },
  uFlipX: { value: 0 },
  uLive: { value: 0 },
  uFaithful: { value: 1 }, // vjw: was 0. Our layer is a dropped clip: its own exposure (setPhoto's path)
  uAccent: { value: PAL.accent },
  uBgCol: { value: PAL.bg },
};

const terrainMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(34, 18, 220, 140),
  new THREE.ShaderMaterial({
    uniforms: terrainUniforms,
    vertexShader: NOISE_GLSL + /* glsl */`
      uniform sampler2D tSrc;
      #define SRC(t) texture2D(tSrc, 1.0 - abs(1.0 - mod(t, 2.0))) // vjw: MirroredRepeatWrapping (our layer's texture clamps)
      uniform float uScroll, uAmp, uDetail, uRipplePos, uRippleAmt, uPhotoAspect, uFlipX;
      varying vec2 vWuv;
      varying vec3 vWorld;
      varying float vH;
      varying float vFar;
      void main() {
        vec2 tuv = vec2(mix(uv.x, 1.0 - uv.x, uFlipX), uv.y);
        vec2 wuv = tuv * vec2(1.6 / max(uPhotoAspect, 0.4), 2.2) + vec2(0.0, uScroll);
        vWuv = wuv;
        vFar = uv.y;
        vec3 tex = SRC(wuv).rgb;
        float h = dot(tex, vec3(0.299, 0.587, 0.114));
        h += uDetail * snoise(vec3(wuv * 7.0, uScroll * 3.0)) * 0.5;
        // Kick ripple: a wave rolling from the horizon toward the camera.
        h += uRippleAmt * 0.6 * exp(-pow((uv.y - uRipplePos) * 9.0, 2.0));
        vec3 p = position;
        p.z += h * uAmp;
        vH = h;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tSrc;
      #define SRC(t) texture2D(tSrc, 1.0 - abs(1.0 - mod(t, 2.0))) // vjw: MirroredRepeatWrapping (our layer's texture clamps)
      uniform float uHighs, uEnergy, uContrast, uLive, uFaithful;
      uniform vec3 uAccent, uBgCol;
      varying vec2 vWuv;
      varying vec3 vWorld;
      varying float vH;
      varying float vFar;
      void main() {
        vec3 col = SRC(vWuv).rgb;

        // Faceted lighting from screen-space derivatives.
        vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (N.y < 0.0) N = -N;
        float diff = clamp(dot(N, normalize(vec3(0.35, 0.8, 0.45))), 0.0, 1.0);
        col *= 0.3 + 0.9 * diff;

        // The photo keeps its own colors here too: the landscape is the
        // image, palette-true only in the ridge light and the fog.
        // Ridge light: peaks catch the highs.
        col += uAccent * smoothstep(0.55, 1.0, vH) * (0.1 + 0.5 * uHighs);

        col *= mix(mix(0.5 + 0.8 * uEnergy, 0.95 + 0.25 * uEnergy, uLive), 1.0, uFaithful);
        vec3 hi = col * col * (3.0 - 2.0 * col);
        vec3 lo = pow(max(col, 0.0), vec3(0.72));
        col = mix(col, hi, max(0.0, uContrast - 0.5) * 1.6);
        col = mix(col, lo, max(0.0, 0.5 - uContrast) * 1.6);

        // Fog into the horizon.
        col = mix(col, uBgCol, smoothstep(0.55, 1.0, vFar));
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
terrainMesh.rotation.x = -Math.PI / 2;
terrainMesh.position.set(0, 0, -2);
terrainMesh.frustumCulled = false;
terrainScene.add(terrainMesh);

let scroll = 0;
let ripplePos = -1;
let rippleAmt = 0;

function ensureSim(renderer) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2()).multiplyScalar(0.6).floor();
  // A hidden pane's degenerate drawing buffer floors to 0x0 here, and a
  // 0x0 target is an incomplete framebuffer: every sim pass errors.
  size.x = Math.max(1, size.x); size.y = Math.max(1, size.y);
  if (simA && simA.width === size.x && simA.height === size.y) return;
  if (simA) { simA.dispose(); simB.dispose(); }
  const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
  simA = new THREE.WebGLRenderTarget(size.x, size.y, opts);
  simB = new THREE.WebGLRenderTarget(size.x, size.y, opts);
  simUniforms.uSimRes.value.set(size.x, size.y);
  stampR.set(1.5); // re-seed the sim with the source image
}

let phase = 0;
let shock = 0;
let stamp = 1.5;
let fall = 0;
let twist = 0.4;
let twistMid = 0.4;
let twistTarget = 0.4;
let breakEnv = 0;
let sepBurst = 0;
// The kick responses that move the picture rise over KICK_ATTACK
// (lib/kick-rise.js) instead of landing in one frame, to the same peak
// the instant hit reached. The same attack shapes s.kick for this scene
// in main.js (kickAttack below), which carries the glow, the trails'
// zoom, the fringe and the lens kick.
const KICK_ATTACK = 0.08;
const shockR = new KickRise();
const stampR = new KickRise();
stampR.set(1.5);
const breakR = new KickRise();
const sepR = new KickRise();
const splatR = new KickRise();
const rippleR = new KickRise();
// breathe state: a slow lung, and a rare recursion slide. The slide is
// accent-gated with a LONG rest so it stays an occasion, not a tic.
let lungPhase = 0;
let recurse = 0;
let recurseTgt = 0;
let lastSlide = -30;
// sort re-cuts its columns per kick; coral drops a colony on the
// golden angle per kick; the sim tracks which mode owns its state.
let sortSeed = 0;
let pulseDepth = -30; // infinite's traveling light; parked far below zero
// planet's spin. It turns at the shared fall rate, and below wet 0.35
// it rolls home to the nearest seamless turn (the texture repeats
// mirrored every 2 in u, so 2/0.15 in spin), so a dry planet lands on
// the unrotated picture instead of a sideways-shifted one.
let spin = 0;
const SPIN_PERIOD = 2 / 0.15;
let splatAng = 0;
const splat = { x: 0, y: 0, amt: 0 };
let simOwner = -1;
// The source the sim was last seeded from (a new one re-seeds it).
let simSrc = null;

const limitless = {
  name: 'limitless',
  scene,
  camera,
  bloom: { strength: 0.3, gain: 0.35 },
  // seconds for s.kick to rise to its peak here (main.js shapes it with
  // KickRise before this scene and the global fx read it)
  kickAttack: KICK_ATTACK,
  modes: MODES,
  sortModes: true, // the panel dropdown lists none, then A to Z
  params: { mode: 'melt', speed: 0.5, shape: 0, complexity: 0.5, density: 1, fill: 0.1875, edge: 0, contrast: 0.5, tilt: 1 }, // vjw: fill was .5 (a photo's 1.33x cover); .1875 = size 1, our layer 1:1
  source: defaultTex, // vjw: the host feeds it the previous layer
  // density is repurposed as "dry/wet": the amount of effect over the raw
  // source (uWet). It rides the whole standard-param rack (panel, macro
  // caption, preset) the way sand repurposes density as "grains". Default
  // 1 keeps every existing look at the full effect. shape only does
  // something in infinite (the rect-to-circle morph), and dry/wet does
  // nothing in none (already the raw source) or terrain (a 3D flyover with
  // no flat image to fade to); those hide, per the dead-slider rule.
  // complexity greys out where nothing reads it: no uComplex, uCrawl, uTwist,
  // uSep, uCells, uDetail or sim uFlow on those branches (Johno, 10-11).
  paramLabels: {
    '*': { shape: null, density: 'scene dry/wet', edge: 'fit photo', tilt: 'tune dry/wet' },
    infinite: { shape: 'shape' },
    none: { density: null, complexity: null },
    terrain: { density: null, edge: null },
    coral: { complexity: null },
    solar: { complexity: null },
    vhs: { complexity: null },
    corridor: { complexity: null, edge: null },
    cube: { complexity: null, edge: null },
    planet: { complexity: null, edge: null },
    windows: { complexity: null },
  },
  // dry/wet reads as a master amount over the mode, so it sits at the
  // BOTTOM of the scene sliders (Alec 2026-08-25), below the per-mode
  // dials. tilt carries the tune panel's own dry/wet (lane "Tilt"): the
  // scene's dry/wet (density) and the tune panel's amount are separate, so
  // the plain picture can sit under a full tune panel (Alec 2026-11-11).
  paramOrder: ['speed', 'shape', 'complexity', 'fill', 'edge', 'contrast', 'density', 'tilt'],
  // QA: recursion gate state for the breathe mode
  _breatheQA() { return { recurse, recurseTgt, lastSlide, lung: lungPhase }; },
  // QA: the kick-driven envelopes as the shader sees them this frame
  _kickQA() {
    return { shock, stamp, breakEnv, sepBurst, twist, splat: splat.amt, kick: uniforms.uKick.value };
  },
  // Accepts an image, a canvas, or a live video element (dropped clip
  // or camera feed); every mode reads tSrc fresh each frame, so a
  // moving source flows through the whole rack unchanged. mirror flips
  // the source selfie-style (camera feeds), live holds a
  // normal-exposure baseline at rest instead of the full energy sweep.
  // Anything else is a dropped photo or clip, which keeps its own
  // exposure (faithfulSource below).
  setPhoto(img, { mirror = false, live = false } = {}) {
    const old = uniforms.tSrc.value;
    const tex = makeTexture(img);
    // A dropped file is sampled as the 8-bit values it holds, the way a
    // browser shows it. Decoded to linear light (the camera's path) and
    // never encoded back, mid-gray 128 left the chain at 55: every photo
    // read 2.3 times too dark in the mids, before any exposure moved.
    // The camera's own window samples its 8-bit values too: three
    // uploads a VideoTexture as plain RGBA8 whatever its color space,
    // and this shader never decodes it. A window following that camera
    // (lib/camlink.js) draws the frames into a canvas, and a canvas
    // marked sRGB uploads as SRGB8_ALPHA8, which the GPU decodes to
    // linear: the Output window read the camera at mean 78 where the
    // camera's window read 117, and its exposure servo pushed the dark
    // picture into saturated color (2026-11-14). So any source that is
    // not a video element reads raw, the way the camera's window reads.
    if (!live || !tex.isVideoTexture) tex.colorSpace = THREE.NoColorSpace;
    uniforms.tSrc.value = tex;
    simUniforms.tSrc.value = tex;
    terrainUniforms.tSrc.value = tex;
    const asp = (img.videoWidth || img.width || 1) / (img.videoHeight || img.height || 1);
    uniforms.uPhotoAspect.value = asp;
    simUniforms.uPhotoAspect.value = asp;
    terrainUniforms.uPhotoAspect.value = asp;
    uniforms.uFlipX.value = mirror ? 1 : 0;
    simUniforms.uFlipX.value = mirror ? 1 : 0;
    terrainUniforms.uFlipX.value = mirror ? 1 : 0;
    uniforms.uLive.value = live ? 1 : 0;
    terrainUniforms.uLive.value = live ? 1 : 0;
    uniforms.uFaithful.value = live ? 0 : 1;
    simUniforms.uFaithful.value = live ? 0 : 1;
    terrainUniforms.uFaithful.value = live ? 0 : 1;
    stampR.set(1.5);
    if (old && old !== defaultTex) old.dispose();
  },

  // Take back a photo drop: the scene returns to its generated source.
  // The counterpart to clearEmblem, which limitless never had, so a
  // dropped photo was permanent until the window reloaded. Idempotent;
  // returns whether anything changed so callers can skip their own
  // cleanup on a no-op.
  clearPhoto() {
    const old = uniforms.tSrc.value;
    if (old === defaultTex) return false;
    uniforms.tSrc.value = defaultTex;
    simUniforms.tSrc.value = defaultTex;
    terrainUniforms.tSrc.value = defaultTex;
    uniforms.uPhotoAspect.value = 1;
    simUniforms.uPhotoAspect.value = 1;
    terrainUniforms.uPhotoAspect.value = 1;
    uniforms.uFlipX.value = 0;
    simUniforms.uFlipX.value = 0;
    terrainUniforms.uFlipX.value = 0;
    uniforms.uLive.value = 0;
    terrainUniforms.uLive.value = 0;
    uniforms.uFaithful.value = 0;
    simUniforms.uFaithful.value = 0;
    terrainUniforms.uFaithful.value = 0;
    stampR.set(1.5); // re-seed the sim off the restored source
    if (old) old.dispose();
    return true;
  },

  hasPhoto() {
    return uniforms.tSrc.value !== defaultTex;
  },

  // Whether the current source asked for the live baseline (camera).
  // The exposure servo reads this to switch into webcam behavior.
  liveSource() {
    return uniforms.uLive.value === 1;
  },

  // Whether the source is a dropped photo or clip. The finish pass and
  // the exposure servo stand down for it, so the file shows 1:1.
  faithfulSource() {
    return uniforms.uFaithful.value === 1;
  },

  // The tune panel has its own dry/wet (tilt, labeled "tune dry/wet"):
  // main.js scales every global effect by this: symmetry, tiles, twist,
  // slice, lens, trails, glow, fringe, vignette and grain. It is separate
  // from the scene's dry/wet (density) so the plain picture can sit under
  // a full tune panel. At 1 every frame matches the old full look.
  fxWet() {
    return Math.min(1, Math.max(0, this.params.tilt));
  },
  update(s, dt, t) {
    const P = this.params;
    const spF = drastic(P.speed);
    const cxF = 0.3 + 1.5 * P.complexity;
    phase += dt * (0.035 + s.mids * 0.09) * spF;

    // Terrain runs in its own 3D sub-scene; everything else on the quad.
    if (P.mode === 'terrain') {
      this.scene = terrainScene;
      this.camera = terrainCam;
      scroll += dt * (0.03 + s.mids * 0.08) * spF;
      if (s.onKick) { ripplePos = 1; rippleR.hit(0.9 * s.onKick, 1.2); }
      ripplePos -= dt * 0.9;                 // wave rolls horizon → camera
      rippleAmt = rippleR.release(dt, KICK_ATTACK, 1.1);
      const amp = (0.7 + 1.8 * P.fill) * (0.7 + s.sub * 0.5);
      terrainUniforms.uScroll.value = scroll;
      terrainUniforms.uAmp.value = amp;
      terrainUniforms.uDetail.value = P.complexity * 0.8;
      terrainUniforms.uRipplePos.value = ripplePos;
      terrainUniforms.uRippleAmt.value = rippleAmt;
      terrainUniforms.uHighs.value = s.highs;
      terrainUniforms.uEnergy.value = s.energy;
      terrainUniforms.uContrast.value = P.contrast;
      terrainCam.position.y = amp + 1.3 + Math.sin(t * 0.4) * 0.15 + s.kick * 0.3;
      terrainCam.position.x = Math.sin(t * 0.17) * 0.9;
      terrainCam.lookAt(Math.sin(t * 0.13) * 1.5, amp * 0.35, -9);
      return;
    }
    this.scene = scene;
    this.camera = camera;

    uniforms.uMode.value = MODE_IDX[P.mode] ?? 0;
    uniforms.uPhase.value = phase;
    uniforms.uComplex.value = cxF;
    // edge is "fit photo": it morphs the scale from cover (the photo
    // fills the window edge to edge, cropped) to the whole picture
    // once with a margin, while the shader clears the repeats. fill
    // still sizes the photo at either end.
    // Cover fills BOTH edges: sized by height alone, a photo narrower
    // than the window (a phone shot in 9:16, a square in 16:9) left the
    // sides to its mirrored repeats.
    const size = 1.15 - 0.8 * P.fill;
    const ratio = uniforms.uPhotoAspect.value / Math.max(uniforms.uAspect.value, 1e-3);
    const cover = size * Math.min(1, ratio / 0.75);
    const contain = (size / 0.75) * 1.08 * Math.max(1, ratio);
    const fit = Math.min(1, Math.max(0, P.edge || 0));
    uniforms.uFill.value = cover + (contain - cover) * fit;
    uniforms.uFit.value = fit;
    uniforms.uContrast.value = P.contrast;
    uniforms.uWet.value = P.density; // dry/wet: source → full effect
    uniforms.uShape.value = P.shape;
    uniforms.uKick.value = s.kick;
    uniforms.uSub.value = s.sub;
    uniforms.uHighs.value = s.highs;
    uniforms.uEnergy.value = s.energy;

    // Per-mode structural state.
    if (s.onKick) {
      shockR.hit(0.9 * s.onKick, 1.2);                          // smear
      stampR.hit(1.2 * s.onKick, 1.5);                          // melt re-stamp / mosh keyframe
      twistTarget += (0.25 + Math.random() * 0.5) * s.onKick
        * (Math.random() < 0.5 ? -1 : 1);                       // droste twist leap
      breakR.hit(0.7 * s.onKick, 1);                            // shatter explode
      sepR.hit(0.8 * s.onKick, 1);                              // prism tear
      sortSeed += 1;                                            // sort re-cut
      splatAng += 2.399963;                                     // coral colony
      splat.x = Math.cos(splatAng) * 0.34;
      splat.y = Math.sin(splatAng) * 0.30;
      splatR.hit(0.8 * s.onKick, 1);
      pulseDepth = 0;                                           // infinite light dive
    }
    shock = shockR.release(dt, KICK_ATTACK, 2.2);
    stamp = stampR.release(dt, KICK_ATTACK, 4.5);
    breakEnv = breakR.release(dt, KICK_ATTACK, 0.4 + (1 - s.energy) * 1.6); // reassembles in quiet
    sepBurst = sepR.release(dt, KICK_ATTACK, 3.5);
    splat.amt = splatR.release(dt, KICK_ATTACK, 6);
    fall += dt * (0.1 + s.sub * 0.45) * spF;
    // Two stages, so the leap starts from rest and eases in. One stage
    // at rate 4 moved 6% of the leap in the kick's own frame.
    twistMid += (twistTarget - twistMid) * (1 - Math.exp(-dt * 8));
    twist += (twistMid - twist) * (1 - Math.exp(-dt * 8));

    // breathe: the lung follows a slow LFO, sub deepens each inhale.
    // A strong accent after a long rest starts the recursion slide;
    // the target then drains so the frame eases back out on its own.
    lungPhase += dt * (0.5 + s.sub * 0.35) * spF;
    if (P.mode === 'breathe' && s.onKick > 0.55 && t - lastSlide > 9) {
      lastSlide = t;
      recurseTgt = 0.45;
    }
    recurseTgt *= Math.exp(-dt * 0.22);
    recurse += (recurseTgt - recurse) * (1 - Math.exp(-dt * 0.9));
    uniforms.uBreathe.value = (0.018 + s.sub * 0.045)
      * (0.5 + 0.5 * Math.sin(lungPhase));
    uniforms.uCrawl.value = (0.008 + 0.02 * P.complexity) * (0.5 + s.energy * 0.8);
    uniforms.uWobble.value = 0.003 + s.highs * 0.007;
    uniforms.uFringe.value = 0.0015 + s.energy * 0.005 + s.kick * 0.002;
    uniforms.uRecurse.value = recurse;

    uniforms.uShock.value = shock;
    const fallRate = (0.1 + s.sub * 0.45) * spF;
    if (P.mode === 'planet') {
      const pull = Math.max(0, 0.35 - P.density) / 0.35;
      spin += dt * fallRate * (1 - pull);
      if (pull > 0) {
        const home = Math.round(spin / SPIN_PERIOD) * SPIN_PERIOD;
        spin += (home - spin) * (1 - Math.exp(-dt * 4 * pull));
      }
    }
    uniforms.uFall.value = P.mode === 'planet' ? spin : fall;
    uniforms.uTwist.value = twist * (0.3 + 1.7 * P.complexity);
    uniforms.uBreak.value = breakEnv;
    uniforms.uSep.value = (0.003 + s.highs * 0.014 + sepBurst * 0.02) * cxF;
    uniforms.uCells.value = 4 + Math.round(P.complexity * 10);
    uniforms.uSeed.value = sortSeed;
    if (pulseDepth > -30) {
      pulseDepth += dt * (4 + s.sub * 4) * spF;
      if (pulseDepth > 40) pulseDepth = -30;
    }
    uniforms.uPulse.value = pulseDepth;

    // Sim step: melt, mosh, and coral share the ping-pong; switching
    // owners re-seeds so stale state never bleeds across modes, and so
    // does a source that changed while no sim ran (a photo dropped on
    // none, then melt): that used to fade in over seconds from the old
    // picture. Coral runs several iterations per frame (growth rate
    // rides speed).
    const simKind = P.mode === 'melt' ? 0 : P.mode === 'mosh' ? 1 : P.mode === 'coral' ? 2
      : P.mode === 'scanline' ? 4 : P.mode === 'windows' ? 6 : -1;
    if (simKind >= 0 && ctx.renderer) {
      ensureSim(ctx.renderer);
      if (simOwner !== simKind || simSrc !== uniforms.tSrc.value) {
        simOwner = simKind;
        simSrc = uniforms.tSrc.value;
        stampR.set(1.5);
        stamp = 1.5;
      }
      simUniforms.uSimMode.value = simKind;
      simUniforms.tSrc.value = uniforms.tSrc.value;
      simUniforms.uAspect.value = uniforms.uAspect.value;
      simUniforms.uPhase.value = phase * 6.0;
      simUniforms.uFlow.value = (0.5 + s.sub * 2.2) * spF * cxF;
      simUniforms.uStamp.value = Math.min(1, stamp);
      simUniforms.uFill.value = uniforms.uFill.value;
      simUniforms.uFit.value = uniforms.uFit.value;
      simUniforms.uWet.value = uniforms.uWet.value;
      simUniforms.uSplat.value.set(splat.x, splat.y, simKind === 2 ? splat.amt : 0);
      const iters = simKind === 2 ? Math.max(1, Math.min(8, Math.round(3 * spF))) : 1;
      for (let i = 0; i < iters; i++) {
        simUniforms.tPrev.value = simA.texture;
        ctx.renderer.setRenderTarget(simB);
        simQuad.render(ctx.renderer);
        const tmp = simA; simA = simB; simB = tmp;
      }
      ctx.renderer.setRenderTarget(null);
      uniforms.tSim.value = simA.texture;
    }
  },
  resize(w, h) {
    uniforms.uAspect.value = w / h;
    uniforms.uPhotoAspect.value = simUniforms.uPhotoAspect.value = terrainUniforms.uPhotoAspect.value = w / h; // vjw: the source is our layer, at our size
    terrainCam.aspect = w / h;
    terrainCam.updateProjectionMatrix();
  },
};

return limitless; // vjw: was `export default limitless;`
} // vjw: the factory
