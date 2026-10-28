// VeeJay Wizard, 2026
/*{
    "CREDIT": "VeeJay Wizard (hg_sdf by Mercury)",
    "DESCRIPTION": "hg_sdf primitives: a chrome core morphing from a rounded cube to a dodecahedron, a ring of tumbling cubes and an orbit, raymarched.",
    "ISFVSN": "2",
    "CATEGORIES": ["Geometry"],
    "INPUTS": [
        { "NAME": "morph", "LABEL": "Morph", "TYPE": "float", "DEFAULT": 0.3, "MIN": 0, "MAX": 1 },
        { "NAME": "burst", "LABEL": "Burst", "TYPE": "float", "DEFAULT": 0, "MIN": 0, "MAX": 1 },
        { "NAME": "speed", "LABEL": "Spin", "TYPE": "float", "DEFAULT": 0.5, "MIN": 0, "MAX": 2 },
        { "NAME": "hue", "LABEL": "Hue", "TYPE": "float", "DEFAULT": 0.75, "MIN": 0, "MAX": 1 }
    ],
    "VJW_BIND": {
        "morph": { "source": "bass", "amount": 1, "attack": 0.02, "release": 0.3, "min": 0, "max": 1 },
        "burst": { "source": "onset", "amount": 1, "attack": 0, "release": 0.2, "min": 0, "max": 1 }
    }
}*/

// The functions down to the "VeeJay Wizard" line are from hg_sdf (https://mercury.sexy/hg_sdf/hg_sdf.glsl), used under
// its MIT option and adapted to GLSL ES 1.00: float literals, and fDodecahedron is fGDF(p, r, 13, 18) unrolled (ES 1.00
// has no array constructors).
////////////////////////////////////////////////////////////////
//
//                           HG_SDF
//
//     GLSL LIBRARY FOR BUILDING SIGNED DISTANCE BOUNDS
//
//     version 2021-07-28
//
//     Check https://mercury.sexy/hg_sdf for updates
//     and usage examples. Send feedback to spheretracing@mercury.sexy.
//
//     Brought to you by MERCURY https://mercury.sexy/
//
//
//
// Released dual-licensed under
//   Creative Commons Attribution-NonCommercial (CC BY-NC)
// or
//   MIT License
// at your choice.
//
// SPDX-License-Identifier: MIT OR CC-BY-NC-4.0
//
// /////
//
// CC-BY-NC-4.0
// https://creativecommons.org/licenses/by-nc/4.0/legalcode
// https://creativecommons.org/licenses/by-nc/4.0/
//
// /////
//
// MIT License
//
// Copyright (c) 2011-2021 Mercury Demogroup
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// /////
//
////////////////////////////////////////////////////////////////

#define PI 3.14159265

float vmax(vec3 v) {
	return max(max(v.x, v.y), v.z);
}

// Box: correct distance to corners
float fBox(vec3 p, vec3 b) {
	vec3 d = abs(p) - b;
	return length(max(d, vec3(0))) + vmax(min(d, vec3(0)));
}

// Torus in the XZ-plane
float fTorus(vec3 p, float smallRadius, float largeRadius) {
	return length(vec2(length(p.xz) - largeRadius, p.y)) - smallRadius;
}

// fGDF(p, r, 13, 18): max |dot(p, v)| over normalize(vec3(0, ±PHI, 1)) and its two cyclic permutations
float fDodecahedron(vec3 p, float r) {
	float d = abs(dot(p, vec3(0.0, 0.850651, 0.525731)));
	d = max(d, abs(dot(p, vec3(0.0, -0.850651, 0.525731))));
	d = max(d, abs(dot(p, vec3(0.525731, 0.0, 0.850651))));
	d = max(d, abs(dot(p, vec3(-0.525731, 0.0, 0.850651))));
	d = max(d, abs(dot(p, vec3(0.850651, 0.525731, 0.0))));
	d = max(d, abs(dot(p, vec3(-0.850651, 0.525731, 0.0))));
	return d - r;
}

// Rotate around a coordinate axis (i.e. in a plane perpendicular to that axis) by angle <a>.
// Read like this: R(p.xz, a) rotates "x towards z".
void pR(inout vec2 p, float a) {
	p = cos(a)*p + sin(a)*vec2(p.y, -p.x);
}

// Repeat around the origin by a fixed angle.
// For easier use, num of repetitions is use to specify the angle.
float pModPolar(inout vec2 p, float repetitions) {
	float angle = 2.0*PI/repetitions;
	float a = atan(p.y, p.x) + angle/2.;
	float r = length(p);
	float c = floor(a/angle);
	a = mod(a,angle) - angle/2.;
	p = vec2(cos(a), sin(a))*r;
	// For an odd number of repetitions, fix cell index of the cell in -x direction
	// (cell index would be e.g. -5 and 5 in the two halves of the cell):
	if (abs(c) >= (repetitions/2.0)) c = abs(c);
	return c;
}

// The "Round" variant uses a quarter-circle to join the two objects smoothly:
float fOpUnionRound(float a, float b, float r) {
	vec2 u = max(vec2(r - a,r - b), vec2(0));
	return max(r, min (a, b)) - length(u);
}

// ---- VeeJay Wizard, 2026 ----

// Knobs: march steps (the GPU cost; bench budget p95 ≤ 5 ms at 1728×1118), bounding sphere radius.
#define STEPS 40
#define BOUND 3.4

float spin; // set once per pixel in main, as the rotations: pR's cos/sin per map() call was the cost
mat2 M1;
mat2 M2;
mat2 M3;
mat2 M4;
mat2 M5;
mat2 M6;

mat2 rotm(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); } // pR(p, a) is rotm(a) * p
vec3 palette(float t) { return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }

// The core and the ring are evaluated only near their bounding sphere / torus; farther out the bound is the distance.
float map(vec3 p) {
	float s = 1.0 + 0.2 * burst;
	float core = length(p) - 1.5 * s; // the rounded box's corners reach √3·0.78 + 0.12
	if (core < 0.3) {
		vec3 q = p;
		q.xz = M1 * q.xz;
		q.xy = M2 * q.xy;
		core = mix(fBox(q, vec3(0.78 * s)) - 0.12, fDodecahedron(q, 0.95 * s), morph);
	}
	float ring = 2.1 + 0.6 * burst;
	float cubes = length(vec2(length(p.xz) - ring, p.y)) - 0.45; // a cube's corners reach √3·0.2 + 0.04
	if (cubes < 0.3) {
		vec3 r = p;
		r.xz = M3 * r.xz;
		pModPolar(r.xz, 8.0);
		r.x -= ring;
		r.xy = M4 * r.xy;
		r.yz = M5 * r.yz;
		cubes = fBox(r, vec3(0.2)) - 0.04;
	}
	vec3 o = p;
	o.yz = M6 * o.yz;
	float orbit = fTorus(o, 0.05, 2.9 + 0.3 * burst);
	return fOpUnionRound(min(core, orbit), cubes, 0.25);
}

// A studio: a dark floor-to-ceiling gradient with three soft boxes, so the chrome has something to reflect.
vec3 env(vec3 d) {
	vec3 c = mix(vec3(0.015, 0.01, 0.03), palette(hue + 0.55) * 0.35, smoothstep(-0.3, 0.9, d.y));
	float boxes = smoothstep(0.75, 0.95, sin(atan(d.z, d.x) * 3.0 + spin * 0.3)) * smoothstep(0.05, 0.5, d.y);
	return c + boxes * vec3(1.6, 1.5, 1.4);
}

void main() {
	spin = TIME * speed;
	float roll = TIME * 1.7;
	M1 = rotm(spin);
	M2 = rotm(spin * 0.63);
	M3 = rotm(-spin * 1.4);
	M4 = rotm(roll);
	M5 = rotm(roll * 0.7);
	M6 = rotm(0.45 + 0.2 * sin(spin)); // the orbit's tilt wobbles
	vec2 uv = (gl_FragCoord.xy - 0.5 * RENDERSIZE) / RENDERSIZE.y;
	vec3 ro = vec3(0.0, 1.2, 6.2);
	vec3 rd = normalize(vec3(uv, -1.6));
	pR(rd.yz, 0.19); // tilt down at the origin
	vec3 col = env(rd) * 0.35 * (1.1 - 0.5 * length(uv));
	// Bounding sphere: rays that miss it skip the march.
	float b = dot(ro, rd);
	float h = b * b - dot(ro, ro) + BOUND * BOUND;
	float t = 0.0;
	float d = 1e9; // a miss
	if (h > 0.0) {
		t = -b - sqrt(h);
		float tmax = -b + sqrt(h);
		for (int i = 0; i < STEPS; i++) {
			d = map(ro + rd * t);
			if (d < 0.002 * t || t > tmax) break;
			t += d;
		}
	}
	if (d < 0.01 * t) {
		vec3 p = ro + rd * t;
		vec2 e = vec2(0.002 * t, -0.002 * t);
		vec3 n = normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
		float fre = pow(1.0 - max(dot(-rd, n), 0.0), 4.0);
		vec3 base = palette(hue + 0.08 * length(p) + 0.1 * n.y);
		float dif = max(dot(n, normalize(vec3(0.4, 0.8, 0.5))), 0.0);
		col = base * (0.06 + 0.5 * dif) + env(reflect(rd, n)) * mix(0.35, 1.0, fre) * mix(vec3(1.0), base, 0.5);
		col += burst * 0.6 * base;
	}
	col = 1.0 - exp(-1.4 * col);
	gl_FragColor = vec4(pow(col, vec3(0.85)), 1.0);
}
