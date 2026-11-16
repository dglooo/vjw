// Source: donor/visual_system_2/scenes/release/beats_in_4d.synScene (main.glsl + scene.json; script.js restated as VJW_CLOCK) · CC0 1.0
// Author: mrange (Mårten Rånge)
// License: CC0 1.0 Universal (the dedication is kept below)
// VeeJay Wizard, 2026: ported for fx/syn.ts. Changes: the script's vector `ro` is the clocks ro_x/ro_y (rot(ro.x) →
// rot(ro_x)); the clocks follow script.js (per second: dt_blend = speed_control.x + speed_control.y · syn_BassLevel).
// ⚡ syn_BassHits (the kick) is flash-gated: it drives B, the exp(6·B) flash term.
/*{
  "TITLE": "Beats in 4D",
  "CREDIT": "mrange",
  "TAGS": ["mrange", "4D", "fractal", "fourth-dimension", "audio-reactive", "bass-reactive", "mathematical", "abstract", "geometric", "particles", "explosion", "colorful", "psychedelic", "trance"],
  "WIDTH": 1920,
  "HEIGHT": 1080,
  "VJW_FLASH": ["syn_BassHits"],
  "VJW_CLOCK": {
    "ct": [["speed_control.x"], ["speed_control.y", "syn_BassLevel"]],
    "tr": [["translation_speed", "speed_control.x"], ["translation_speed", "speed_control.y", "syn_BassLevel"]],
    "ro_x": [[0.1, "rotation_speed.x", "speed_control.x"], [0.1, "rotation_speed.x", "speed_control.y", "syn_BassLevel"]],
    "ro_y": [[0.1, "rotation_speed.y", "speed_control.x"], [0.1, "rotation_speed.y", "speed_control.y", "syn_BassLevel"]]
  },
  "CONTROLS": [
    {"NAME": "bass_mix", "TYPE": "xy smooth", "DEFAULT": [0.7, 0.7], "MIN": [0, 0], "MAX": [1, 1]},
    {"NAME": "bass_pow", "TYPE": "slider smooth", "DEFAULT": 3, "MIN": 0, "MAX": 6},
    {"NAME": "speed_control", "TYPE": "xy smooth", "DEFAULT": [0.5, 0.5], "MIN": [-2, -1], "MAX": [2, 1]},
    {"NAME": "visual_mix", "TYPE": "xy smooth", "DEFAULT": [0.3, 0.8], "MIN": [0, 0], "MAX": [1, 1]},
    {"NAME": "effect_base0", "TYPE": "xy smooth", "DEFAULT": [0, 1], "MIN": [0, 0], "MAX": [7, 7]},
    {"NAME": "effect_base1", "TYPE": "xy smooth", "DEFAULT": [2, 0], "MIN": [0, 0], "MAX": [7, 7]},
    {"NAME": "flash_color", "TYPE": "color smooth", "DEFAULT": [0.3333, 0.6666, 1], "MIN": [0, 0, 0], "MAX": [1, 1, 1]},
    {"NAME": "zoom_factor", "TYPE": "slider smooth", "DEFAULT": 9, "MIN": 3, "MAX": 20},
    {"NAME": "wcut", "TYPE": "slider smooth", "DEFAULT": 0.2, "MIN": -4, "MAX": 4},
    {"NAME": "translation_speed", "TYPE": "slider smooth", "DEFAULT": 0.5, "MIN": -2, "MAX": 2},
    {"NAME": "rotation_speed", "TYPE": "xy smooth", "DEFAULT": [1, 1], "MIN": [-9, -9], "MAX": [9, 9]},
    {"NAME": "sine_distortion", "TYPE": "xy smooth", "DEFAULT": [29, 0], "MIN": [1, 0], "MAX": [49, 0.5]},
    {"NAME": "orb_burst", "TYPE": "bang smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "shockwave", "TYPE": "bang smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "orbs", "TYPE": "toggle smooth", "DEFAULT": 1, "MIN": 0, "MAX": 1},
    {"NAME": "wires", "TYPE": "toggle smooth", "DEFAULT": 1, "MIN": 0, "MAX": 1}
  ]
}*/
// This file is released under CC0 1.0 Universal (Public Domain Dedication).
// To the extent possible under law, Mårten Rånge has waived all copyright
// and related or neighboring rights to this work.
// See <https://creativecommons.org/publicdomain/zero/1.0/> for details.

float beat() {
#ifdef KODELIFE
  return pow(1.-fract(TIME),2.);
#else
  return dot(pow(vec2(syn_BassLevel,syn_BassHits), vec2(bass_pow)), bass_mix);
#endif
}

#ifdef KODELIFE
const float
  media_transparency  = 0.7
, media_multiplier    = 1.0
, zoom_factor         = 9.0
, wcut                = 0.2
, translation_speed   = 0.5
;

const vec2
  bass_mix        = vec2(0.5, 0.5)
, bass_pow        = vec2(4.0, 1.0)
, speed_control   = vec2(0.5, 0.5)
, visual_mix      = vec2(1.0, 1.0)
, effect_base0    = vec2(0.0, 1.0)
, effect_base1    = vec2(2.0, 0.0)
, rotation_speed  = vec2(1.0, 2.0)
, sine_distortion = vec2(29.0, 0.0)
;

const vec3
  flash_color = vec3(0.3333, 0.6666, 1.0)
;
#endif

// License: Unknown, author: Claude Brezinski, found: https://mathr.co.uk/blog/2017-09-06_approximating_hyperbolic_tangent.html
vec3 tanh_approx(vec3 x) {
  //  Found this somewhere on the interwebs
  //  return tanh(x);
  vec3 x2 = x*x;
  return clamp(x*(27.0 + x2)/(27.0+9.0*x2), -1.0, 1.0);
}

mat2 rot(float a) {
  float
      c=cos(a)
    , s=sin(a)
    ;
  return mat2(c,s,-s,c);
}

vec4 renderMain() {
  float
    i
  , z=0.
  , d
  , k
  , B=beat()
#ifdef KODELIFE
  , t=2.*TIME
  , H=0.
#else
  , t=ct // dot(speed_control,vec2(TIME, syn_BassTime))
  , H=syn_BassHits
#endif
  , T=.1*t
  ;
  vec4 media = _loadMedia();
  float lumMed = dot(media.rgb, vec3(1.0))/3.0;
  float mediaOn = _nclamp(syn_MediaType);
  vec2
    C=_xy
  , r=RENDERSIZE
  , U=2.*_uvc
  , S=sin(U*sine_distortion.x*mix(1.0,lumMed,mediaOn))
  ;
  vec3
    I=normalize(vec3(C-.5*r,(1.+H*sine_distortion.y*dot(U,U)*S.x*S.y)*r.y))
  , o=vec3(0)
  ;
  vec4
    p
  , P
  , M
  ;

  mat2
    R0=rot(T)
  , R1=rot(ro_x)
  , R2=rot(ro_y)
  ;

  for(i=0.;i<79.;++i) {
    p=vec4(z*I,wcut),

    p.z-=3.;

    p.xw*=R0;
    p.yw*=R1;
    p.zw*=R2;

    p*=k=zoom_factor/dot(p,p);

    P=p-=tr;

    p=abs(p-round(p));

    d=abs(
     min(
       min(
           sqrt(min(min(dot(p.xz,p.xz),dot(p.yz,p.yz)), dot(p.xy,p.xy)))+(1.-wires)*.2
         , length(p)-.2-orb_burst*.2+(1.-orbs)*.2
         )
       , 1.*min(p.w-shockwave*.2*length(_uvc),min(p.x,min(p.z,p.y)))+.05)
       )/k;

    if (syn_MediaType>0.5){
      vec4 img = _loadMedia();
      p=1.+sin(P.z+log2(k)+img*vec4(3.0,3.0,3.0,3.0));
    } else{
      p=1.+sin(P.z+log2(k)+vec4(effect_base0,effect_base1));
    }
    o+=visual_mix.x*exp(.6*k+6.*B-6.)*1.*flash_color;
    o+=visual_mix.y*p.w/max(d,1e-3)*p.xyz;
    z+=.8*d+1e-3;
  }

  o=clamp(o/1e4,0.,1.);
  o=tanh_approx(o)/0.9;
  o=mix(o,vec3(0),isnan(o));
#ifndef KODELIFE
  // M=_loadMedia();
  // o=mix(o,M.xyz,M.w*media_transparency*media_multiplier);
#endif
  return vec4(o,1);
}
