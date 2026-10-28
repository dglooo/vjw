// VeeJay Wizard, 2026
/*{
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Ink: two inks bloom and curl in dark water, ridged filaments inside slow clouds that a flow field folds. Spread thickens the clouds.",
    "ISFVSN": "2",
    "CATEGORIES": ["Liquid"],
    "INPUTS": [
        { "NAME": "spread", "LABEL": "Spread", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 1 },
        { "NAME": "speed", "LABEL": "Speed", "TYPE": "float", "DEFAULT": 1, "MIN": 0, "MAX": 3 },
        { "NAME": "ink1", "LABEL": "Ink 1", "TYPE": "color", "DEFAULT": [0.15, 0.45, 1.0, 1.0] },
        { "NAME": "ink2", "LABEL": "Ink 2", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.55, 1.0] }
    ],
    "VJW_BIND": {
        "spread": { "source": "bass", "amount": 1, "attack": 0.05, "release": 0.5, "min": 0.4, "max": 0.75 }
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

const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);

// Billows: |noise| octaves, soft lobes with dark creases where the noise crosses zero.
float billows(vec2 p) {
    float f = 0.0;
    float a = 0.6;
    for (int i = 0; i < 3; i++) {
        f += a * abs(snoise(p));
        p = ROT * p * 2.07;
        a *= 0.5;
    }
    return f;
}

// One ink: a slow cloud (its mask; spread grows it) filled with billows. Most of the water stays clear.
float ink(vec2 q, vec2 seed, float t) {
    float cloud = smoothstep(0.75 - 0.4 * spread, 1.0 - 0.4 * spread, 0.5 + 0.5 * snoise(q * 0.45 + seed + vec2(0.0, t)));
    return cloud * (0.3 + billows(q * 1.6 + seed * 1.7 - vec2(0.0, 1.5 * t)));
}

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y * 1.8;
    float t = TIME * speed * 0.06;
    // The flow: a warp that turns over time, so the clouds curl instead of sliding.
    vec2 w = vec2(snoise(0.7 * p + vec2(t, -t)), snoise(0.7 * p + vec2(4.1, 7.3) - vec2(0.0, t)));
    vec2 q = p + 0.9 * w;
    float d1 = ink(q, vec2(0.0), t);
    float d2 = ink(q, vec2(5.2, -3.7), -t);
    // Dense ink saturates, thin wisps stay faint; where the two meet they darken a little, as pigments do.
    vec3 a = ink1.rgb * (1.0 - exp(-3.0 * d1 * d1));
    vec3 b = ink2.rgb * (1.0 - exp(-3.0 * d2 * d2));
    vec3 col = vec3(0.005, 0.01, 0.02) + a + b - 0.5 * a * b;
    gl_FragColor = vec4(col, 1.0);
}
