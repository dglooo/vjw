// VeeJay Wizard, 2026
/*{
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "Smoke: the image leaves rising, curling smoke. A half-float feedback buffer is advected through a curl-noise flow (rotating-gradient noise, no Navier–Stokes), blurs a little and fades. Curl stirs it harder.",
    "ISFVSN": "2",
    "CATEGORIES": ["Liquid"],
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "curl", "LABEL": "Curl", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0, "MAX": 1 },
        { "NAME": "rise", "LABEL": "Rise", "TYPE": "float", "DEFAULT": 0.12, "MIN": -0.5, "MAX": 0.5 },
        { "NAME": "fade", "LABEL": "Fade", "TYPE": "float", "DEFAULT": 0.9, "MIN": 0.1, "MAX": 4 },
        { "NAME": "eddies", "LABEL": "Eddies", "TYPE": "float", "DEFAULT": 3, "MIN": 1, "MAX": 10 }
    ],
    "PASSES": [
        { "TARGET": "smokeBuffer", "PERSISTENT": true, "FLOAT": true, "WIDTH": "$WIDTH/2", "HEIGHT": "$HEIGHT/2" },
        {}
    ],
    "VJW_BIND": {
        "curl": { "source": "bass", "amount": 1, "attack": 0.05, "release": 0.5, "min": 0.2, "max": 0.7 }
    }
}*/

//
// Author: Stefan Gustavson (stefan.gustavson@gmail.com)
// Version 2016-05-10.
//
// Many thanks to Ian McEwan of Ashima Arts for the
// idea of using a permutation polynomial.
//
// Copyright (c) 2016 Stefan Gustavson. All rights reserved.
// Distributed under the MIT license. See LICENSE file.
// https://github.com/stegu/webgl-noise
//
// (From psrdnoise2D.glsl: srdnoise and what it calls; rgrad2 keeps its sin/cos branch.)

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

float mod289(float x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

float permute(float x) {
  return mod289(((x*34.0)+1.0)*x);
}

vec2 rgrad2(vec2 p, float rot) {
  float u = permute(permute(p.x) + p.y) * 0.0243902439 + rot; // Rotate by shift
  u = fract(u) * 6.28318530718; // 2*pi
  return vec2(cos(u), sin(u));
}

vec3 srdnoise(vec2 pos, float rot) {
  pos.y += 0.001;
  vec2 uv = vec2(pos.x + pos.y*0.5, pos.y);
  vec2 i0 = floor(uv);
  vec2 f0 = fract(uv);
  vec2 i1 = (f0.x > f0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec2 p0 = vec2(i0.x - i0.y * 0.5, i0.y);
  vec2 p1 = vec2(p0.x + i1.x - i1.y * 0.5, p0.y + i1.y);
  vec2 p2 = vec2(p0.x + 0.5, p0.y + 1.0);
  vec2 d0 = pos - p0;
  vec2 d1 = pos - p1;
  vec2 d2 = pos - p2;
  vec3 x = vec3(p0.x, p1.x, p2.x);
  vec3 y = vec3(p0.y, p1.y, p2.y);
  vec3 iuw = x + 0.5 * y;
  vec3 ivw = y;
  iuw = mod289(iuw);
  ivw = mod289(ivw);
  vec2 g0 = rgrad2(vec2(iuw.x, ivw.x), rot);
  vec2 g1 = rgrad2(vec2(iuw.y, ivw.y), rot);
  vec2 g2 = rgrad2(vec2(iuw.z, ivw.z), rot);
  vec3 w = vec3(dot(g0, d0), dot(g1, d1), dot(g2, d2));
  vec3 t = 0.8 - vec3(dot(d0, d0), dot(d1, d1), dot(d2, d2));
  vec3 dtdx = -2.0 * vec3(d0.x, d1.x, d2.x);
  vec3 dtdy = -2.0 * vec3(d0.y, d1.y, d2.y);
  if (t.x < 0.0) {
    dtdx.x = 0.0;
    dtdy.x = 0.0;
    t.x = 0.0;
  }
  if (t.y < 0.0) {
    dtdx.y = 0.0;
    dtdy.y = 0.0;
    t.y = 0.0;
  }
  if (t.z < 0.0) {
    dtdx.z = 0.0;
    dtdy.z = 0.0;
    t.z = 0.0;
  }
  vec3 t2 = t * t;
  vec3 t4 = t2 * t2;
  vec3 t3 = t2 * t;
  float n = dot(t4, w);
  vec2 dt0 = vec2(dtdx.x, dtdy.x) * 4.0 * t3.x;
  vec2 dn0 = t4.x * g0 + dt0 * w.x;
  vec2 dt1 = vec2(dtdx.y, dtdy.y) * 4.0 * t3.y;
  vec2 dn1 = t4.y * g1 + dt1 * w.y;
  vec2 dt2 = vec2(dtdx.z, dtdy.z) * 4.0 * t3.z;
  vec2 dn2 = t4.z * g2 + dt2 * w.z;
  return 11.0*vec3(n, dn0 + dn1 + dn2);
}
// (end of webgl-noise)

// Knob: the swirl speed per unit of curl (screen heights per second).
#define SWIRL 0.25

void main() {
    vec2 uv = isf_FragNormCoord;
    if (PASSINDEX == 1) { // full size: the image stays sharp over its half-size smoke
        gl_FragColor = max(IMG_THIS_PIXEL(smokeBuffer), IMG_THIS_PIXEL(inputImage));
        return;
    }
    // Pass 0, at half size (soft anyway, and a quarter of the cost).
    float dt = min(TIMEDELTA, 0.1); // a stalled frame must not fling the smoke
    // Velocity, screen heights per second: the curl of a noise potential (divergence-free, so it swirls without
    // piling up), its gradients slowly turning, plus a steady rise.
    vec2 gr = srdnoise(gl_FragCoord.xy / RENDERSIZE.y * eddies - vec2(0.0, 0.2 * TIME), 0.04 * TIME).yz;
    vec2 v = SWIRL * curl * vec2(gr.y, -gr.x) + vec2(0.0, rise);
    // Semi-Lagrangian step: read where this pixel's smoke was a frame ago, four taps around it (so it diffuses).
    vec2 back = uv - v * dt * vec2(RENDERSIZE.y / RENDERSIZE.x, 1.0);
    vec2 px = 0.5 / RENDERSIZE; // half a texel here: about one screen pixel
    vec4 old = 0.25 * (IMG_NORM_PIXEL(smokeBuffer, back + px) + IMG_NORM_PIXEL(smokeBuffer, back - px)
        + IMG_NORM_PIXEL(smokeBuffer, back + vec2(px.x, -px.y)) + IMG_NORM_PIXEL(smokeBuffer, back - vec2(px.x, -px.y)));
    // The image itself always shows; its smoke is whatever is brighter after the fade.
    gl_FragColor = max(old * exp(-fade * dt), IMG_THIS_PIXEL(inputImage));
}
