// Source: donor/visual_system_2/scenes/release/fluid_body.synScene (main.glsl + scene.json; script.js restated as #defines) · unknown
// Author: Victor S.; HSLUV-GLSL v4.2: William Malo (https://github.com/williammalo)
// License: unknown (the donor's CREDIT names Victor S. only; shipped inside a commercial app; personal use, ⚠️ check before release); HSLUV-GLSL: its header is kept below, it names no licence
// VeeJay Wizard, 2026: ported for fx/syn.ts. Changes for GLSL ES 3.00: int literals in float maths (about 45 places),
// textureSize as a vec2, an ivec2 passed as a vec2. script.js is restated as the #defines under this header: its
// spectrum_0..3 are syn_BassHits, syn_MidLevel, syn_MidHighLevel, syn_HighHits; its BPMTri2 / BPMTri4 (the beat ramp
// slowed 2x / 4x) are the beat count's fract. Passes: fb0 / fb1 (the state, FLOAT), flow1..flow8 (the flow pyramid,
// each half the size of the one before), the screen (HSLuv colours).
// The pass targets WRAP repeat: scene.json names no WRAP, and OpenGL's initial wrap is GL_REPEAT (the donor's engine is
// OpenGL 3.3 core), so the scene most likely ran repeating; our default is clamp. Seen on milk_honey_smoke_bile:
// clamped, its field is vertical bands within 6 s; repeating, it looks like its thumbnail.
/*{
  "TITLE": "Fluid Body",
  "CREDIT": "Victor S.",
  "TAGS": ["feedback", "media", "colorful", "psychedelic", "groovy", "donor"],
  "WIDTH": 1920,
  "HEIGHT": 1080,
  "PASSES": [{"FLOAT": true, "HEIGHT": 1024, "TARGET": "fb0", "WIDTH": 1792, "WRAP": "repeat"}, {"FLOAT": true, "HEIGHT": 1024, "TARGET": "fb1", "WIDTH": 1792, "WRAP": "repeat"}, {"FLOAT": true, "HEIGHT": 512, "TARGET": "flow1", "WIDTH": 896, "WRAP": "repeat"}, {"FLOAT": true, "HEIGHT": 256, "TARGET": "flow2", "WIDTH": 448, "WRAP": "repeat"}, {"FLOAT": true, "HEIGHT": 128, "TARGET": "flow3", "WIDTH": 224, "WRAP": "repeat"}, {"FLOAT": true, "HEIGHT": 64, "TARGET": "flow4", "WIDTH": 112, "WRAP": "repeat"}, {"FLOAT": true, "HEIGHT": 32, "TARGET": "flow5", "WIDTH": 56, "WRAP": "repeat"}, {"FLOAT": true, "HEIGHT": 16, "TARGET": "flow6", "WIDTH": 28, "WRAP": "repeat"}, {"FLOAT": true, "HEIGHT": 8, "TARGET": "flow7", "WIDTH": 14, "WRAP": "repeat"}, {"FLOAT": true, "HEIGHT": 4, "TARGET": "flow8", "WIDTH": 7, "WRAP": "repeat"}],
  "CONTROLS": [
    {"NAME": "flow", "TYPE": "slider", "DEFAULT": 0.25, "MIN": 0.02, "MAX": 1},
    {"NAME": "color_rotate", "TYPE": "xy", "DEFAULT": [0, 0], "MIN": [0, 0], "MAX": [1, 1]},
    {"NAME": "coruscate", "TYPE": "slider", "DEFAULT": 0.5, "MIN": 0, "MAX": 1},
    {"NAME": "pulse", "TYPE": "knob", "DEFAULT": 0.5, "MIN": 0, "MAX": 1},
    {"NAME": "flash_x", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "flash_y", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "zap", "TYPE": "bang smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "chromatic", "TYPE": "slider", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "drift", "TYPE": "xy", "DEFAULT": [1, 1], "MIN": [0, 0], "MAX": [2, 2]},
    {"NAME": "lens", "TYPE": "bang smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "momentum", "TYPE": "knob", "DEFAULT": 0.25, "MIN": 0, "MAX": 1},
    {"NAME": "scale_factor", "TYPE": "knob", "DEFAULT": 1, "MIN": 0, "MAX": 2},
    {"NAME": "bars", "TYPE": "bang", "DEFAULT": 0, "MIN": 0, "MAX": 1}
  ]
}*/
#define spectrum_0 syn_BassHits
#define spectrum_1 syn_MidLevel
#define spectrum_2 syn_MidHighLevel
#define spectrum_3 syn_HighHits
#define BPMTri2 fract(syn_BeatTime*0.5)
#define BPMTri4 fract(syn_BeatTime*0.25)
vec4 spectrum = vec4(spectrum_0, spectrum_1, spectrum_2, spectrum_3);

const float pi = 3.14159265359;
const float eps = 1e-15;

/*
HSLUV-GLSL v4.2
HSLUV is a human-friendly alternative to HSL. ( http://www.hsluv.org )
GLSL port by William Malo ( https://github.com/williammalo )
Put this code in your fragment shader.
*/

// vec3 hsluv_intersectLineLine(vec3 line1x, vec3 line1y, vec3 line2x, vec3 line2y) {
//     return (line1y - line2y) / (line2x - line1x);
// }
//
// vec3 hsluv_distanceFromPole(vec3 pointx,vec3 pointy) {
//     return sqrt(pointx*pointx + pointy*pointy);
// }
//
// vec3 hsluv_lengthOfRayUntilIntersect(float theta, vec3 x, vec3 y) {
//     vec3 len = y / (sin(theta) - x * cos(theta));
//     if (len.r < 0.0) {len.r=1000.0;}
//     if (len.g < 0.0) {len.g=1000.0;}
//     if (len.b < 0.0) {len.b=1000.0;}
//     return len;
// }
//
// float hsluv_maxSafeChromaForL(float L){
//     mat3 m2 = mat3(
//          3.2409699419045214  ,-0.96924363628087983 , 0.055630079696993609,
//         -1.5373831775700935  , 1.8759675015077207  ,-0.20397695888897657 ,
//         -0.49861076029300328 , 0.041555057407175613, 1.0569715142428786
//     );
//     float sub0 = L + 16.0;
//     float sub1 = sub0 * sub0 * sub0 * .000000641;
//     float sub2 = sub1 > 0.0088564516790356308 ? sub1 : L / 903.2962962962963;
//
//     vec3 top1   = (284517.0 * m2[0] - 94839.0  * m2[2]) * sub2;
//     vec3 bottom = (632260.0 * m2[2] - 126452.0 * m2[1]) * sub2;
//     vec3 top2   = (838422.0 * m2[2] + 769860.0 * m2[1] + 731718.0 * m2[0]) * L * sub2;
//
//     vec3 bounds0x = top1 / bottom;
//     vec3 bounds0y = top2 / bottom;
//
//     vec3 bounds1x =              top1 / (bottom+126452.0);
//     vec3 bounds1y = (top2-769860.0*L) / (bottom+126452.0);
//
//     vec3 xs0 = hsluv_intersectLineLine(bounds0x, bounds0y, -1.0/bounds0x, vec3(0.0) );
//     vec3 xs1 = hsluv_intersectLineLine(bounds1x, bounds1y, -1.0/bounds1x, vec3(0.0) );
//
//     vec3 lengths0 = hsluv_distanceFromPole( xs0, bounds0y + xs0 * bounds0x );
//     vec3 lengths1 = hsluv_distanceFromPole( xs1, bounds1y + xs1 * bounds1x );
//
//     return  min(lengths0.r,
//             min(lengths1.r,
//             min(lengths0.g,
//             min(lengths1.g,
//             min(lengths0.b,
//                 lengths1.b)))));
// }
//
// float hsluv_maxChromaForLH(float L, float H) {
//
//     float hrad = radians(H);
//
//     mat3 m2 = mat3(
//          3.2409699419045214  ,-0.96924363628087983 , 0.055630079696993609,
//         -1.5373831775700935  , 1.8759675015077207  ,-0.20397695888897657 ,
//         -0.49861076029300328 , 0.041555057407175613, 1.0569715142428786
//     );
//     float sub1 = pow(L + 16.0, 3.0) / 1560896.0;
//     float sub2 = sub1 > 0.0088564516790356308 ? sub1 : L / 903.2962962962963;
//
//     vec3 top1   = (284517.0 * m2[0] - 94839.0  * m2[2]) * sub2;
//     vec3 bottom = (632260.0 * m2[2] - 126452.0 * m2[1]) * sub2;
//     vec3 top2   = (838422.0 * m2[2] + 769860.0 * m2[1] + 731718.0 * m2[0]) * L * sub2;
//
//     vec3 bound0x = top1 / bottom;
//     vec3 bound0y = top2 / bottom;
//
//     vec3 bound1x =              top1 / (bottom+126452.0);
//     vec3 bound1y = (top2-769860.0*L) / (bottom+126452.0);
//
//     vec3 lengths0 = hsluv_lengthOfRayUntilIntersect(hrad, bound0x, bound0y );
//     vec3 lengths1 = hsluv_lengthOfRayUntilIntersect(hrad, bound1x, bound1y );
//
//     return  min(lengths0.r,
//             min(lengths1.r,
//             min(lengths0.g,
//             min(lengths1.g,
//             min(lengths0.b,
//                 lengths1.b)))));
// }

float hsluv_fromLinear(float c) {
    return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}
vec3 hsluv_fromLinear(vec3 c) {
    return vec3( hsluv_fromLinear(c.r), hsluv_fromLinear(c.g), hsluv_fromLinear(c.b) );
}

float hsluv_toLinear(float c) {
    return c > 0.04045 ? pow((c + 0.055) / (1.0 + 0.055), 2.4) : c / 12.92;
}

vec3 hsluv_toLinear(vec3 c) {
    return vec3( hsluv_toLinear(c.r), hsluv_toLinear(c.g), hsluv_toLinear(c.b) );
}

// float hsluv_yToL(float Y){
//     return Y <= 0.0088564516790356308 ? Y * 903.2962962962963 : 116.0 * pow(Y, 1.0 / 3.0) - 16.0;
// }

float hsluv_lToY(float L) {
    return L <= 8.0 ? L / 903.2962962962963 : pow((L + 16.0) / 116.0, 3.0);
}

vec3 xyzToRgb(vec3 tuple) {
    const mat3 m = mat3(
        3.2409699419045214  ,-1.5373831775700935 ,-0.49861076029300328 ,
       -0.96924363628087983 , 1.8759675015077207 , 0.041555057407175613,
        0.055630079696993609,-0.20397695888897657, 1.0569715142428786  );

    return hsluv_fromLinear(tuple*m);
}

vec3 rgbToXyz(vec3 tuple) {
    const mat3 m = mat3(
        0.41239079926595948 , 0.35758433938387796, 0.18048078840183429 ,
        0.21263900587151036 , 0.71516867876775593, 0.072192315360733715,
        0.019330818715591851, 0.11919477979462599, 0.95053215224966058
    );
    return hsluv_toLinear(tuple) * m;
}
//
// vec3 xyzToLuv(vec3 tuple){
//     float X = tuple.x;
//     float Y = tuple.y;
//     float Z = tuple.z;
//
//     float L = hsluv_yToL(Y);
//
//     float div = 1./dot(tuple,vec3(1,15,3));
//
//     return vec3(
//         1.,
//         (52. * (X*div) - 2.57179),
//         (117.* (Y*div) - 6.08816)
//     ) * L;
// }


vec3 luvToXyz(vec3 tuple) {
    float L = tuple.x;

    float U = tuple.y / (13.0 * L) + 0.19783000664283681;
    float V = tuple.z / (13.0 * L) + 0.468319994938791;

    float Y = hsluv_lToY(L);
    float X = 2.25 * U * Y / V;
    float Z = (3./V - 5.)*Y - (X/3.);

    return vec3(X, Y, Z);
}

// vec3 luvToLch(vec3 tuple) {
//     float L = tuple.x;
//     float U = tuple.y;
//     float V = tuple.z;
//
//     float C = length(tuple.yz);
//     float H = degrees(atan(V,U));
//     if (H < 0.0) {
//         H = 360.0 + H;
//     }
//
//     return vec3(L, C, H);
// }

vec3 lchToLuv(vec3 tuple) {
    float hrad = radians(tuple.b);
    return vec3(
        tuple.r,
        cos(hrad) * tuple.g,
        sin(hrad) * tuple.g
    );
}

// vec3 hsluvToLch(vec3 tuple) {
//     tuple.g *= hsluv_maxChromaForLH(tuple.b, tuple.r) * .01;
//     return tuple.bgr;
// }
//
// vec3 lchToHsluv(vec3 tuple) {
//     tuple.g /= hsluv_maxChromaForLH(tuple.r, tuple.b) * .01;
//     return tuple.bgr;
// }
//
// vec3 hpluvToLch(vec3 tuple) {
//     tuple.g *= hsluv_maxSafeChromaForL(tuple.b) * .01;
//     return tuple.bgr;
// }
//
// vec3 lchToHpluv(vec3 tuple) {
//     tuple.g /= hsluv_maxSafeChromaForL(tuple.r) * .01;
//     return tuple.bgr;
// }

vec3 lchToRgb(vec3 tuple) {
    return xyzToRgb(luvToXyz(lchToLuv(tuple)));

}

// vec3 rgbToLch(vec3 tuple) {
//     return luvToLch(xyzToLuv(rgbToXyz(tuple)));
// }
//
// vec3 hsluvToRgb(vec3 tuple) {
//     return lchToRgb(hsluvToLch(tuple));
// }
//
// vec3 rgbToHsluv(vec3 tuple) {
//     return lchToHsluv(rgbToLch(tuple));
// }
//
// vec3 hpluvToRgb(vec3 tuple) {
//     return lchToRgb(hpluvToLch(tuple));
// }
//
// vec3 rgbToHpluv(vec3 tuple) {
//     return lchToHpluv(rgbToLch(tuple));
// }
//
// vec3 luvToRgb(vec3 tuple){
//     return xyzToRgb(luvToXyz(tuple));
// }

// allow vec4's
vec4   xyzToRgb(vec4 c) {return vec4(   xyzToRgb( vec3(c.x,c.y,c.z) ), c.a);}
// vec4   rgbToXyz(vec4 c) {return vec4(   rgbToXyz( vec3(c.x,c.y,c.z) ), c.a);}
// vec4   xyzToLuv(vec4 c) {return vec4(   xyzToLuv( vec3(c.x,c.y,c.z) ), c.a);}
vec4   luvToXyz(vec4 c) {return vec4(   luvToXyz( vec3(c.x,c.y,c.z) ), c.a);}
// vec4   luvToLch(vec4 c) {return vec4(   luvToLch( vec3(c.x,c.y,c.z) ), c.a);}
vec4   lchToLuv(vec4 c) {return vec4(   lchToLuv( vec3(c.x,c.y,c.z) ), c.a);}
// vec4 hsluvToLch(vec4 c) {return vec4( hsluvToLch( vec3(c.x,c.y,c.z) ), c.a);}
// vec4 lchToHsluv(vec4 c) {return vec4( lchToHsluv( vec3(c.x,c.y,c.z) ), c.a);}
// vec4 hpluvToLch(vec4 c) {return vec4( hpluvToLch( vec3(c.x,c.y,c.z) ), c.a);}
// vec4 lchToHpluv(vec4 c) {return vec4( lchToHpluv( vec3(c.x,c.y,c.z) ), c.a);}
// vec4   lchToRgb(vec4 c) {return vec4(   lchToRgb( vec3(c.x,c.y,c.z) ), c.a);}
// vec4   rgbToLch(vec4 c) {return vec4(   rgbToLch( vec3(c.x,c.y,c.z) ), c.a);}
// vec4 hsluvToRgb(vec4 c) {return vec4( hsluvToRgb( vec3(c.x,c.y,c.z) ), c.a);}
// vec4 rgbToHsluv(vec4 c) {return vec4( rgbToHsluv( vec3(c.x,c.y,c.z) ), c.a);}
// vec4 hpluvToRgb(vec4 c) {return vec4( hpluvToRgb( vec3(c.x,c.y,c.z) ), c.a);}
// vec4 rgbToHpluv(vec4 c) {return vec4( rgbToHpluv( vec3(c.x,c.y,c.z) ), c.a);}
// vec4   luvToRgb(vec4 c) {return vec4(   luvToRgb( vec3(c.x,c.y,c.z) ), c.a);}
// allow 3 floats
vec3   xyzToRgb(float x, float y, float z) {return   xyzToRgb( vec3(x,y,z) );}
// vec3   rgbToXyz(float x, float y, float z) {return   rgbToXyz( vec3(x,y,z) );}
// vec3   xyzToLuv(float x, float y, float z) {return   xyzToLuv( vec3(x,y,z) );}
vec3   luvToXyz(float x, float y, float z) {return   luvToXyz( vec3(x,y,z) );}
// vec3   luvToLch(float x, float y, float z) {return   luvToLch( vec3(x,y,z) );}
vec3   lchToLuv(float x, float y, float z) {return   lchToLuv( vec3(x,y,z) );}
// vec3 hsluvToLch(float x, float y, float z) {return hsluvToLch( vec3(x,y,z) );}
// vec3 lchToHsluv(float x, float y, float z) {return lchToHsluv( vec3(x,y,z) );}
// vec3 hpluvToLch(float x, float y, float z) {return hpluvToLch( vec3(x,y,z) );}
// vec3 lchToHpluv(float x, float y, float z) {return lchToHpluv( vec3(x,y,z) );}
// vec3   lchToRgb(float x, float y, float z) {return   lchToRgb( vec3(x,y,z) );}
// vec3   rgbToLch(float x, float y, float z) {return   rgbToLch( vec3(x,y,z) );}
// vec3 hsluvToRgb(float x, float y, float z) {return hsluvToRgb( vec3(x,y,z) );}
// vec3 rgbToHsluv(float x, float y, float z) {return rgbToHsluv( vec3(x,y,z) );}
// vec3 hpluvToRgb(float x, float y, float z) {return hpluvToRgb( vec3(x,y,z) );}
// vec3 rgbToHpluv(float x, float y, float z) {return rgbToHpluv( vec3(x,y,z) );}
// vec3   luvToRgb(float x, float y, float z) {return   luvToRgb( vec3(x,y,z) );}
// allow 4 floats
vec4   xyzToRgb(float x, float y, float z, float a) {return   xyzToRgb( vec4(x,y,z,a) );}
// vec4   rgbToXyz(float x, float y, float z, float a) {return   rgbToXyz( vec4(x,y,z,a) );}
// vec4   xyzToLuv(float x, float y, float z, float a) {return   xyzToLuv( vec4(x,y,z,a) );}
vec4   luvToXyz(float x, float y, float z, float a) {return   luvToXyz( vec4(x,y,z,a) );}
// vec4   luvToLch(float x, float y, float z, float a) {return   luvToLch( vec4(x,y,z,a) );}
vec4   lchToLuv(float x, float y, float z, float a) {return   lchToLuv( vec4(x,y,z,a) );}
// vec4 hsluvToLch(float x, float y, float z, float a) {return hsluvToLch( vec4(x,y,z,a) );}
// vec4 lchToHsluv(float x, float y, float z, float a) {return lchToHsluv( vec4(x,y,z,a) );}
// vec4 hpluvToLch(float x, float y, float z, float a) {return hpluvToLch( vec4(x,y,z,a) );}
// vec4 lchToHpluv(float x, float y, float z, float a) {return lchToHpluv( vec4(x,y,z,a) );}
// vec4   lchToRgb(float x, float y, float z, float a) {return   lchToRgb( vec4(x,y,z,a) );}
// vec4   rgbToLch(float x, float y, float z, float a) {return   rgbToLch( vec4(x,y,z,a) );}
// vec4 hsluvToRgb(float x, float y, float z, float a) {return hsluvToRgb( vec4(x,y,z,a) );}
// vec4 rgbToHslul(float x, float y, float z, float a) {return rgbToHsluv( vec4(x,y,z,a) );}
// vec4 hpluvToRgb(float x, float y, float z, float a) {return hpluvToRgb( vec4(x,y,z,a) );}
// vec4 rgbToHpluv(float x, float y, float z, float a) {return rgbToHpluv( vec4(x,y,z,a) );}
// vec4   luvToRgb(float x, float y, float z, float a) {return   luvToRgb( vec4(x,y,z,a) );}

/*
END HSLUV-GLSL
*/

float pulse_ = zap + pulse
  * abs(length(sqrt(spectrum.xxyz*spectrum.xyzw)*vec4(1.5,1,.5,.25))-.1);
float zap_ = zap;

vec4 circleDiff(vec4 a, vec4 b){
  return fract(a-b+.5)-.5;
}
vec4 circleDist(vec4 a, vec4 b){
  return abs(circleDiff(a, b));
}

vec4 initialCondition(){
  // return .5+.5*cos(2*pi*(vec4(0, 0.75, 0.5, 0.25)+dot(_uvc, _uvc)));
  vec4 s = vec4(
    _noise(FRAMECOUNT), _noise(2.0*FRAMECOUNT),
    _noise(3.0*FRAMECOUNT), _noise(4.0*FRAMECOUNT));
  return .5+.5*cos(2.0*pi*(_uv.y+s));
}

vec4 media_features(){
  vec3 media = rgbToXyz(_loadMedia().rgb);
  vec3 dx = dFdx(media);
  vec3 sgn = sign(dx);
  dx *= sgn;
  vec3 dy = dFdy(media)*sgn;
  return vec4(
    dot(vec3(1), dx),
    dot(vec3(1), dy),
    (media.xz - vec2(.31, .35))*sqrt(media.z)
    );
}

vec2 flowRule(vec4 s){
  vec2 r = (
    12.0*sin(2.0*pi*(2.0*s.b+vec2(0, .25)))
    + 6.0*cos(2.0*pi*(3.0*s.a+vec2(0, .25)))
    - 4.0*sin(2.0*pi*(5.0*s.g+vec2(0, .25)))
    - 3.0*cos(2.0*pi*(7.0*s.r+vec2(0, .25)))
    )/25.0;

  r*=pow(2.0, -2.0*dot(_uvc, _uvc));
  return r;
}

vec4 lerp4(in vec4 v00, in vec4 v01, in vec4 v10, in vec4 v11, in vec2 m){
  return mix(mix(v00, v01, m.y), mix(v10, v11, m.y), m.x);
}

//assume premultiplied by 2pi for efficiency
vec4 circleLerp(in vec4 v00, in vec4 v01, in vec4 v10, in vec4 v11, in vec2 m){
  return fract(atan(
    lerp4(sin(v00), sin(v01), sin(v10), sin(v11), m),
    lerp4(cos(v00), cos(v01), cos(v10), cos(v11), m)
    )/pi/2.0);
}

vec4 circleTexture(in sampler2D state, in vec2 p){
  ivec2 ts = textureSize(state, 0);
  vec2 xy = vec2(ts)*(p+1.0)-0.5;
  ivec2 ixy = ivec2(xy);
  vec2 m = fract(xy);
  return circleLerp(
    2.0*pi*texelFetch(state, ixy%ts, 0),
    2.0*pi*texelFetch(state, (ixy+ivec2(0,1))%ts, 0),
    2.0*pi*texelFetch(state, (ixy+ivec2(1,0))%ts, 0),
    2.0*pi*texelFetch(state, (ixy+ivec2(1,1))%ts, 0),
    m);
}

mat4 texel4(in sampler2D state, in vec2 xy){
  ivec2 ixy = ivec2(xy);
  ivec2 ts = textureSize(state, 0);
  return mat4(
    texelFetch(state, ixy%ts, 0),
    texelFetch(state, (ixy+ivec2(0,1))%ts, 0),
    texelFetch(state, (ixy+ivec2(1,0))%ts, 0),
    texelFetch(state, (ixy+ivec2(1,1))%ts, 0));
}

mat4 initFlow(sampler2D state, ivec2 p){
  mat4 c = texel4(state, vec2(p));
  vec4 m = media_features();
  return mat4(
    vec4(flowRule(c[0])+m.zw, m.xy),
    vec4(flowRule(c[1])+m.zw, m.xy),
    vec4(flowRule(c[2])+m.zw, m.xy),
    vec4(flowRule(c[3])+m.zw, m.xy)
    );
}

vec4 stepFlow(in sampler2D state, in sampler2D fine, bool init){
  float momentum_ = momentum
    * pow(2.0, -4.0*pulse_)
    * float(lens<=1.0)*max(1.0-zap_, 0.0);

  mat4 corners;
  vec4 r_fine;

  if(init)
    corners = initFlow(fine, ivec2(_xy)*2);
  else
    corners = texel4(fine, vec2(ivec2(_xy)*2));

  vec4 w = exp(vec4(
    length(corners[0].zw),
    length(corners[1].zw),
    length(corners[2].zw),
    length(corners[3].zw)
    ));
  w /= dot(vec4(1), w);
  r_fine.zw =
    w[0]*corners[0].zw + w[1]*corners[1].zw
    + w[2]*corners[2].zw + w[3]*corners[3].zw;
  r_fine.zw /= sqrt(length(r_fine.zw)) + 1e-5;

  r_fine.xy = (
    corners[0].xy
    + corners[1].xy
    + corners[2].xy
    + corners[3].xy)/4.0;

  r_fine.xy = r_fine.xy - dot(r_fine.xy, r_fine.zw)*r_fine.zw;

  vec4 r = mix(
    texelFetch(state, ivec2(_xy), 0), r_fine, 1.0-momentum_);
  return r;
}

vec4 aggregate(sampler2D fb){
  vec2 p = _uv;

  vec2 d[8];
  d[0] = texture(flow1, p).xy;
  d[1] = texture(flow2, p).xy;
  d[2] = texture(flow3, p).xy;
  d[3] = texture(flow4, p).xy;
  d[4] = texture(flow5, p).xy;
  d[5] = texture(flow6, p).xy;
  d[6] = texture(flow7, p).xy;
  d[7] = texture(flow8, p).xy;

  // vec4 w = pow(vec4(2), spectrum.wzyx*vec4(4+1-dot(_uvc, _uvc),3,2,1)-.5);
  vec4 w = pow(vec4(2), spectrum.wzyx*vec4(4,3,2,1)-.5);
  vec2 ws[8] = vec2[8](
    vec2(w.x), vec2(w.x+w.y)/2.0, vec2(w.y), vec2(w.y+w.z)/2.0,
    vec2(w.z), vec2(w.z+w.w)/2.0, vec2(w.w), drift);

  //convert the displacements computed for each layer of flow
  //to displacements at each scale
  vec2 disp = vec2(0);
  float scale = 1.0;
  float sf_ = pow(2.0, scale_factor);
  float z = 0.0;

  for (int i=0; i<8; i++){
    vec2 d2 = d[i];
    if(i<7)
      d2 -= d[i+1];

    d2 /= length(d2) + 1e-1;
    d2 *= scale;

    disp += d2*ws[i];
    scale *= sf_;
    z += scale;
  }

  disp *= 128.0*flow*pow(2.0, 3.0*pulse_);
  disp /= z*RENDERSIZE;

  p += disp;

  if(lens==1.0){
    vec2 ts = vec2(textureSize(fb, 0));
    vec2 ar = mix(ts.xx, ts.yy, step(ts.x, ts.y))/ts.yx;
    p = _uv - .5;
    p *= ar;
    float lp = length(p);
    p *= lp < .5 ? 2.0-1.0/(lp+1e-5) : (1.0-lp)/(lp+1e-5);
    p /= ar;
    p += .5;
  }

  vec4 c0 = circleTexture(fb, p);

  // distance to other channels minus distance to antipodes
  vec4 ac0 = fract(.5+c0);
  vec4 dir = (0.0
    + circleDist(c0, c0.gbar)
    + circleDist(c0, c0.barg)
    + circleDist(c0, c0.argb)
    - circleDist(c0, ac0.gbar)
    - circleDist(c0, ac0.barg)
    - circleDist(c0, ac0.argb)
    )/3.;

  float hipulse_ = pulse*abs(length(spectrum*vec4(.25, .5, 1, 1.5))-.1);
  vec4 coruscate_ =
    max(pow(zap_, 3.0), pow(coruscate, 4.0-2.0*hipulse_))
    * vec4(.25,1,.5,.125);
  if (_isMediaActive())
    coruscate_ *= 0.5;
  else
    coruscate_ *= exp(-dot(_uvc, _uvc));

  // vec4 media = getMediaDelta();
  // coruscate_ *= exp(dot(vec3(1.), abs(media.rgb))-1.);

  dir *= min(vec4(1), coruscate_*0.5/length(dir));//pow(coruscate, 4)/2.;
  dir *= mix(sin(2.0*pi*(c0.a+BPMTri2))*2.0+1.0, 1.0, zap_);
  return fract(c0+dir);
}

float mirror(float x){
  return abs(fract((x+1.0)/2.0)*2.0-1.0);
}

vec4 getColor(vec4 c0){//, vec4 slope){
  vec4 media = _loadMedia();//texture(media_hist, _uv);
  float media_lum = rgbToXyz(media.rgb).y;//0.5*pow(dot(vec3(1./3), media.rgb), 2);
  float chromatic_ = chromatic;//*  media_lum;

  float lfo = BPMTri2;
  float lfo2 = BPMTri4;
  vec3 rot_ =
    pow(vec3(color_rotate.x ), vec3(3,2,1))
    + flash_x*lfo2;
  c0.xyz = fract(c0.xyz+rot_);

  float x = //mirror(color_rotate.y+ flash_y*lfo + media_lum + c0.x+_uv.y*.05);//
    fract(c0.x+_uv.y*.05);
  x = x<=.5 ? (1.0-sqrt(1.0-x*x*4.0))/2.0 : (sqrt(1.0-(1.0-x)*(1.0-x)*4.0)+1.0)/2.0;
  // x = mirror(x-.5);
  float y = sin(2.0*pi*(c0.y+_uv.y*.1));
  float h = fract(x+color_rotate.y + flash_y*lfo + media_lum);//bias hue toward half of spectrum and away from other half
  float l = mix(sin(2.0*pi*(h-chromatic_/4.0)), y, chromatic_); //align midtones with most in/frequent hues
  float c =  1.0 - 2.0*l*l; //align high chroma with midtones

  vec3 lch = vec3(
    .5+.5*l,
    .5+.5*c,
    fract(h-chromatic_/4.0)
    // mirror(h*2-chromatic_/3)/2
    );

  vec3 r = lchToRgb(vec3(
    85.0*lch.x,
    95.0*lch.y,
    360.0*lch.z
    ).xyz);
  r = clamp(r, 0.0, 1.0);

  return vec4(r, c0.a+.5);
}

vec4 colorAntialias(in sampler2D state){
  // return texture(state, _uv);
  vec4 r = vec4(0);
  vec2 xy = _uv*vec2(textureSize(state, 0))-.5;
  vec2 m = fract(xy);
  mat4 cf = texel4(state, xy);
  // //multiple calls to circleTexture very expensive --
  // // instead split the difference b/t interpolation and msaa
  vec4 m4 = sqrt(vec4((1.0-m.x)*(1.0-m.y), (1.0-m.x)*m.y, m.x*(1.0-m.y), m.x*m.y));
  for (int i=0; i<4; i++){
    r += m4[i]*getColor(cf[i]);
  }
  r/=dot(vec4(1), m4);
  return r;
}

vec4 postMain(in sampler2D state){
  return texture(state, _uv);
}

vec4 renderMain () {
  if (FRAMECOUNT<=2.0){
    return initialCondition();
  }
  if (PASSINDEX == 0.0){
    vec4 r = aggregate(fb1);
    if(bars > 0.0){
      // return initialCondition();
      return mix(r, initialCondition(), 0.5);
    }
    return r;
  }
  else if (PASSINDEX == 1.0){
    return texelFetch(fb0, ivec2(_xy), 0);
  }
  else if (PASSINDEX == 2.0){
    return stepFlow(flow1, fb1, true);
  }
  else if (PASSINDEX == 3.0){
    return stepFlow(flow2, flow1, false);
  }
  else if (PASSINDEX == 4.0){
    return stepFlow(flow3, flow2, false);
  }
  else if (PASSINDEX == 5.0){
    return stepFlow(flow4, flow3, false);
  }
  else if (PASSINDEX == 6.0){
    return stepFlow(flow5, flow4, false);
  }
  else if (PASSINDEX == 7.0){
    return stepFlow(flow6, flow5, false);
  }
  else if (PASSINDEX == 8.0){
    return stepFlow(flow7, flow6, false);
  }
  else if (PASSINDEX == 9.0){
    return stepFlow(flow8, flow7, false);
  }
  else if (PASSINDEX == 10.0){
    return colorAntialias(fb0);
  }

  return vec4(1.0, 0.0, 0.0, 1.0);
}
