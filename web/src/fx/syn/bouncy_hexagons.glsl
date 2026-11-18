// Source: donor/visual_system_2/scenes/release/bouncy_hexagons.synScene (main.glsl + scene.json + fbm.png; script.js restated as VJW_CLOCK) · CC0 1.0
// Author: mrange (Mårten Rånge)
// License: CC0 1.0 Universal (the dedication is kept below; the helpers keep their own licence lines)
// VeeJay Wizard, 2026: ported for fx/syn.ts (IMAGES t_fbm from public/syn/bouncy_hexagons/fbm.png). syn_Spectrum is
// the adapter's FFT row (its .z: the donor's smoothed one, ours unsmoothed); syn_UserImage is black (no media yet), the
// media_mode code stays off behind syn_MediaType 0. The script's clocks add per frame (no dt): restated per second at
// the donor's 60 fps (x 60). ES 3.00 literals: *13 → *13.0, *8 → *8.0, *2* → *2.0*, vec2(textureSize(...)).
// res .25 → .85 (2026-11-19, agents/guides/guide_syn_res_085.md): max_marches_1 90 → 60
/*{
  "TITLE": "Bouncy Hexagons",
  "CREDIT": "mrange",
  "TAGS": ["mrange", "bouncy", "audio-reactive", "hexagon", "3D", "raymarching", "music-visualization", "geometric", "frequency", "procedural", "landscape", "spectrum", "grid", "bass-reactive", "donor"],
  "WIDTH": 1920,
  "HEIGHT": 1080,
  "PASSES": [{"DOUBLE_BUFFER": false, "FILTER": "linear", "FLOAT": true, "HEIGHT": 1080, "TARGET": "pass0", "WIDTH": 1920, "WRAP": "repeat"}],
  "IMAGES": [{"NAME": "t_fbm", "PATH": "fbm.png"}],
  "VJW_CLOCK": {
    "cam_speed": [[0.6, "speed"], [3, "speed", "syn_BassPresence"]],
    "wave_speed": [[0.6, "wave_bar_speed"], [6, "wave_bar_speed", "syn_MidLevel"], [6, "wave_bar_speed", "syn_MidHighLevel"]]
  },
  "CONTROLS": [
    {"NAME": "bouncy_islands", "TYPE": "xy smooth", "DEFAULT": [0.45, 0.7], "MIN": [0, 0], "MAX": [1, 1], "PARAMS": 0.1},
    {"NAME": "black_freq", "TYPE": "xy", "DEFAULT": [0.05, 0.2], "MIN": [0, 0], "MAX": [0.5, 0.5]},
    {"NAME": "red_freq", "TYPE": "xy smooth", "DEFAULT": [0.25, 0.3], "MIN": [0, 0], "MAX": [0.5, 0.5], "PARAMS": 0.2},
    {"NAME": "world_zoom", "TYPE": "xy smooth", "DEFAULT": [0.57735, 1], "MIN": [0.2, 0.2], "MAX": [2, 2], "PARAMS": 0.22401},
    {"NAME": "spect_bar_height", "TYPE": "slider smooth", "DEFAULT": 0.5, "MIN": 0, "MAX": 1, "PARAMS": 0.06301},
    {"NAME": "wave_bar_height", "TYPE": "slider smooth", "DEFAULT": 1, "MIN": 0, "MAX": 1, "PARAMS": 0.06001},
    {"NAME": "wave_bar_speed", "TYPE": "knob smooth", "DEFAULT": 1, "MIN": -1, "MAX": 1, "PARAMS": 0.06101},
    {"NAME": "minimal_mode", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "tops_vs_sides", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "red_col", "TYPE": "color smooth", "DEFAULT": [1, 0, 0], "MIN": [0, 0, 0], "MAX": [1, 1, 1], "PARAMS": 0.2},
    {"NAME": "black_col", "TYPE": "color smooth", "DEFAULT": [0.001, 0.001, 0.001], "MIN": [0, 0, 0], "MAX": [1, 1, 1], "PARAMS": 0.2},
    {"NAME": "white_col", "TYPE": "color smooth", "DEFAULT": [1, 1, 1], "MIN": [0, 0, 0], "MAX": [1, 1, 1], "PARAMS": 0.2},
    {"NAME": "border_col", "TYPE": "color smooth", "DEFAULT": [0.0, 1, 1], "MIN": [0, 0, 0], "MAX": [1, 1, 1], "PARAMS": 0.2},
    {"NAME": "fog_col", "TYPE": "color", "DEFAULT": [0, 0, 0], "MIN": [0, 0, 0], "MAX": [1, 1, 1]},
    {"NAME": "media_mode", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "media_scale", "TYPE": "slider smooth", "DEFAULT": 1, "MIN": 0, "MAX": 5, "PARAMS": 0.2},
    {"NAME": "light_dir", "TYPE": "knob smooth", "DEFAULT": 1.82, "MIN": 0, "MAX": 7, "PARAMS": 0.2},
    {"NAME": "motion_blur", "TYPE": "slider smooth", "DEFAULT": 0.3, "MIN": 0, "MAX": 0.95, "PARAMS": 0.2},
    {"NAME": "vignette", "TYPE": "slider smooth", "DEFAULT": 1, "MIN": 1.3, "MAX": 0.7, "PARAMS": 0.20101},
    {"NAME": "auto_light_dir", "TYPE": "toggle smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1, "PARAMS": 0.06401},
    {"NAME": "speed", "TYPE": "slider smooth", "DEFAULT": 1, "MIN": -5, "MAX": 5, "PARAMS": 0.07001},
    {"NAME": "height", "TYPE": "slider smooth", "DEFAULT": 20, "MIN": 12, "MAX": 32, "PARAMS": 0.2},
    {"NAME": "look_dir", "TYPE": "knob smooth", "DEFAULT": 0, "MIN": 0, "MAX": 7, "PARAMS": 0.01601},
    {"NAME": "camera_tilt", "TYPE": "xy smooth", "DEFAULT": [0, 0], "MIN": [-0.75, -0.75], "MAX": [0.5, 0.5], "PARAMS": 0.01501},
    {"NAME": "fov", "TYPE": "knob smooth", "DEFAULT": 1, "MIN": 0.3, "MAX": 1, "PARAMS": 0.05601}
  ]
}*/
// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, Mårten Rånge has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

#ifdef KODELIFE
const float
  light_dir   =0.
, look_dir    =0.
, height      =20.
, motion_blur =.3
, vignette   = 1.
;

const vec2
//   bar_height    =vec2(11,3.5)
, bouncy_islands=vec2(.65,.8)
, black_freq    =vec2(.05,.4)
, red_freq      =vec2(.25,.3)
, world_zoom    =vec2(.57735,1)
;

const vec3
  black_col =vec3(1e-3)
, border_col=vec3(1)
, red_col   =vec3(1,0,0)
, white_col =vec3(1)
;
#endif

// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
const vec4 hsv2rgb_K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + hsv2rgb_K.xyz) * 6.0 - hsv2rgb_K.www);
  return c.z * mix(hsv2rgb_K.xxx, clamp(p - hsv2rgb_K.xxx, 0.0, 1.0), c.y);
}
// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
//  Macro version of above to enable compile-time constants
#define HSV2RGB(c)  (c.z * mix(hsv2rgb_K.xxx, clamp(abs(fract(c.xxx + hsv2rgb_K.xyz) * 6.0 - hsv2rgb_K.www) - hsv2rgb_K.xxx, 0.0, 1.0), c.y))

const float
  // VJW: was 90 (res .25 → .85, agents/guides/guide_syn_res_085.md)
  max_marches_1 = 60.
, tolerance_1   = 1e-3
, max_depth_1   = 100.
, normal_eps_1  = 1e-3
, TAU=2.*PI
, top_plane=9.
;

float fbm(vec2 p) {
  const float
#ifdef KODELIFE
    off=.4
#else
    off=.2
#endif
  ;

  return (texture(t_fbm,2e-3*(p-.5*vec2(-1,1)*wave_speed)+.5).x-off)*wave_bar_height*13.0;
}

float fbm2(vec2 p) {
  float
    a=0.
  , aa=1.
  , i
  , d=0.
  ;

  for (i=0.;i<3.;++i) {
    a+=aa*sin(p.x);
    d+=aa;
    aa*=.5;
    p*=mat2(6,8,-8,6)/5.;
    p+=1.234;
  }

  return a/d;
}

float freq(float x, vec2 o) {
#ifdef KODELIFE
  return smoothstep(.0,.9,sin(TAU*x*wave_speed));
#else
  float f=texture(syn_Spectrum,o.x+o.y*x).z;
  f*=f;
  f*=f;
  f*=spect_bar_height*8.0;
  return f;
#endif
}

// License: Unknown, author: Unknown, found: don't remember
float hash(vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,58.233))) * 13758.5453);
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm
vec2 hexagon(vec2 p, vec2 r) {
  p=p.yx;
  const vec3
    k = 0.5*vec3(-sqrt(3.0), 1, sqrt(4.0/3.0))
  ;

  p = abs(p);
  p -= 2.0*min(dot(k.xy,p),0.0)*k.xy;

  vec2
    p0=p
  , p1=p
  ;

  p0-=vec2(clamp(p0.x, -k.z*r.x, k.z*r.x), r.x);
  p1.x=abs(p1.x);
  p1-=r.y*vec2(sqrt(1./3.),1);

  return vec2(length(p0)*sign(p0.y),length(p1));
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/articles/distfunctions/
vec3 hexagon(vec3 p, vec3 r) {
  vec2
    d   = hexagon(p.xz,r.xy)
  , w0  = vec2(d.x,abs(p.y)-r.z)
  ;
  return vec3(
    min(max(w0.x,w0.y),0.)+length(max(w0,0.))
  , d
  )
  ;
}

// License: Unknown, author: Martijn Steinrucken, found: https://www.youtube.com/watch?v=VmrIDyYiJBA
vec2 hextile(inout vec2 p) {
  // See Art of Code: Hexagonal Tiling Explained!
  // https://www.youtube.com/watch?v=VmrIDyYiJBA
  const vec2
    sz       = vec2(1, 1.7320508)
  , hsz      = 0.5*sz
  ;

  vec2
    p1 = mod(p, sz)-hsz
  , p2 = mod(p - hsz, sz)-hsz
  , p3 = dot(p1, p1) < dot(p2, p2) ? p1 : p2
  , n = ((p3 - p + hsz)/sz)
  ;
  p = p3;

  n -= vec2(0.5);
  // Rounding to make hextile 0,0 well behaved
  return floor(n*2.0+.5)*0.5;
}

float nearest_hex_wall(vec2 p, vec2 rd) {
  const mat3x2
    PROJ = mat3x2(
        vec2(1 ,  0       )
      , vec2(.5, .8660253 )
      , vec2(.5, -.8660253)
      )
  ;

  vec3
    pp  = p*PROJ
  , prd = rd*PROJ
  , ird = 1./prd
  , dro = (sign(prd)*.5)-pp
  , dt  = dro*ird
  ;

  return min(min(dt.x, dt.y), dt.z);
}

// In
vec2
  g_hsrd
, g_ird
, g_rd
;


// Out
vec2
  g_g
;
vec3
  g_col
;

float df_1(vec3 p) {
  vec2 texSize = vec2(textureSize(syn_UserImage,0));
  vec2 asp = vec2(texSize.y/texSize.x, 1.0);
  float mediaOn = _nclamp(syn_MediaType);
  vec3 media = _textureMedia(p.xz*0.05*media_scale*asp).rgb*1.5;
  vec3 media2 = _textureMedia(p.yz*vec2(0.1,0.05)*media_scale*asp.yx+p.x*0.1).rgb*1.5;


  if(p.y>top_plane) {
    return p.y-top_plane+1.;
  }

  vec3
    p0=p
  , p1=p
  , d0
  ;

  vec2
    n
  , c=p.xz
  ;
  ;

  n=hextile(c);
  n*=world_zoom;

//   c.y-=tun_speed-1.5;
//   n=hextile(c);
//   n*=world_zoom;
//   n.y+=speed-1.5;

  p0.xz=c;

  float
    h0=hash(n)
  , h1=fract(8667.*h0)
  , h
  , d1=p1.y
  , d
  , f
  , F
  , cd
  ;
  h=fbm(n);

  vec3 wCol = mediaOn>0.5?media*(1.0-_pulse(h, 0.0, 3.0)):white_col;
  vec3
    col=wCol
  ;

  cd=1e-3+nearest_hex_wall(c,g_rd);

  F=fbm2(0.231*n);
  // f = _pulse(abs(F)*2, bouncy_islands.x*2, pow(bouncy_islands.y,2.0)*4);
  // f=smoothstep(bouncy_islands.x-bouncy_islands.y,bouncy_islands.x*2.0-bouncy_islands.y*1.5,abs(F));
  // if (bouncy_islands.x>bouncy_islands.y){
  //   f=-smoothstep(bouncy_islands.y, bouncy_islands.x, abs(F));
  // }
  vec2 islandFix = vec2(bouncy_islands.x, 1.0-bouncy_islands.y);
  f = smoothstep(islandFix.x-islandFix.y, islandFix.x+islandFix.y, abs(F));

  // f = smoothstep(min(bouncy_islands.x, bouncy_islands.y), max(bouncy_islands.x, bouncy_islands.y), abs(F));

  h=mix(h,freq(h1,F>0.?red_freq:black_freq),f);
  d0=hexagon(p0,vec3(.40,.45,h))-vec3(0.05,0,0);
  vec3 media3 = _textureMedia((d0.yz*2.0+p.y*0.1)*media_scale*0.2).rgb*1.5;
  media2 = media_mode<0.5?media:media2;
  media3 = media_mode<0.5?media:media3;
  vec3 bCol = mediaOn>0.5?media2:black_col;
  vec3 rCol = mediaOn>0.5?media3:red_col;

  col=mix(col,F>0.?rCol:bCol,f);

  // Cool bug
  // g_col=hexagon(p0,vec3(.40,.45,h))-vec3(0.05,0,0);

  g_col=col;
  g_g=d0.yz;

  d=d0.x;
  d=min(d,cd);
  d=min(d,d1);

  return d;
}

float ray_march_1(vec3 ro, vec3 rd, float initz) {
  g_hsrd=sign(rd.xz)*.5;
  g_rd=rd.xz;
  g_ird=1./(rd.xz);

  float
    d
  , i
  , z=initz
  ;

  for (i=0.;i<max_marches_1;++i) {
    d=df_1(ro+rd*z);
    if(d<tolerance_1||z>max_depth_1) {
      break;
    }
    z+=d;
  }

  return z;
}

vec3 normal_1(vec3 p) {
  vec2
    e=vec2(normal_eps_1,0)
  ;
  return normalize(vec3(
      df_1(p+e.xyy)-df_1(p-e.xyy)
    , df_1(p+e.yxy)-df_1(p-e.yxy)
    , df_1(p+e.yyx)-df_1(p-e.yyx)
    ));
}

void rot(inout vec2 p, float a) {
  float
    c=cos(a)
  , s=sin(a)
  ;
  p=vec2(c*p.x+s*p.y,c*p.y-s*p.x);
}

//3D Rotation
vec3 rot3d(in vec3 x, in vec3 r) {
    x.xy = _rotate(x.xy, r.z);
    x.yz = _rotate(x.yz, r.x);
    x.zx = _rotate(x.zx, r.y);
    return x;
}

vec3 render1(vec3 ro, vec3 rd) {
  vec3
    ld=normalize(vec3(-1,.5,1))
  ;
  rot(ld.xz,light_dir+sin(syn_Time*.15)*2.0*auto_light_dir);

  float
    z
  , Z
  , T
  ;

  vec2
    g
  ;

  vec3
    col=white_col
  , bcol
  , p
  , n
  ;

  T=(top_plane-ro.y)/rd.y;
  z=ray_march_1(ro,rd,max(T,0.));
  g=g_g;
  bcol=g_col;
  p=ro+rd*z;
  n=normal_1(p);
  Z=ray_march_1(p+1e-1*n,ld,1e-1);



  if (z<max_depth_1) {
    bcol=mix(
        .1*sign(bcol)
      , bcol
      , mix(
          .25
        , 1.
        , smoothstep(
            .02
          , .04
          , min(
              g.y
            , abs(g.x-.05+mix(.04,.03,n.y))
          )
        )
      )
    );
    float line = smoothstep(.02*tops_vs_sides,.01*tops_vs_sides, g.x);

    bcol=mix(border_col,bcol,smoothstep(.07,.06,g.x)-line*minimal_mode);
    bcol*=min(
      dot(n,ld)>0.?1.:0.25
    , Z<max_depth_1?mix(1.,.25,exp(-.05*Z)):1.
    );
    col=bcol;
  }

  col=mix(fog_col,col,exp(-.2*max(z-.5*max_depth_1,0.)));

  return col;
}

float length8(vec2 p) {
  p*=p;
  p*=p;
  return pow(dot(p,p),1./8.);
}

vec4 fpass0() {
  const vec3
    Z=normalize(vec3(-1,-1,1))
  , X=normalize(cross(Z,vec3(0,1,0)))
  , Y=cross(X,Z)
  ;

  vec2
    p=2.*fov*_uvc
  ;

  vec3
#ifdef KODELIFE
    ro=vec3(0,height,cam_speed)
#else
    ro=vec3(0,height,cam_speed)
#endif
  , rd =normalize(-p.x*X+p.y*Y+2.*Z)
  , col
  ;
  rd = rot3d(rd,vec3(camera_tilt.x,look_dir,camera_tilt.y));
//   rot(rd.xy,camera_dir.y);

  col=render1(ro,rd);
  col = mix(vec3(0,0,0), col, smoothstep(0.3,-.3,length8(-1.+2.*_uv)-vignette));
  col=max(col,0.);
  col=sqrt(col);
  if (syn_MediaType>0.5){
    col = _rgb2hsv(col);
    col.g *= 1.4;
    col = _hsv2rgb(col);
  }
  return vec4(col,1.);
}

// License: Unknown, author: XorDev, found: https://github.com/XorDev/GM_FXAA
vec4 fxaa(sampler2D tex, vec2 uv, vec2 texelSz) {
  // See this blog
  // https://mini.gmshaders.com/p/gm-shaders-mini-fxaa

  // Maximum texel span
  const float span_max    = 8.0;
  // These are more technnical and probably don't need changing:
  // Minimum "dir" reciprocal
  const float reduce_min  = (1.0/128.0);
  // Luma multiplier for "dir" reciprocal
  const float reduce_mul  = (1.0/32.0);

  const vec3  luma        = vec3(0.299, 0.587, 0.114);

  // Sample center and 4 corners
  vec3 rgbCC = texture(tex, uv).rgb;
  vec3 rgb00 = texture(tex, uv+vec2(-0.5,-0.5)*texelSz).rgb;
  vec3 rgb10 = texture(tex, uv+vec2(+0.5,-0.5)*texelSz).rgb;
  vec3 rgb01 = texture(tex, uv+vec2(-0.5,+0.5)*texelSz).rgb;
  vec3 rgb11 = texture(tex, uv+vec2(+0.5,+0.5)*texelSz).rgb;

  //Get luma from the 5 samples
  float lumaCC = dot(rgbCC, luma);
  float luma00 = dot(rgb00, luma);
  float luma10 = dot(rgb10, luma);
  float luma01 = dot(rgb01, luma);
  float luma11 = dot(rgb11, luma);

  // Compute gradient from luma values
  vec2 dir = vec2((luma01 + luma11) - (luma00 + luma10), (luma00 + luma01) - (luma10 + luma11));

  // Diminish dir length based on total luma
  float dirReduce = max((luma00 + luma10 + luma01 + luma11) * reduce_mul, reduce_min);

  // Divide dir by the distance to nearest edge plus dirReduce
  float rcpDir = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);

  // Multiply by reciprocal and limit to pixel span
  dir = clamp(dir * rcpDir, -span_max, span_max) * texelSz.xy;

  // Average middle texels along dir line
  vec4 A = 0.5 * (
      texture(tex, uv - dir * (1.0/6.0))
    + texture(tex, uv + dir * (1.0/6.0))
    );

  // Average with outer texels along dir line
  vec4 B = A * 0.5 + 0.25 * (
      texture(tex, uv - dir * (0.5))
    + texture(tex, uv + dir * (0.5))
    );


  // Get lowest and highest luma values
  float lumaMin = min(lumaCC, min(min(luma00, luma10), min(luma01, luma11)));
  float lumaMax = max(lumaCC, max(max(luma00, luma10), max(luma01, luma11)));

  // Get average luma
  float lumaB = dot(B.rgb, luma);

  //If the average is outside the luma range, using the middle average
  return ((lumaB < lumaMin) || (lumaB > lumaMax)) ? A : B;
}

vec4 fpass1() {
  vec4
    pcol
  , mcol
  , col
  ;

#define FXAA
#ifdef FXAA
  col = fxaa(pass0,_uv,sqrt(2.)/RENDERSIZE);
#else
  col =  texture(pass0,_uv);
#endif

// #ifndef KODELIFE
//   mcol=_loadMedia();
//   col.xyz=mix(col.xyz,mcol.xyz,mcol.w*media_opacity*media_multiplier);
// #endif

  pcol=texture(syn_FinalPass,_uv);
  col.xyz=mix(col.xyz,pcol.xyz,motion_blur);

  col.w=1.;
  return col;
}

vec4 renderMain() {
  switch(PASSINDEX)
  {
  case 0:
    return fpass0();
  default:
    return fpass1();
  }
}
