// Source: donor/visual_system_2/scenes/release/dark_twister.synScene (main.glsl + scene.json; script.js restated as VJW_CLOCK) · CC0 1.0
// Author: mrange (Mårten Rånge)
// License: CC0 1.0 Universal (the dedication is kept below)
// VeeJay Wizard, 2026: ported for fx/syn.ts, body unchanged. The script's clocks add per frame (no dt): restated per
// second at the donor's 60 fps (x 60). syn_FinalPass (the motion blur) = the screen pass's own TARGET (fx/syn.ts).
// ⚡ syn_BassHits (the kick) is flash-gated: it drives B, the flash sphere's colour, size and the x10 flash_mix.
// res .25 → .85 (2026-11-19, agents/guides/guide_syn_res_085.md): max_steps 90 → 60
/*{
  "TITLE": "Dark Twister",
  "CREDIT": "mrange",
  "TAGS": ["mrange", "dark", "twister", "vortex", "tunnel", "audio-reactive", "bass-reactive", "neon", "spiral", "recursive", "raymarch", "mysterious"],
  "WIDTH": 1920,
  "HEIGHT": 1080,
  "VJW_FLASH": ["syn_BassHits"],
  "VJW_CLOCK": {
    "lum_speed": [[0.48, "beam_rate"], [1.8, "beam_rate", "syn_Hits"]],
    "tun_speed": [[0.6, "zoom_speed"], [1.8, "zoom_speed", "syn_BassPresence"]],
    "rot_speed": [[0.6, "rotation_speed"], [0.9, "rotation_speed", "syn_MidPresence"], [0.9, "rotation_speed", "syn_MidHighPresence"]]
  },
  "CONTROLS": [
    {"NAME": "bass_mix", "TYPE": "xy smooth", "DEFAULT": [0.7, 0.7], "MIN": [0, 0], "MAX": [1, 1]},
    {"NAME": "bass_pow", "TYPE": "slider smooth", "DEFAULT": 3, "MIN": 0, "MAX": 6},
    {"NAME": "flash_mix", "TYPE": "xy smooth", "DEFAULT": [0.5, 5], "MIN": [0, 0], "MAX": [9, 9]},
    {"NAME": "flash_dist", "TYPE": "slider smooth", "DEFAULT": 5, "MIN": 0.5, "MAX": 10},
    {"NAME": "flash_radius", "TYPE": "xy smooth", "DEFAULT": [1, 2], "MIN": [0.001, 0.001], "MAX": [5, 5]},
    {"NAME": "motion_blur", "TYPE": "slider smooth", "DEFAULT": 0.3, "MIN": 0, "MAX": 0.88},
    {"NAME": "ref_focus", "TYPE": "slider smooth", "DEFAULT": 190, "MIN": 1, "MAX": 300},
    {"NAME": "ref_factor", "TYPE": "slider smooth", "DEFAULT": 0.1, "MIN": 0, "MAX": 1},
    {"NAME": "camera_swing", "TYPE": "xy smooth", "DEFAULT": [6, 4], "MIN": [-9, -9], "MAX": [9, 9]},
    {"NAME": "rotation_speed", "TYPE": "knob smooth", "DEFAULT": 0.2, "MIN": -1, "MAX": 1},
    {"NAME": "zoom_speed", "TYPE": "knob", "DEFAULT": 0.35, "MIN": 0, "MAX": 1},
    {"NAME": "warp_swing", "TYPE": "xy smooth", "DEFAULT": [0, 0], "MIN": [0, 0], "MAX": [1, 1]},
    {"NAME": "warp_on", "TYPE": "toggle smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "fov", "TYPE": "slider smooth", "DEFAULT": 0.5, "MIN": 0.3, "MAX": 1},
    {"NAME": "flash_col_min", "TYPE": "color", "DEFAULT": [0.1, 0.3, 1], "MIN": [0, 0, 0], "MAX": [1, 1, 1]},
    {"NAME": "beam_hue", "TYPE": "xy smooth", "DEFAULT": [0.6, 0.6], "MIN": [0, 0], "MAX": [1, 1]},
    {"NAME": "flash_col_max", "TYPE": "color smooth", "DEFAULT": [0.3, 0.66666, 1], "MIN": [0, 0, 0], "MAX": [1, 1, 1]},
    {"NAME": "beam_lum", "TYPE": "slider smooth", "DEFAULT": 0.5, "MIN": 0, "MAX": 3},
    {"NAME": "beam_rate", "TYPE": "knob smooth", "DEFAULT": -0.1, "MIN": -1, "MAX": 1},
    {"NAME": "media_opacity", "TYPE": "slider smooth", "DEFAULT": 0.4, "MIN": 0, "MAX": 1},
    {"NAME": "media_depth", "TYPE": "slider smooth", "DEFAULT": 0.35, "MIN": 0, "MAX": 1},
    {"NAME": "media_displacement", "TYPE": "slider smooth", "DEFAULT": 1, "MIN": -2, "MAX": 2}
  ]
}*/
// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, Mårten Rånge has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

// #include "lygia/math/aastep.glsl"
// #include "lygia/math/aafract.glsl"
// #include "lygia/math/aafloor.glsl"
// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
vec4 hsv2rgb_K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + hsv2rgb_K.xyz) * 6.0 - hsv2rgb_K.www);
  return c.z * mix(hsv2rgb_K.xxx, clamp(p - hsv2rgb_K.xxx, 0.0, 1.0), c.y);
}
// License: WTFPL, author: sam hocevar, found: https://stackoverflow.com/a/17897228/418488
//  Macro version of above to enable compile-time constants
#define HSV2RGB(c)  (c.z * mix(hsv2rgb_K.xxx, clamp(abs(fract(c.xxx + hsv2rgb_K.xyz) * 6.0 - hsv2rgb_K.www) - hsv2rgb_K.xxx, 0.0, 1.0), c.y))

#define ROT(a)      mat2(cos(a), sin(a), -sin(a), cos(a))

float
  TAU=2.*PI
, max_dist  = 10.
// VJW: was 90. (res .25 → .85, agents/guides/guide_syn_res_085.md)
, max_steps = 60.
, norm_eps  = 5e-4
, tolerance = 5e-4
;

#ifdef KODELIFE
float
  beam_lum    =3.5
, flash_dist  =3.
, motion_blur =.3
, ref_factor  =.1
, ref_focus   =190.
, beam_rate   =1.
;

vec2
  bass_mix      =vec2(.7,.7)
, bass_pow      =vec2(3,2)
, beam_hue      =vec2(.7,.2)
, flash_mix     =vec2(.5,5)
, flash_radius  =vec2(1,2)
, path_a        =vec2(1,sqrt(.5))/6.
, camera_swing        =vec2(6,-4)
, time_mix      =vec2(.5,.25)
;

vec3
  flash_col_max=HSV2RGB(vec3(.58,.7,1.))
, flash_col_min=HSV2RGB(vec3(.63,.9,1.))
;
#endif

float beat() {
#ifdef KODELIFE
  return pow(1.-fract(TIME),2.);
#else
  return dot(pow(vec2(syn_BassLevel,syn_BassHits), vec2(bass_pow)), bass_mix);
#endif
}

// Outputs from distance field function
float
  g_G
, g_G0
, g_H
, g_T
;
mat2
  g_R
;
vec3
  g_L
;
vec3 path(float z){
  return vec3(camera_swing*sin(vec2(.15,.19)*z),z);
}

vec3 dpath(float z){
  return vec3(camera_swing*vec2(.15,.19)*cos(vec2(.15,.19)*z),1);
}

vec3 ddpath(float z){
  return -vec3(camera_swing*vec2(.15,.19)*vec2(.15,.19)*sin(vec2(.15,.19)*z),0);
}

void warpWorld(inout vec3 p){
  vec3
    warp = path(p.z)
  , dwarp = normalize(dpath(p.z))
  ;
  p.xy -= warp.xy;
  dwarp.xy *= warp_swing*vec2(-3,2)*warp_on;
  p -= dwarp*dot(vec3(p.xy, 0), dwarp)*.5*vec3(1,1,-1);
}

// License: MIT, author: Inigo Quilez, found: https://iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm
float roundedX(vec2 p, float w, float r) {
  p = abs(p);
  return length(p-min(p.x+p.y,w)*.5) - r;
}

float hash(vec2 co) {
  return fract(sin(dot(co.xy ,vec2(12.9898,58.233))) * 13758.5453);
}

float df(vec2 p, float a) {
  mat2
    R45=ROT(radians(45.))
  ;
  mat2
    R=ROT(a)
  ;
  float
    d=1e3
  , g
  , S=.5
  , H
  ;
  vec2
    P
  , s=vec2(0.)
  , I
  ;
  for(int i=0;i<3;++i) {
    p*=R;
    s+=S*sign(p);
    p=abs(p)-S;
    d=min(d,roundedX(p,.25*S,.05*(S)));
    P=p;
    P*=R45;
    I=sign(P);
    P=abs(P);
    P-=.125*S;
    H=hash(s+.123*I);
    g=length(P)+.05*(smoothstep(1.,.9,sin(lum_speed+.5*a+TAU*fract(8667.*H))));
    if (g<g_G) {
      g_G=g;
      g_H=H;
    }
    d=min(d,g);
    S*=.45;
  }
  return d;
}

float df(vec3 p)  {
  float
    d0=length(p-g_L)-0.1
  , d1
  ;

  warpWorld(p);
  p.xy*=g_R;
  d1=df(p.xy,p.z);
  g_G0=min(g_G0,d0);
  return min(d0,d1);
}

vec3 nf(vec3 p) {
  vec2 e=vec2(norm_eps,0);
  return normalize(vec3(
    df(p+e.xyy)-df(p-e.xyy)
  , df(p+e.yxy)-df(p-e.yxy)
  , df(p+e.yyx)-df(p-e.yyx)
  ));
}


// License: MIT, author: Inigo Quilez, found: https://www.iquilezles.org/www/articles/spherefunctions/spherefunctions.htm
float raySphereDensity(vec3 ro, vec3 rd, vec4 sph, float dbuffer) {
  float ndbuffer = dbuffer/sph.w;
  vec3  rc = (ro - sph.xyz)/sph.w;
  float b = dot(rd,rc);
  float c = dot(rc,rc) - 1.0;
  float h = b*b - c;
  if(h<0.0) return 0.0;
  h = sqrt(h);
  float t1 = -b - h;
  float t2 = -b + h;
  if(t2<0.0 || t1>ndbuffer) return 0.0;
  t1 = max(t1, 0.0);
  t2 = min(t2, ndbuffer);
  float i1 = -(c*t1 + b*t1*t1 + t1*t1*t1/3.0);
  float i2 = -(c*t2 + b*t2*t2 + t2*t2*t2/3.0);
  return (i2-i1)*(3.0/4.0);
}

float raymarch(vec3 O, vec3 I, float initz, out float iter) {
  float
    i
  , z=initz
  , d
  ;
  for(i=0.;i<max_steps;++i) {
    d=df(I*z+O);
    if(z>max_dist || d < tolerance) {
      break;
    }
    z+=.9*d;
  }
  iter = i;
  return z;
}

// License: Unknown, author: Claude Brezinski, found: https://mathr.co.uk/blog/2017-09-06_approximating_hyperbolic_tangent.html
vec3 tanh_approx(vec3 x) {
  //  Found this somewhere on the interwebs
  //  return tanh(x);
  vec3 x2 = x*x;
  return clamp(x*(27.0 + x2)/(27.0+9.0*x2), -1.0, 1.0);
}

vec3 render3D() {
  float
    i
  , B=beat()
  , D
  , F
  , G
  , G0
  , H
  , L
#ifdef KODELIFE
  , T=TIME
#else
// //   , T=dot(vec2(TIME,syn_BassTime),time_mix)
//   , T=dot(vec2(TIME,syn_BassTime),time_mix)
#endif
  , z=tun_speed
  ;
//   g_T=T;
  vec2
    p=2.0*fov*_uvc;
  vec3
    O=path(z)
  , L0=path(z+flash_dist)
  , Z=normalize(dpath(z))
  , X=normalize(cross(vec3(0,1,0)-ddpath(z),Z))
  , Y=cross(X,Z)
  , I=normalize(p.x*X+p.y*Y+2.*Z)
  , col=vec3(0)
  , P
  , N
  , R
  , RR
  , LD0
  , FL=mix(flash_col_min, flash_col_max,B)*mix(flash_mix.x, flash_mix.y, B)
  ;
  vec4
    pcol
  , mcol
  ;
  g_L=L0;
  //rotation
  g_R=ROT(rot_speed);
  g_G=1e3;
  g_G0=1e3;
  z=raymarch(O,I,.1,i);
  G=g_G;
  G0=g_G0;
  H=g_H;
  P=O+I*z;
  LD0=normalize(L0-P);
  N=nf(P);
  F=1.+dot(N,I);
  F=mix(.1,5.,F*F*F)*smoothstep(1.,.99,F);
  R=reflect(I,N);
  RR=refract(I,N,.1);
  if (z<max_dist) {
    col+=F*pow(max(dot(R,LD0),0.),ref_focus)*200.*ref_factor/dot(O-L0,O-L0)*FL;
  }
  
  D=raySphereDensity(O,I,vec4(L0,mix(flash_radius.x, flash_radius.y, B)),z);
  L=(1.+dot(normalize(O-L0),I));
  col+=D*D*FL;
  col+=1e-2/max(G0,2e-3)*FL;
  col+=100.*(G0<=tolerance?(pow(abs(dot(RR,I)),10.)):0.)*FL;
  col+=pow(1e-4/max(G*G,2e-6)*hsv2rgb(vec3(beam_hue.x+beam_hue.y*beam_hue.y*H,.9,0.2*beam_lum)),vec3(clamp(beam_lum,1.0,3.0)))*clamp(beam_lum,1.0,3.0);
  col-=1e-1*L*vec3(2,3,1);
  col=clamp(col,0.,9.);
  col=tanh_approx(col);
  col=sqrt(col);
#ifndef KODELIFE
  float fade = _pulse(z/max_dist, 0.0, pow(media_depth, 3.0)*10.1);
  mcol=_loadMedia(vec2(z*z*0.012*media_displacement*abs(media_displacement)*7.0))*fade;
  if (_isMediaActive()){
  col = mix(col, col*(1.0-media_opacity)+mcol.xyz*3.0, pow(media_opacity,1.0));
  }
  // col=mix(col,mcol.xyz,mcol.w);
#endif  
  pcol=texture(syn_FinalPass,_uv);
  col=mix(col,pcol.xyz,motion_blur);
  return col;
}

vec3 render2D() {
  vec2
    p =_uvc
  ;

  float
    aa=sqrt(.5)/RENDERSIZE.y
  , d=df(p,.1*TIME)
  ;

  return vec3(1)*smoothstep(aa,-aa,d);
}

vec4 renderMain() {
  return vec4(render3D(),1);
}
