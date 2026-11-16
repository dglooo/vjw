// Source: donor/visual_system_2/scenes/release/hills_eels.synScene (main.glsl + scene.json; script.js restated in GLSL) · unknown
// Author: Victor S.
// License: unknown (the donor's CREDIT names Victor S. only; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts. The script sets six uniforms each frame as plain functions of the
// inputs (no clock): they are the six globals at the top of the body. Changes: GLSL ES 3.00 literals; the zoetrope
// loop's index is float(i); the screen pass is opaque. fb0/fb1 (FLOAT, 1920x1920 of the donor's 1920x1080 frame) are
// the feedback pair, the screen pass draws the zoetrope copies of fb0. Both targets WRAP repeat (added: the zoetrope
// reads fb1 at x + 2/7 each frame; on a clamped target the frame stayed black here).
/*{
  "TITLE": "Hills, Eels",
  "CREDIT": "Victor S.",
  "TAGS": ["feedback", "media", "2d", "colorful", "psychedelic", "donor"],
  "WIDTH": 1920,
  "HEIGHT": 1080,
  "PASSES": [{"FLOAT": true, "HEIGHT": 1920, "TARGET": "fb0", "WIDTH": 1920, "WRAP": "repeat"}, {"FLOAT": true, "HEIGHT": 1920, "TARGET": "fb1", "WIDTH": 1920, "WRAP": "repeat"}],
  "CONTROLS": [
    {"NAME": "saturate", "TYPE": "knob", "DEFAULT": 0.5, "MIN": 0, "MAX": 1},
    {"NAME": "rate", "TYPE": "slider", "DEFAULT": 0.8, "MIN": 0, "MAX": 1},
    {"NAME": "palette", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "dark", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "warp", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "hue_range", "TYPE": "slider", "DEFAULT": 0.75, "MIN": 0, "MAX": 1},
    {"NAME": "tune", "TYPE": "knob", "DEFAULT": 0, "MIN": -1, "MAX": 1},
    {"NAME": "glitch", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "reverse", "TYPE": "toggle", "DEFAULT": 1, "MIN": -1, "MAX": 1},
    {"NAME": "invert", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "spacing", "TYPE": "toggle", "DEFAULT": 2, "MIN": 1, "MAX": 2},
    {"NAME": "wavelength", "TYPE": "knob", "DEFAULT": 0.5, "MIN": 0, "MAX": 1},
    {"NAME": "peak", "TYPE": "slider", "DEFAULT": 0.667, "MIN": 0.25, "MAX": 1},
    {"NAME": "push", "TYPE": "bang smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "density", "TYPE": "knob", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "auto_peak", "TYPE": "toggle", "DEFAULT": 1, "MIN": 0, "MAX": 1},
    {"NAME": "auto_push", "TYPE": "toggle", "DEFAULT": 1, "MIN": 0, "MAX": 1},
    {"NAME": "auto_density", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "media", "TYPE": "slider", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "auto_tune", "TYPE": "toggle", "DEFAULT": 1, "MIN": 0, "MAX": 1},
    {"NAME": "manual", "TYPE": "bang", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "lighten", "TYPE": "knob", "DEFAULT": 0.5, "MIN": 0, "MAX": 1}
  ]
}*/
//TODO: improve audio-reactivity at low zoetrope rates?
// VeeJay Wizard: script.js's per-frame uniforms, restated (never run). spectrum_0…3 = its getSpectrum() (bass, mids,
// high mids, highs); zoe_denom = denoms[11, 7, 5] picked by `wavelength`; strobe = 1 on every n-th frame, n from `rate`.
float spectrum_0 = sqrt(max(0.0, syn_BassLevel * 1.33 - 0.33));
float spectrum_1 = clamp((syn_MidPresence - syn_BassLevel / 2.0) * 1.5 - 0.5, 0.0, 1.0);
float spectrum_2 = clamp(syn_MidHighPresence * 1.5 - 0.5, 0.0, 1.0);
float spectrum_3 = clamp(syn_HighPresence * 2.0 - 1.0, 0.0, 1.0);
float zoe_denom = wavelength < 0.25 ? 11.0 : wavelength < 0.75 ? 7.0 : 5.0;
float strobe = (rate > 0.0 && mod(FRAMECOUNT, floor(16.0 * pow(1.0 - rate, 2.0) + 1.0)) == 0.0) ? 1.0 : 0.0;

vec3 d = 1./vec3(RENDERSIZE, 1.);

const float pi = 3.14159265359;
const float eps = 1e-15;

vec4 spectrum = vec4(spectrum_0, spectrum_1, spectrum_2, spectrum_3);

float zoe_num = spacing;
float zoe = zoe_num/zoe_denom;

float mean(vec3 x){
  return (x.r+x.g+x.b)/3.0;
}

vec4 fbMain(in sampler2D state, in vec2 p){
  vec4 ant = vec4(.1);
  float lift = 0.5*(1.125-peak + 0.5*(1.0-auto_push));
  float w = (1.0+rate)*push*64.0 + lift*36.0 + auto_push*pow(
    length((spectrum-ant)/(1.-ant)),
    2.0
  )*32.0;

  float window = smoothstep(0.0, 1.0, min(1.0, 4.0*min(p.x, 1.0-p.x)));
  vec4 e0 = window*(
    cos(2.0*pi*(p.x*vec4(1.0,2.0,3.0,4.0)+spectrum.abgr/4.0+syn_BPMTwitcher*2./vec4(13.0,-14.0,15.0,-16.0)))*.5+.5 + d.y
  );

  float peak_ = peak*pow(2.,
    auto_peak*(dot(spectrum,vec4(.5,.3,.15,.05))-.5)
  );

  vec4 c0 = .5+.5*cos(
    2.0*pi*(p.x+spectrum)*vec4(2.0,1.0,3.0,1.0)*pow(2.0, -3.0*(1.0-hue_range))
  );
  c0 = mix(c0.rgba, c0.agba, .5);

  if (media > 0.0){
    c0 = mix(c0, _textureMedia(vec2(_uv.x, peak_-_uv.y)), media);
  }

  vec4 w0 = vec4(1, 0.667, 0.5, 0.33);
  float ind = float( strobe > 0.0 || manual>0.0);

  float h = pow(length(e0*w0)*peak_*0.7, 1.5)+2.0*d.y;
  vec4 s0 = vec4(c0.rgb, float(p.y < h));
  // vec4 lc = mix(vec4(1-dark), 1-s0, line_mode);
  // s0 = mix(s0, lc, clamp(lines-abs(p.y-h)/d.y, 0, 1));

  float h2 = d.y*length(e0*w0)*w;
  float y_prev = clamp(p.y - min(h, h2), .5*d.y, 1.0);
  float tune_ = tune + auto_tune*cos(2.0*pi*syn_Intensity);
  vec4 c_prev = texture(state, vec2(
    pow(2.0, tune_)*reverse*zoe*ind+p.x,
    y_prev
  ));

  c_prev = mix(c_prev, c_prev.brga, .016)+(lighten-0.5)*.03;
  vec4 c = mix(c_prev, s0, s0.a);
  c  = mix(c, clamp(c+(c-mean(c.rgb))/2.0, 0.0, 1.0), saturate*0.06);
  return mix(c, fract(c), glitch);
}
vec4 fbAux(in sampler2D state, in vec2 p){
  vec4 c0 = texture(state, p);
  if (warp > 0.0){
    float amt = 32.0*syn_BassHits*warp;
    return texture(state, vec2(
      p.x+(c0.r-c0.g)*d.x*amt, max(d.y, p.y-c0.b*d.y*amt)
    ));
  }
  return c0;
}
vec4 blur(in sampler2D state, in vec2 p){
  return (2.*texture(state, p)
    + texture(state, p+d.xz)
    + texture(state, p-d.xz)
    + texture(state, p+d.zy)
    + texture(state, p-d.zy)
    )/6.;
}
vec3 sorted(vec3 x){
  if(x.r >= x.g && x.g >= x.b) return x.bgr;
  if(x.r <= x.g && x.g <= x.b) return x;
  if(x.g >= x.r && x.r >= x.b) return x.brg;
  if(x.g <= x.r && x.r <= x.b) return x.grb;
  if(x.r >= x.b && x.b >= x.g) return x.gbr;
  return x.rbg;
}
vec4 colorize(vec4 c0){
  if(palette<1.0){
    float green = c0.g*(1.0-c0.r)*(1.0-c0.b);
    c0 = mix(c0, vec4(0.0,0.4,0.7,1), green);
    float magenta = c0.r*c0.b*(1.0-c0.g);
    c0 = mix(c0, vec4(0.7, 0.1, 0.0, 1), magenta);
    float yellow = c0.g*c0.r*(1.0-c0.b);
    c0 = mix(c0, vec4(0.9,0.4,0.0,1), yellow);
    float cyan = (1.0-c0.r)*c0.g*c0.b;
    c0 = mix(c0, vec4(0.0,0.7,0.9,0), cyan);

  }else{
    float green = c0.g*(1.0-c0.r)*(1.0-c0.b);
    c0 = mix(c0, vec4(1,0,0,1), green);
    float yellow = c0.g*c0.r*(1.0-c0.b);
    c0 = mix(c0, vec4(1,0,1,1), yellow);
    float cyan = (1.0-c0.r)*c0.g*c0.b;
    c0 = mix(c0, vec4(0.5,0,1,0), cyan);
    // float white = c0.r*c0.g*c0.b;
    // c0 = mix(c0, mix(vec4(1, 0.8, 0.7, 1), vec4(0.9, 0.7, 1, 1), _uv.y), white*white);
    // float magenta = c0.r*c0.b*(1-c0.g);
    // c0 = mix(c0, vec4(0.7, 0.8, 0.2, 1), magenta*magenta);
  }

  return c0;
}

vec4 postMain(in sampler2D state, in vec2 p){
  if (invert>0.0) p = vec2(p.x, 1.0-p.y);
  // vec4 spectrum = getSpectrum();
  float drop = 0.5;
  float drop_ = drop*peak;
  float density_ctrl = sqrt(syn_MidHits*syn_MidHighHits);
  float density_ = mix(density, density_ctrl, auto_density);

  vec4 c0 = colorize(texture(state, (p+vec2(0.0, drop_))*vec2(1.0, 1./(1.0+drop_))));
  vec4 c1;
  for (int i=1; i<int(1.0+(zoe_denom-1.0)*density_); i++){
    c1 = colorize(texture(state,
      (p+vec2(-pow(2.0, tune)*reverse*float(i)*zoe, drop_))
      *vec2(1.0, 1./(1.0+drop_))
    ));
    vec3 lum = 2.0*vec3(.48, .81, 0.1);
    float l1 = dot(c1.rgb, lum);
    float l0 = dot(c0.rgb, lum);
    float m = tanh(4.0*(l1 - l0)*(1.0-2.0*dark))*.5+.5;
    c0 = mix(c0, c1, m);
  }

  c0 = clamp(c0, 0.0, 1.0);
  return clamp(
    mix(c0*1.3-0.05, c0*c0*abs(3.0-dot(c0, c0))*1.2-0.2, dark),
    0.0, 1.0);
}
vec4 initialCondition(in vec2 p){
  return vec4(0);
}

vec4 renderMain0() {
  if (FRAMECOUNT<=2.0){
    return initialCondition(_uv);
  }
  if (PASSINDEX == 0.0){
    // if (freeze > 0) return texture(fb1, _uv);
    return fbMain(fb1, _uv);
  }
  else if (PASSINDEX == 1.0){
    // if (freeze > 0) return texture(fb0, _uv);
    return fbAux(fb0, _uv);
    // return texture(fb0, _uv);
    // return blur(fb0, _uv);
  }
  else if (PASSINDEX == 2.0){
    return postMain(fb0, _uv);
  }

  return vec4(1.0, 0.0, 0.0, 1.0);
}
// VeeJay Wizard: the screen pass is opaque (ours composites straight alpha; the donor ignores its output alpha).
vec4 renderMain() { vec4 c = renderMain0(); if (PASSINDEX == 2) c.a = 1.0; return c; }
