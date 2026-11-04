// VeeJay Wizard, 2026
// Look: TD feedbackTOP example 3 (studied, rewritten). Credits: webgl-noise 3D simplex (Ashima Arts, Stefan Gustavson), MIT.
/*{
    "CATEGORIES": ["Feedback"],
    "CREDIT": "VeeJay Wizard",
    "DESCRIPTION": "TouchDesigner-style feedback: every frame the history fades, turns its hue, gains saturation, zooms out of the centre, drifts along a slow noise field and softens, its edges glow, then the image is screened on top. Kicks pump the zoom, snares step the hue, hats brighten the edges, bass pushes the drift, a build lengthens the trails and a drop wipes them.",
    "ISFVSN": "2",
    "INPUTS": [
        { "NAME": "inputImage", "TYPE": "image" },
        { "NAME": "zoom", "LABEL": "Zoom", "TYPE": "float", "DEFAULT": 1.012, "MIN": 0.95, "MAX": 1.1 },
        { "NAME": "hueStep", "LABEL": "Hue step", "TYPE": "float", "DEFAULT": 5, "MIN": -30, "MAX": 30 },
        { "NAME": "edge", "LABEL": "Edges", "TYPE": "float", "DEFAULT": 0.25, "MIN": 0, "MAX": 1 },
        { "NAME": "displace", "LABEL": "Displace", "TYPE": "float", "DEFAULT": 0.006, "MIN": 0, "MAX": 0.05 },
        { "NAME": "fade", "LABEL": "Fade", "TYPE": "float", "DEFAULT": 0.95, "MIN": 0.8, "MAX": 1 },
        { "NAME": "dryWet", "LABEL": "Dry/wet", "TYPE": "float", "DEFAULT": 0.8, "MIN": 0, "MAX": 1 },
        { "NAME": "reset", "LABEL": "Reset", "TYPE": "bool", "DEFAULT": false }
    ],
    "PASSES": [
        { "TARGET": "loop", "PERSISTENT": true, "FLOAT": true, "WIDTH": "$WIDTH/2", "HEIGHT": "$HEIGHT/2" },
        {}
    ],
    "VJW_BIND": {
        "zoom": { "source": "kick", "amount": 1, "attack": 0, "release": 0.25, "min": 1.012, "max": 1.035 },
        "hueStep": { "source": "snare", "amount": 1, "attack": 0, "release": 0.3, "min": 5, "max": 15 },
        "edge": { "source": "hats", "amount": 1, "attack": 0, "release": 0.1, "min": 0.25, "max": 0.6 },
        "displace": { "source": "bass", "amount": 1, "attack": 0.05, "release": 0.4, "min": 0.006, "max": 0.025 },
        "fade": { "source": "build", "amount": 1, "attack": 1, "release": 2, "min": 0.95, "max": 0.98 },
        "reset": { "source": "drop", "amount": 1, "attack": 0, "release": 1.5, "min": 0, "max": 1 }
    }
}*/

//
// Description : Array and textureless GLSL 2D/3D/4D simplex
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20201014 (stegu)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise
//               https://github.com/stegu/webgl-noise
//
// (From noise3D.glsl: snoise(vec3) and what it calls. Ours: it returns a second channel too, the same four corners
// with their gradients' components rotated (yzx), so one call drifts both axes at half the cost of two.)

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
     return mod289(((x*34.0)+10.0)*x);
}

vec4 taylorInvSqrt(vec4 r)
{
  return 1.79284291400159 - 0.85373472095314 * r;
}

vec2 snoise(vec3 v)
  {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

// First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

// Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

// Permutations
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

// Gradients: 7x7 points over a square, mapped onto an octahedron.
// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

//Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

// Mix final noise value
  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  m = m * m;
  return 105.0 * vec2(dot( m, vec4( dot(p0,x0), dot(p1,x1),
                                    dot(p2,x2), dot(p3,x3) ) ),
                      dot( m, vec4( dot(p0.yzx,x0), dot(p1.yzx,x1),
                                    dot(p2.yzx,x2), dot(p3.yzx,x3) ) ));
  }
// (end of webgl-noise)

// Knobs, per frame at 60 fps (tuned on the spectrum from TD's example 3): GAMMA > 1 dims the darks first, so the
// trails keep their contrast; the saturation gain; the red kept (TD's chain loses a little each frame, and the hue turn
// brings it back as other colours); the image's level as it is screened into the loop (TD's .858 fills the screen
// with a big source like the spectrum: the trails are its edges); the noise field's features per screen height and
// its drift per second.
#define GAMMA 1.1
#define SAT 1.3
#define RED 0.99
#define LEVEL 0.45
#define FIELD 2.5
#define DRIFT 0.1

vec3 screen(vec3 a, vec3 b) {
    return 1.0 - (1.0 - a) * (1.0 - b);
}

// c's hue turned by `a` radians: Rodrigues' rotation about the grey axis.
vec3 hue(vec3 c, float a) {
    const vec3 k = vec3(0.57735);
    return c * cos(a) + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cos(a));
}

void main() {
    vec2 uv = isf_FragNormCoord;
    vec3 src = IMG_THIS_PIXEL(inputImage).rgb;
    if (PASSINDEX == 1) { // full size: the image stays sharp over its half-size loop (TD's dry/wet mix)
        gl_FragColor = vec4(mix(src, screen(src, IMG_THIS_PIXEL(loop).rgb), dryWet), 1.0);
        return;
    }
    // Pass 0, at half size. k: this frame's length in 60 fps frames, so the look holds at any frame rate.
    float k = clamp(TIMEDELTA * 60.0, 0.0, 4.0);
    // Zoom out of the centre, then drift along a slowly turning noise field (one noise channel per axis).
    vec3 q = vec3(uv * vec2(RENDERSIZE.x / RENDERSIZE.y, 1.0) * FIELD, DRIFT * TIME);
    vec2 p = 0.5 + (uv - 0.5) / pow(zoom, k) + displace * k * snoise(q);
    // Four bilinear taps half a texel off the diagonals: their mean is a 3×3 tent blur (TD softens the loop too).
    vec2 h = 0.5 / RENDERSIZE;
    vec3 a = IMG_NORM_PIXEL(loop, p + h).rgb;
    vec3 b = IMG_NORM_PIXEL(loop, p + vec2(-h.x, h.y)).rgb;
    vec3 d = IMG_NORM_PIXEL(loop, p + vec2(h.x, -h.y)).rgb;
    vec3 e = IMG_NORM_PIXEL(loop, p - h).rgb;
    vec3 c = 0.25 * (a + b + d + e);
    // Fade, gamma, a little red lost, the hue turned, then TD's HSV saturation: the top channel (V) stays, the others
    // move away from it, so the gain never feeds the loop.
    c = pow(c * pow(fade, k), vec3(GAMMA)) * vec3(pow(RED, k), 1.0, 1.0);
    c = hue(c, radians(hueStep) * k);
    float v = max(c.r, max(c.g, c.b));
    c = max(v - (v - c) * pow(SAT, k), 0.0);
    // The loop's edges glow in their own colours (TD's edge over the feedback): the same four taps are a Sobel.
    vec3 gx = a + d - b - e;
    vec3 gy = a + b - d - e;
    c += edge * sqrt(gx * gx + gy * gy);
    if (reset) c = vec3(0.0); // the drop wipes the history
    c = screen(c, LEVEL * src);
    // Soft clip above .8, so the loop never sticks at white.
    gl_FragColor = vec4(mix(c, 0.8 + 0.2 * (1.0 - exp((0.8 - c) * 5.0)), step(0.8, c)), 1.0);
}
