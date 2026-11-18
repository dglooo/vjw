// Source: donor/visual_system_2/glsl/01_preamble.txt + 02_img_helpers.txt, 03_hue_saturation.txt, 04_edge_detect.txt, 05_noise_fbm.txt · unknown (strings recovered from a commercial live-visual app, no licence header)
// Author: the donor app (anonymised in donor/visual_system_2/report.md); _hsv2rgb/_rgb2hsv: sam hocevar (WTFPL, https://stackoverflow.com/a/17897228/418488)
// License: unknown (app resource strings, copied as text; recorded per spec §6); _hsv2rgb/_rgb2hsv WTFPL
// VeeJay Wizard, 2026: the whole donor helper library, once, compiled after each fx/syn scene's uniforms (fx/syn.ts).
// Generated from the five files (scratchpad/donor-vs2/preamble.py): one top-level item per line; ES 3.00 literal fixes
// (no implicit int -> float); `_xy`, `_uv`, `_uvc` are set by main() (an ES 3.00 global initializer must be constant).
// No media input and no meta-control chain yet: each helper that reads syn_Media, syn_UserImage, syn_MediaType or a
// meta-control uniform (_Hue, _Media_Scale, ...) is a hand-written stub of the same signature (listed first) returning
// what the donor's returns at rest: no media (type 0, black 1 x 1), every meta-control neutral (brightness, contrast,
// gamma, master, media scale 1; hue, saturation, invert 0; no mirror, no colour limit, alpha off; images zoom to fill).
#define syn_Prefs_ZoomOrFit 1.0 // the app preference: images zoom to fill (no bars)
vec2 _xy, _uv, _uvc; // gl_FragCoord.xy; / RENDERSIZE; centred, y -.5...5 and x on the same unit
// The media and meta-control stubs (first: the helpers below call them). At rest the donor's hue/saturation pass clamps
// to 0..1 (an rgb -> hsv -> rgb round trip) and its master clamps; the media reads are black; the rest pass through.
bool _isMediaActive() { return false; }
vec2 _flipMediaCoords(vec2 pos) { return pos; }
vec2 _applyMediaScale(vec2 uv) { return uv; }
vec2 _mediaSize() { return vec2(1.0); }
float _ratioFix(float wr, float hr) { return syn_Prefs_ZoomOrFit > 0.5 ? max(wr, hr) : min(wr, hr); }
vec4 _imageToMask(vec4 colIn) { return vec4(step(0.5, dot(colIn.rgb, vec3(0.2126, 0.7152, 0.0722)))); }
vec2 _correctUserImageCoords(vec2 uv) { return uv; }
vec4 _applyMaster(vec4 colIn) { return clamp(colIn, 0.0, 1.0); }
vec4 _applyBrightness(vec4 colIn) { return colIn; }
vec4 _applyGamma(vec4 colIn) { return colIn; }
vec4 _applyContrast(vec4 color) { return color; }
vec4 _applyMediaContrast(vec4 color) { return color; }
vec4 _applyMediaGamma(vec4 color) { return color; }
vec4 _applyMediaHueSaturation(vec4 color) { return vec4(clamp(color.rgb, 0.0, 1.0), color.a); }
vec4 _applyHueSaturation(vec4 colIn) { return vec4(clamp(colIn.rgb, 0.0, 1.0), colIn.a); }
vec4 _applyInvert(vec4 colIn) { return colIn; }
vec4 _applyInvertMedia(vec4 colIn) { return colIn; }
vec4 _applyDichrome(vec4 colIn) { return colIn; }
vec2 _applyVerticalMirroring(vec2 posIn) { return posIn; }
vec2 _applyHorizontalMirroring(vec2 posIn) { return posIn; }
vec4 _applyAlpha(vec4 colorIn) { return vec4(colorIn.rgb, 1.0); }
vec4 _loadMedia() { return vec4(0.0); }
vec4 _loadMedia(vec2 offset) { return vec4(0.0); }
vec4 _textureMedia(vec2 uv) { return vec4(0.0); }
vec4 _loadMediaAsMask() { return vec4(0.0); }
vec4 _loadMediaAsMask(vec2 offset) { return vec4(0.0); }
vec4 _textureMediaAsMask(vec2 uv) { return vec4(0.0); }
vec4 _loadMedia(float lod) { return vec4(0.0); }
vec4 _loadMedia(vec2 offset, float lod) { return vec4(0.0); }
vec4 _textureMedia(vec2 uv, float lod) { return vec4(0.0); }
vec4 _loadMediaAsMask(float lod) { return vec4(0.0); }
vec4 _loadMediaAsMask(vec2 offset, float lod) { return vec4(0.0); }
vec4 _textureMediaAsMask(vec2 uv, float lod) { return vec4(0.0); }
vec4 _applyHueSaturationContrast(vec4 colIn) { return vec4(clamp(colIn.rgb, 0.0, 1.0), colIn.a); }
vec4 _edgeDetectMedia() { return vec4(0.0); }
vec4 _edgeDetectSobelMedia() { return vec4(0.0); }
// The helpers:
const float PI = 3.14159265359;
vec2 _toPolar(vec2 v) { return vec2(length(v), atan(v.y/v.x)); }
vec2 _toPolarTrue(vec2 uv){ float r = length(uv); float theta = 0.0; float real = uv.x; float imag = uv.y; if (real > 0.0 && imag >= 0.0) theta = atan(imag/real); if (real <= 0.0 && imag > 0.0) theta = -1.0*atan(real/imag)+PI/2.0; if (real < 0.0 && imag <= 0.0) theta = atan(imag/real)+PI; if (real >= 0.0 && imag < 0.0) theta = -1.0*atan(real/imag)+3.0*PI/2.0; theta = theta/(2.0*PI); return vec2(r, theta); }
vec2 _toRect(vec2 v) { return vec2(v.r * cos(v.t), v.r * sin(v.t)); }
vec2 _rotate(vec2 v, float t) { mat2 T = mat2(cos(t), -sin(t), sin(t), cos(t)); return T*v; }
vec3 _hsv2rgb(vec3 c) { vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
vec3 _rgb2hsv(vec3 c) { vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec4 _brightness(vec4 color, float brightness){ return color * brightness; }
vec3 _brightness(vec3 color, float brightness){ return color * brightness; }
vec3 _gamma(vec3 color, float gamma){ color.rgb = pow(color.rgb, 1.0/vec3(gamma)); return color; }
vec4 _gamma(vec4 color, float gamma){ color.rgb = _gamma(color.rgb, gamma); return color; }
vec3 _contrast(vec3 color, float contrast) { color = (color - 0.5) * contrast + 0.5; return color; }
vec4 _contrast(vec4 color, float contrast) { color.rgb = _contrast(color.rgb, contrast); return color; }
vec3 _saturation(vec3 color, float saturation) { vec3 hsv = _rgb2hsv(color); hsv.y *= saturation; return _hsv2rgb(hsv); }
vec4 _saturation(vec4 color, float saturation) { color.rgb = _saturation(color.rgb, saturation); return color; }
vec3 _invert(vec3 color, float invert) { return mix(color, 1.0-color, invert); }
vec4 _invert(vec4 color, float invert) { return mix(color, 1.0-color, invert); }
float _luminance(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }
float _luminance(vec4 color) { return _luminance(color.rgb); }
vec3 _grayscale(vec3 rgb, float intensity){ float luminance = _luminance(rgb); return mix(rgb, vec3(luminance), clamp(intensity, 0.0, 1.0)); }
vec4 _grayscale(vec4 rgba, float intensity){ rgba.rgb = _grayscale(rgba.rgb, intensity); return rgba; }
vec3 _grayscale(vec3 rgb){ return _grayscale(rgb, 1.0); }
vec4 _grayscale(vec4 rgba){ return _grayscale(rgba, 1.0); }
vec3 _dichrome(vec3 color, vec3 lowColor, vec3 highColor) { float luminance = _luminance(color); luminance = sqrt(luminance); luminance *= 3.0; vec3 black = vec3(0.0); vec3 white = vec3(1.0); if (luminance <= 1.0){ color = mix(black, lowColor, clamp(luminance,0.0,1.0)); } else if (luminance <= 2.0){ color = mix(lowColor, highColor, clamp(luminance-1.0,0.0,1.0)); } else if (luminance <= 3.0){ color = mix(highColor, white, clamp(luminance-2.0,0.0,1.0)); } return color; }
vec4 _dichrome(vec4 color, vec3 lowColor, vec3 highColor) { color.rgb = _dichrome(color.rgb, lowColor, highColor); return color; }
vec3 _normalizeRGB(float r, float g, float b) { r = clamp(r,0.0,255.0); g = clamp(g,0.0,255.0); b = clamp(b,0.0,255.0); return vec3(r,g,b)/255.0; }
vec3 _hueRotate(vec3 color, float rot) { float hue = radians(rot); const vec3 k = vec3(0.57735, 0.57735, 0.57735); float cosAngle = cos(hue); return vec3(color * cosAngle + cross(k, color) * sin(hue) + k * dot(k, color) * (1.0 - cosAngle)); }
vec4 _hueRotate(vec4 color, float rot) { color.rgb = _hueRotate(color.rgb, rot); return color; }
float _smin( float a, float b, float k ) { float res = exp( -k*a ) + exp( -k*b ); return -log( res )/k; }
float _pixelate(float x, float amount) { return floor(x*amount)/amount; }
vec2 _pixelate(vec2 x, float amount) { return floor(x*amount)/amount; }
vec3 _pixelate(vec3 x, float amount) { return floor(x*amount)/amount; }
float _rand(float seed){return fract(sin(seed) * 43758.5453123);}
float _rand(vec2 seed) { return fract(sin(dot(seed, vec2(12.9898, 4.1414))) * 43758.5453); }
float _scale(float var, float min, float max) { return var * (max - min) + min; }
float _statelessContinuousChaotic(float t){ float primes[10] = float[](2.,3.,5.,7.,11.,13.,17.,19.,23.,29.); float chaosTotal = 0.0; for (int i = 0; i<10; i++){ chaosTotal+=float(i)*sin(primes[i]*t); } return sin(chaosTotal); }
bool _exists(sampler2D tex) { ivec2 size = textureSize(tex, 0); if (size.x <= 1 && size.y <= 1) { return false; } return true; }
vec3 _palette(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d) { return a + b*cos( 6.28318*(c*t+d) ); }
float _pulse(float variable, float center, float width){ return (smoothstep(center-width, center, variable)-(smoothstep(center, center+width, variable))); }
float _sqPulse(float variable, float center, float width){ return step(center-width, variable)-step(center+width, variable); }
float _inRange(float value, float minimum, float maximum) { return step(minimum, value) - step(maximum, value); }
float _inRange(vec2 value, float minimum, float maximum) { return _inRange(value.x, minimum, maximum) * _inRange(value.y, minimum, maximum); }
float _inRange(vec3 value, float minimum, float maximum) { return _inRange(value.x, minimum, maximum) * _inRange(value.y, minimum, maximum) * _inRange(value.z, minimum, maximum); }
float _inRange(vec4 value, float minimum, float maximum) { return _inRange(value.x, minimum, maximum) * _inRange(value.y, minimum, maximum) * _inRange(value.z, minimum, maximum) * _inRange(value.w, minimum, maximum); }
float _inRange(float value) { return _inRange(value, 0.0, 1.0); }
float _inRange(vec2 value) { return _inRange(value, 0.0, 1.0); }
float _inRange(vec3 value) { return _inRange(value, 0.0, 1.0); }
float _inRange(vec4 value) { return _inRange(value, 0.0, 1.0); }
float _triWave(float var, float period){ float up = (abs(mod(var,period))-period/2.0)/period; float down = (abs(mod(-var,period))-period/2.0)/period; if (mod(var, period)<period/2.0){ return up; } else { return down; } }
void _uvc2uv(inout vec2 posIn){ posIn *= 0.5; posIn += 0.5; }
void _uv2uvc(inout vec2 posIn){ posIn *= 2.0; posIn -= 1.0; }
float _mix3(float val1, float val2, float val3, float mixVal){ mixVal *= 2.0; float mix1 = clamp(mixVal,0.0,1.0); float mix2 = clamp(mixVal-1.0, 0.0, 1.0); return mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal)); }
vec2 _mix3(vec2 val1, vec2 val2, vec2 val3, float mixVal){ mixVal *= 2.0; float mix1 = clamp(mixVal,0.0,1.0); float mix2 = clamp(mixVal-1.0, 0.0, 1.0); return mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal)); }
vec3 _mix3(vec3 val1, vec3 val2, vec3 val3, float mixVal){ mixVal *= 2.0; float mix1 = clamp(mixVal,0.0,1.0); float mix2 = clamp(mixVal-1.0, 0.0, 1.0); return mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal)); }
vec4 _mix3(vec4 val1, vec4 val2, vec4 val3, float mixVal){ mixVal *= 2.0; float mix1 = clamp(mixVal,0.0,1.0); float mix2 = clamp(mixVal-1.0, 0.0, 1.0); return mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal)); }
float _mix4(float val1, float val2, float val3, float val4, float mixVal){ mixVal *= 3.0; float mix1 = clamp(mixVal,0.0,1.0); float mix2 = clamp(mixVal-1.0, 0.0, 1.0); float mix3 = clamp(mixVal-2.0, 0.0, 1.0); float firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal)); return mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal)); }
vec2 _mix4(vec2 val1, vec2 val2, vec2 val3, vec2 val4, float mixVal){ mixVal *= 3.0; float mix1 = clamp(mixVal,0.0,1.0); float mix2 = clamp(mixVal-1.0, 0.0, 1.0); float mix3 = clamp(mixVal-2.0, 0.0, 1.0); vec2 firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal)); return mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal)); }
vec3 _mix4(vec3 val1, vec3 val2, vec3 val3, vec3 val4, float mixVal){ mixVal *= 3.0; float mix1 = clamp(mixVal,0.0,1.0); float mix2 = clamp(mixVal-1.0, 0.0, 1.0); float mix3 = clamp(mixVal-2.0, 0.0, 1.0); vec3 firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal)); return mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal)); }
vec4 _mix4(vec4 val1, vec4 val2, vec4 val3, vec4 val4, float mixVal){ mixVal *= 3.0; float mix1 = clamp(mixVal,0.0,1.0); float mix2 = clamp(mixVal-1.0, 0.0, 1.0); float mix3 = clamp(mixVal-2.0, 0.0, 1.0); vec4 firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal)); return mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal)); }
float _mix5(float val1, float val2, float val3, float val4, float val5, float mixVal){ mixVal *= 4.0; float mix1 = clamp(mixVal,0.0,1.0); float mix2 = clamp(mixVal-1.0, 0.0, 1.0); float mix3 = clamp(mixVal-2.0, 0.0, 1.0); float mix4 = clamp(mixVal-3.0, 0.0, 1.0); float firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal)); float third = mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal)); float fourth = mix(third, mix(val4, val5, mix4), step(3.0, mixVal)); return fourth; }
vec2 _mix5(vec2 val1, vec2 val2, vec2 val3, vec2 val4, vec2 val5, float mixVal){ mixVal *= 4.0; float mix1 = clamp(mixVal,0.0,1.0); float mix2 = clamp(mixVal-1.0, 0.0, 1.0); float mix3 = clamp(mixVal-2.0, 0.0, 1.0); float mix4 = clamp(mixVal-3.0, 0.0, 1.0); vec2 firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal)); vec2 third = mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal)); vec2 fourth = mix(third, mix(val4, val5, mix4), step(3.0, mixVal)); return fourth; }
vec3 _mix5(vec3 val1, vec3 val2, vec3 val3, vec3 val4, vec3 val5, float mixVal){ mixVal *= 4.0; float mix1 = clamp(mixVal,0.0,1.0); float mix2 = clamp(mixVal-1.0, 0.0, 1.0); float mix3 = clamp(mixVal-2.0, 0.0, 1.0); float mix4 = clamp(mixVal-3.0, 0.0, 1.0); vec3 firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal)); vec3 third = mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal)); vec3 fourth = mix(third, mix(val4, val5, mix4), step(3.0, mixVal)); return fourth; }
vec4 _mix5(vec4 val1, vec4 val2, vec4 val3, vec4 val4, vec4 val5, float mixVal){ mixVal *= 4.0; float mix1 = clamp(mixVal,0.0,1.0); float mix2 = clamp(mixVal-1.0, 0.0, 1.0); float mix3 = clamp(mixVal-2.0, 0.0, 1.0); float mix4 = clamp(mixVal-3.0, 0.0, 1.0); vec4 firstTwo = mix(mix(val1, val2, mix1), mix(val2, val3, mix2), step(1.0, mixVal)); vec4 third = mix(firstTwo, mix(val3, val4, mix3), step(2.0, mixVal)); vec4 fourth = mix(third, mix(val4, val5, mix4), step(3.0, mixVal)); return fourth; }
float _nsin(float valIn){ return 0.5+0.5*sin(valIn); }
float _ncos(float valIn){ return 0.5+0.5*cos(valIn); }
float _nclamp(float var){ return clamp(var, 0.0, 1.0); }
vec2 _nclamp(vec2 var){ return clamp(var, vec2(0.0), vec2(1.0)); }
vec3 _nclamp(vec3 var){ return clamp(var, vec3(0.0), vec3(1.0)); }
vec4 _nclamp(vec4 var){ return clamp(var, vec4(0.0), vec4(1.0)); }
float _map(float value, float min, float max, float new_min, float new_max) { return new_min + (value - min) * (new_max - new_min) / (max - min); }
vec2 _map(vec2 value, vec2 min, vec2 max, vec2 new_min, vec2 new_max) { return new_min + (value - min) * (new_max - new_min) / (max - min); }
vec3 _map(vec3 value, vec3 min, vec3 max, vec3 new_min, vec3 new_max) { return new_min + (value - min) * (new_max - new_min) / (max - min); }
vec4 _map(vec4 value, vec4 min, vec4 max, vec4 new_min, vec4 new_max) { return new_min + (value - min) * (new_max - new_min) / (max - min); }
float _hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float _hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float _hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 _hash21(float p) { vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec2 _hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec2 _hash23(vec3 p3) { p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
vec3 _hash31(float p) { vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xxy+p3.yzz)*p3.zyx); }
vec3 _hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz+33.33); return fract((p3.xxy+p3.yzz)*p3.zyx); }
vec3 _hash33(vec3 p3) { p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz+33.33); return fract((p3.xxy + p3.yxx)*p3.zyx); }
vec4 _hash41(float p) { vec4 p4 = fract(vec4(p) * vec4(.1031, .1030, .0973, .1099)); p4 += dot(p4, p4.wzxy+33.33); return fract((p4.xxyz+p4.yzzw)*p4.zywx); }
vec4 _hash42(vec2 p) { vec4 p4 = fract(vec4(p.xyxy) * vec4(.1031, .1030, .0973, .1099)); p4 += dot(p4, p4.wzxy+33.33); return fract((p4.xxyz+p4.yzzw)*p4.zywx); }
vec4 _hash43(vec3 p) { vec4 p4 = fract(vec4(p.xyzx) * vec4(.1031, .1030, .0973, .1099)); p4 += dot(p4, p4.wzxy+33.33); return fract((p4.xxyz+p4.yzzw)*p4.zywx); }
vec4 _hash44(vec4 p4) { p4 = fract(p4 * vec4(.1031, .1030, .0973, .1099)); p4 += dot(p4, p4.wzxy+33.33); return fract((p4.xxyz+p4.yzzw)*p4.zywx); }
float _mirror(float x) { if (mod(floor(x), 2.0) == 1.0) x = 1.0-x; return mod(x, 1.0); }
vec2 _mirror(vec2 xy) { xy.x = _mirror(xy.x); xy.y = _mirror(xy.y); return xy; }
vec3 _mirror(vec3 xyz) { xyz.x = _mirror(xyz.x); xyz.y = _mirror(xyz.y); xyz.z = _mirror(xyz.z); return xyz; }
vec4 _mirror(vec4 xyzw) { xyzw.x = _mirror(xyzw.x); xyzw.y = _mirror(xyzw.y); xyzw.z = _mirror(xyzw.z); xyzw.w = _mirror(xyzw.w); return xyzw; }
vec4 IMG_NORM_PIXEL(sampler2D tex, vec2 uv){ return texture(tex, uv); }
vec4 IMG_PIXEL(sampler2D tex, ivec2 uv){ return texelFetch(tex, uv, 0); }
vec4 IMG_THIS_PIXEL(sampler2D tex){ return texelFetch(tex, ivec2(_xy), 0); }
vec4 IMG_THIS_NORM_PIXEL(sampler2D tex){ return texture(tex, _uv); }
vec4 IMG_PIXEL(sampler2D tex, vec2 uv){ return texelFetch(tex, ivec2(uv), 0); }
vec2 IMG_SIZE(sampler2D tex){ return vec2(textureSize(tex, 0)); }
vec2 _correctImageCoords(vec2 imageSize, vec2 uv) { float wr = RENDERSIZE.x/imageSize.x; float hr = RENDERSIZE.y/imageSize.y; float ratio = _ratioFix(wr, hr); vec2 correctedUv = uv; correctedUv.y *= hr/ratio; correctedUv.x *= wr/ratio; correctedUv.x += -wr/ratio/2.0 + 0.5; correctedUv.y += -hr/ratio/2.0 + 0.5; return correctedUv; }
vec2 _correctImageCoords(vec2 imageSize){ return _correctImageCoords(imageSize, _uv); }
vec2 _correctMediaCoords(vec2 uv) { return _correctImageCoords(_mediaSize(), uv); }
vec2 _correctMediaCoords() { return _correctImageCoords(_mediaSize(), _uv); }
vec4 _loadImage(sampler2D imageName, vec2 offset, bool isRawMedia) { vec2 uv = _correctImageCoords(vec2(textureSize(imageName, 0))); if (isRawMedia) uv = _flipMediaCoords(uv); if (_inRange(uv, 0.0, 1.0) < 0.5) return vec4(0.0); return texture(imageName, uv+offset); }
vec4 _loadImage(sampler2D imageName) { return _loadImage(imageName, vec2(0.0), false); }
vec4 _loadImage(sampler2D imageName, vec2 offset) { return _loadImage(imageName, offset, false); }
vec4 _textureImage(sampler2D imageName, vec2 uv, bool isRawMedia) { uv = _correctImageCoords(vec2(textureSize(imageName, 0)), uv); if (isRawMedia) uv = _flipMediaCoords(uv); return texture(imageName, uv); }
vec4 _textureImage(sampler2D imageName, vec2 uv) { return _textureImage(imageName, uv, false); }
vec4 _loadImageAsMask(sampler2D imageName, vec2 offset, bool isRawMedia) { vec4 color = _loadImage(imageName, offset, isRawMedia); return _imageToMask(color); }
vec4 _loadImageAsMask(sampler2D imageName) { return _loadImageAsMask(imageName, vec2(0.0), false); }
vec4 _loadImageAsMask(sampler2D imageName, vec2 offset) { return _loadImageAsMask(imageName, offset, false); }
vec4 _textureImageAsMask(sampler2D imageName, vec2 uv, bool isRawMedia) { vec4 color = _textureImage(imageName, uv, isRawMedia); return _imageToMask(color); }
vec4 _textureImageAsMask(sampler2D imageName, vec2 uv) { return _textureImageAsMask(imageName, uv, false); }
vec4 _loadImage(sampler2D imageName, vec2 offset, bool isRawMedia, float lod) { vec2 uv = _correctImageCoords(vec2(textureSize(imageName, int(lod)))); if (isRawMedia) uv = _flipMediaCoords(uv); if (_inRange(uv, 0.0, 1.0) < 0.5) return vec4(0.0); return textureLod(imageName, uv+offset, lod); }
vec4 _textureImage(sampler2D imageName, vec2 uv, bool isRawMedia, float lod) { uv = _correctImageCoords(vec2(textureSize(imageName, int(lod))), uv); if (isRawMedia) uv = _flipMediaCoords(uv); return textureLod(imageName, uv, lod); }
vec4 _loadImageAsMask(sampler2D imageName, vec2 offset, bool isRawMedia, float lod) { vec4 color = _loadImage(imageName, offset, isRawMedia, lod); return _imageToMask(color); }
vec4 _textureImageAsMask(sampler2D imageName, vec2 uv, bool isRawMedia, float lod) { vec4 color = _textureImage(imageName, uv, isRawMedia, lod); return _imageToMask(color); }
vec2 _invertYAxisVideo(vec2 pos){ return _flipMediaCoords(pos); }
vec4 _hueSaturationLEGACY(vec4 color, float hue, float saturation){ color.rgb = _rgb2hsv(clamp(color.rgb, 0.0, 1.0)); color.r = color.r+hue; color.g = clamp(color.g+saturation, 0.0, 1.0); color.rgb = _hsv2rgb(color.rgb); return color; }
vec4 _hueSaturation(vec4 color, float hue, float saturation){ color.rgb = _rgb2hsv(clamp(color.rgb, 0.0, 1.0)); color.r = color.r+hue; color.g = clamp(color.g*(saturation*abs(saturation)*2.5+1.0), 0.0, 1.0); color.rgb = _hsv2rgb(color.rgb); return color; }
vec4 _applyColorCorrection(vec4 colIn) { return _applyBrightness(_applyGamma(_applyContrast(_applyHueSaturation(_applyInvert(colIn))))); }
float _zoomOrFit(float wr, float hr){ return syn_Prefs_ZoomOrFit > 0.5 ? max(wr, hr) : min(wr, hr); }
vec4 _applyAllLuminanceCorrections(vec4 colIn){ return _applyMaster(_applyBrightness(_applyGamma(_applyContrast(_applyHueSaturation(_applyInvert(colIn)))))); }
vec4 _hueSaturationContrast(vec4 colIn, float hue, float saturation, float contrast){ colIn = _hueSaturation(colIn, hue, saturation); colIn = _applyContrast(colIn); return colIn; }
vec4 _hueSaturationContrastLEGACY(vec4 colIn, float hue, float saturation, float contrast){ colIn = _hueSaturationLEGACY(colIn, hue, saturation); colIn = _applyContrast(colIn); return colIn; }
vec4 _invertImage(vec4 colIn){ return _applyInvertMedia(colIn); }
vec4 _loadUserImage() { return _loadMedia(); }
vec4 _loadUserImage(vec2 offset) { return _loadMedia(offset); }
vec4 _textureUserImage(vec2 uv) { return _textureMedia(uv); }
vec4 _loadUserImageAsMask() { return _loadMediaAsMask(); }
vec4 _loadUserImageAsMask(vec2 offset) { return _loadMediaAsMask(offset); }
vec4 _textureUserImageAsMask(vec2 uv) { return _textureMediaAsMask(uv); }
vec4 _edgeDetect(sampler2D smp, vec2 uv) { vec4 edgeX = abs(dFdx(texture(smp, uv + 0.5/RENDERSIZE))); vec4 edgeY = abs(dFdy(texture(smp, uv + 0.5/RENDERSIZE))); return max(edgeX,edgeY); }
vec4 _edgeDetect(sampler2D smp) { return _edgeDetect(smp, _uv); }
float _sobelIntensity(in vec4 color){ return sqrt((color.x*color.x)+(color.y*color.y)+(color.z*color.z)); }
float _sobelHelper(float stepx, float stepy, vec2 uv, sampler2D tex){ float tleft = _sobelIntensity(texture(tex, uv + vec2(-stepx,stepy))); float left = _sobelIntensity(texture(tex, uv + vec2(-stepx,0))); float bleft = _sobelIntensity(texture(tex, uv + vec2(-stepx,-stepy))); float top = _sobelIntensity(texture(tex, uv + vec2(0,stepy))); float bottom = _sobelIntensity(texture(tex, uv + vec2(0,-stepy))); float tright = _sobelIntensity(texture(tex, uv + vec2(stepx,stepy))); float right = _sobelIntensity(texture(tex, uv + vec2(stepx,0))); float bright = _sobelIntensity(texture(tex, uv + vec2(stepx,-stepy))); float x = tleft + 2.0*left + bleft - tright - 2.0*right - bright; float y = -tleft - 2.0*top - tright + bleft + 2.0 * bottom + bright; float color = sqrt((x*x) + (y*y)); return color; }
vec4 _edgeDetectSobel(sampler2D tex, vec2 uv) { vec2 stepSize = 1.0 / RENDERSIZE.xy; float edge = _sobelHelper(stepSize.x, stepSize.y, uv, tex); return vec4(edge); }
vec4 _edgeDetectSobel(sampler2D tex) { return _edgeDetectSobel(tex, _uv); }
float _tiltShiftGauss(float x, float e) { return exp(-pow(x, 2.)/e); }
vec4 _hBlurTiltShift(sampler2D texIn, vec2 uv, float blurAmt, float blurLoc) { int blur_size = 1 + int(20.0*blurAmt); float blur_width = 2.; vec4 pixval = vec4(0.); float tot = 0.; int nb = 2*blur_size+1; for (int x=0; x<nb; x++) { float x2 = blur_width*float(x-blur_size); vec2 ipos = uv + vec2(x2/RENDERSIZE.x, 0.); ipos = _mirror(ipos); float g = _tiltShiftGauss(x2, float(20*blur_size)*2.*pow(0.01+abs(uv.y - blurLoc), 2.3)); pixval+= g*texture(texIn, ipos); tot+= g; } return pixval/tot; }
vec4 _hBlurTiltShift(sampler2D texIn, vec2 uv, float blurAmt) { return _hBlurTiltShift(texIn, uv, blurAmt, 0.5); }
vec4 _hBlurTiltShift(sampler2D texIn, vec2 uv) { return _hBlurTiltShift(texIn, uv, 5.0, 0.5); }
vec4 _hBlurTiltShift(sampler2D texIn) { return _hBlurTiltShift(texIn, _uv, 5.0, 0.5); }
vec4 _vBlurTiltShift(sampler2D texIn, vec2 uv, float blurAmt, float blurLoc) { int blur_size = 1 + int(20.0*blurAmt); float blur_width = 2.; vec4 pixval = vec4(0.); float tot = 0.; int nb = 2*blur_size+1; for (int x=0; x<nb; x++) { float x2 = blur_width*float(x-blur_size); vec2 ipos = uv + vec2(0., x2/RENDERSIZE.x); ipos = _mirror(ipos); float g = _tiltShiftGauss(x2, float(20*blur_size)*2.*pow(0.01+abs(uv.y - blurLoc), 2.3)); pixval+= g*texture(texIn, ipos); tot+= g; } return pixval/tot; }
vec4 _vBlurTiltShift(sampler2D texIn, vec2 uv, float blurAmt) { return _vBlurTiltShift(texIn, uv, blurAmt, 0.5); }
vec4 _vBlurTiltShift(sampler2D texIn, vec2 uv) { return _vBlurTiltShift(texIn, uv, 5.0, 0.5); }
vec4 _vBlurTiltShift(sampler2D texIn) { return _vBlurTiltShift(texIn, _uv, 5.0, 0.5); }
vec4 syn_pass_edgeDetectBilinear(sampler2D smp){ return _edgeDetect(smp); }
float syn_sobel_intensity(in vec4 color) { return _sobelIntensity(color); }
float syn_sobel_helper(float stepx, float stepy, vec2 center, sampler2D tex) { return _sobelHelper(stepx, stepy, center, tex); }
float syn_pass_edgeDetectSobel(sampler2D tex) { return _edgeDetectSobel(tex).r; }
float syn_gaussForTiltShift(float x, float e) { return _tiltShiftGauss(x, e); }
vec4 syn_pass_horBlurTiltShift(sampler2D texIn, float blurAmt, float blurLoc) { return _hBlurTiltShift(texIn, _uv, blurAmt, blurLoc); }
vec4 syn_pass_vertBlurTiltShift(sampler2D texIn, float blurAmt, float blurLoc) { return _vBlurTiltShift(texIn, _uv, blurAmt, blurLoc); }
float _noise(float seed){ float _floor = floor(seed); float _remainder = fract(seed); return mix(_rand(_floor), _rand(_floor + 1.0), _remainder); }
float _noise(vec2 seed) { const vec2 d = vec2(0.0, 1.0); vec2 _floor = floor(seed); vec2 _remainder = smoothstep(vec2(0.0), vec2(1.0), fract(seed)); return mix(mix(_rand(_floor), _rand(_floor + d.yx), _remainder.x), mix(_rand(_floor + d.xy), _rand(_floor + d.yy), _remainder.x), _remainder.y); }
float _mod289(float x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 _mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 _perm(vec4 x){return _mod289(((x * 34.0) + 1.0) * x);}
float _noise(vec3 p){ vec3 a = floor(p); vec3 d = p - a; d = d * d * (3.0 - 2.0 * d); vec4 b = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0); vec4 k1 = _perm(b.xyxy); vec4 k2 = _perm(k1.xyxy + b.zzww); vec4 c = k2 + a.zzzz; vec4 k3 = _perm(c); vec4 k4 = _perm(c + 1.0); vec4 o1 = fract(k3 * (1.0 / 41.0)); vec4 o2 = fract(k4 * (1.0 / 41.0)); vec4 o3 = o2 * d.z + o1 * (1.0 - d.z); vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x); return o4.y * d.y + o4.x * (1.0 - d.y); }
float _fbm(float position, float octaves) { float v = 0.0; float a = 0.5; float shift = float(100); for (int i = 0; float(i) < octaves; ++i) { v += a * _noise(position); position = position * 2.0 + shift; a *= 0.5; } return v; }
float _fbm(vec2 position, float octaves) { float v = 0.0; float a = 0.5; vec2 shift = vec2(100); mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50)); for (int i = 0; float(i) < octaves; ++i) { v += a * _noise(position); position = rot * position * 2.0 + shift; a *= 0.5; } return v; }
float _fbm(vec3 position, float octaves) { float v = 0.0; float a = 0.5; vec3 shift = vec3(100); for (int i = 0; float(i) < octaves; ++i) { v += a * _noise(position); position = position * 2.0 + shift; a *= 0.5; } return v; }
float _fbm(float position) { return _fbm(position, 5.0); }
float _fbm(vec2 position) { return _fbm(position, 5.0); }
float _fbm(vec3 position) { return _fbm(position, 5.0); }
