// VeeJay Wizard, 2026
/*{
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Fluid: noise warped by noise warped by noise (domain warping, after Inigo Quilez, https://iquilezles.org/articles/warp/), a flowing marble. Warp folds it deeper.",
    "ISFVSN": "2",
    "CATEGORIES": ["Liquid"],
    "INPUTS": [
        { "NAME": "warp", "LABEL": "Warp", "TYPE": "float", "DEFAULT": 1.5, "MIN": 0, "MAX": 5 },
        { "NAME": "speed", "LABEL": "Speed", "TYPE": "float", "DEFAULT": 1, "MIN": 0, "MAX": 3 },
        { "NAME": "scale", "LABEL": "Scale", "TYPE": "float", "DEFAULT": 1, "MIN": 0.3, "MAX": 4 },
        { "NAME": "hue", "LABEL": "Hue", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "warp": { "source": "bass", "amount": 1, "attack": 0.05, "release": 0.4, "min": 1, "max": 2.2 }
    }
}*/

//
// Description : Array and textureless GLSL 2D simplex noise function.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20110822 (ijm)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise
//

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
  return mod289(((x*34.0)+10.0)*x);
}

float snoise(vec2 v)
  {
  const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                      0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                     -0.577350269189626,  // -1.0 + 2.0 * C.x
                      0.024390243902439); // 1.0 / 41.0
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i); // Avoid truncation effects in permutation
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
		+ i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
// (end of webgl-noise)

// Knob: octaves per fbm (5 fbm calls a pixel, so this is the cost).
#define OCTAVES 3

const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8); // turns each octave, so the lattices never line up

// Channel offsets in exact thirds, so palette(t + 1/3) = palette(t).gbr and palette(t + 0.5) = 1 − palette(t): 2 calls
// (6 cos a pixel) instead of 4.
vec3 palette(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 1.0 / 3.0, 2.0 / 3.0))); }

float fbm(vec2 p) {
    float f = 0.0;
    float a = 0.5;
    for (int i = 0; i < OCTAVES; i++) {
        f += a * snoise(p);
        p = ROT * p * 2.03;
        a *= 0.5;
    }
    return f; // about -1..1
}

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y * scale;
    float t = TIME * speed * 0.15;
    // Each layer of warp drifts its own way, so the marble flows instead of sliding.
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - vec2(t, 0.0)));
    vec2 r = vec2(fbm(p + warp * q + vec2(1.7, 9.2) + 0.7 * t), fbm(p + warp * q + vec2(8.3, 2.8) - 0.6 * t));
    float f = 0.5 + 0.5 * fbm(p + warp * r);

    vec3 c = palette(hue);
    vec3 col = mix(c * 0.35, palette(hue + 0.12), clamp(f * f * 3.0, 0.0, 1.0));
    col = mix(col, (1.0 - c) * 0.12, clamp(length(q), 0.0, 1.0)); // deep folds
    col = mix(col, mix(c.gbr, vec3(1.0), 0.45), clamp(r.x * r.x * 1.5, 0.0, 1.0)); // bright veins
    col *= f * f * f + 0.6 * f * f + 0.5 * f + 0.15;
    col = 1.0 - exp(-1.6 * col);
    gl_FragColor = vec4(col, 1.0);
}
