// Source: donor/visual_system_2/scenes/release/milk_honey_smoke_bile.synScene (main.glsl + scene.json) · unknown
// Author: Victor S.
// License: unknown (the donor's CREDIT names Victor S. only; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts. Changes for GLSL ES 3.00: int literals in float maths (about 20 places),
// pow(x, i) -> pow(x, float(i)). A texel of exactly zero starts from the initial condition again (a resize clears our
// pass targets, and a flat field never gets its shape back). Passes: fb0 (the feedback, FLOAT), fb1 (its mirror and
// media mix), the screen.
// ⚡ syn_BassHits is flash-gated: a hit lowers the drag, so the whole field takes a quarter of its next colours at once.
// The pass targets WRAP repeat: scene.json names no WRAP, and OpenGL's initial wrap is GL_REPEAT (the donor's engine is
// OpenGL 3.3 core), so the scene most likely ran repeating; our default is clamp. Seen on milk_honey_smoke_bile:
// clamped, its field is vertical bands within 6 s; repeating, it looks like its thumbnail.
// res .5 → .85 (2026-11-19, agents/guides/guide_syn_res_085.md): res only
/*{
  "TITLE": "Milk, Honey, Smoke, Bile",
  "CREDIT": "Victor S.",
  "TAGS": ["feedback", "media", "intense", "colorful", "donor"],
  "WIDTH": 1920,
  "HEIGHT": 1080,
  "PASSES": [{"FLOAT": true, "TARGET": "fb0", "WRAP": "repeat"}, {"FLOAT": true, "TARGET": "fb1", "WRAP": "repeat"}],
  "VJW_FLASH": ["syn_BassHits"],
  "CONTROLS": [
    {"NAME": "smoke", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0, "MAX": 1},
    {"NAME": "jump", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0, "MAX": 1},
    {"NAME": "twitch", "TYPE": "bang", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "swap", "TYPE": "bang", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "spectral_color", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0, "MAX": 1},
    {"NAME": "bile", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0, "MAX": 1},
    {"NAME": "pinch", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0, "MAX": 1},
    {"NAME": "feed", "TYPE": "slider", "DEFAULT": 0.08, "MIN": -0.2, "MAX": 0.2},
    {"NAME": "warp", "TYPE": "slider", "DEFAULT": 0.5, "MIN": 0, "MAX": 1},
    {"NAME": "mirror", "TYPE": "slider", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "radius", "TYPE": "slider", "DEFAULT": 0.0, "MIN": 0, "MAX": 1},
    {"NAME": "drift", "TYPE": "slider", "DEFAULT": 0.0, "MIN": -8, "MAX": 8},
    {"NAME": "media_mix", "TYPE": "slider", "DEFAULT": 0.0, "MIN": 0, "MAX": 1}
  ]
}*/
vec3 d = 1./vec3(RENDERSIZE, 1.);

const float pi = 3.14159265359;
const float eps = 1e-15;

//get 2d hue from rgb
// x is yellow, y is
vec2 rgb2uv(vec3 c){
  const vec3 b0 = normalize(vec3(1., 1., -2.));
  const vec3 b1 = normalize(vec3(-1., 1., 0));
  vec2 uv = vec2(dot(c, b0), dot(c, b1));
  return uv/(length(uv)+eps);
}

//complex multiplication-based rotation
//a in radians
vec2 rot(vec2 v, float a){
  vec2 w = vec2(cos(a), sin(a));
  return vec2(v.x*w.x-v.y*w.y, v.x*w.y+v.y*w.x);
}

vec3 sorted_broken(vec3 x){
  if(x.r >= x.g && x.g >= x.b) return x.bgr;
  if(x.r <= x.g && x.g <= x.b) return x;
  if(x.g >= x.r && x.r >= x.b) return x.brg;
  if(x.g <= x.r && x.r <= x.b) return x.grb;
  if(x.r >= x.b && x.b >= x.g) return x.rbg;
  return x.gbr;
}
vec3 sorted(vec3 x){
  if(x.r >= x.g && x.g >= x.b) return x.bgr;
  if(x.r <= x.g && x.g <= x.b) return x;
  if(x.g >= x.r && x.r >= x.b) return x.brg;
  if(x.g <= x.r && x.r <= x.b) return x.grb;
  if(x.r >= x.b && x.b >= x.g) return x.gbr;
  return x.rbg;
}

vec3 _rgb2hsl(vec3 rgb){
  vec2 hs = _rgb2hsv(rgb).xy;
  float l = mix(
    max(rgb.r, max(rgb.g, rgb.b)),
    min(rgb.r, min(rgb.g, rgb.b)),
    .5);
  return vec3(hs, l);
}
vec3 _hsl2rgb(vec3 hsl){
  float v = hsl.z/_scale(hsl.y, 1., .5);
  return _hsv2rgb(vec3(hsl.xy, v));
}

vec4 fbMain(in sampler2D state, in vec2 p){
  float highs = clamp(_scale(syn_HighLevel, -1.-syn_HighPresence, 1.), 0., 1.);
  float mids = clamp(_scale(syn_MidLevel-syn_BassHits/2., -0.5-syn_MidPresence, 1.0), 0.0, 1.0);
  float bass = sqrt(max(0.0, _scale(syn_BassHits, -.33, 1.)));
  float highmids = clamp(_scale(syn_MidHighLevel, -0.5-syn_MidHighPresence, 1.0), 0.0, 1.0);
  vec4 spectrum = vec4(bass, mids, highmids, highs);
  float drag = _scale(pow(bass, 3.), 0.97, 0.75);

  vec2 driftv = -d.xy*vec2(0, drift);
  driftv.x =
    twitch * .1 * (
      sin((p.y+syn_RandomOnBeat)*2.0*pi)
      + .5*sin((p.y+fract(syn_RandomOnBeat*100.0))*4.0*pi)
    ) + swap * .5;

  vec4 c0 = texture(state, p+driftv);
  driftv.y -= d.y*pow(2.0, c0.a*4.*(1.0+spectrum.x)-2.)*jump;

  vec4 c1 = texture(state, p+driftv);
  vec2 disp = vec2(0);
  for (int i=0; i<7; i++){
    vec4 cs = vec4(sorted_broken(c1.bar), c1.g);
    vec4 cd = log(mix(exp(cs), exp(c1), spectrum.y));
    disp += (
      mix(1., 1.2*length(_uvc)+0.125, pinch)
      * d.xy * _scale(warp*warp, 0.125, 4.)
      * pow(_scale(pow(spectrum.x, 0.25), 1.667, 1.33), float(i))
      * rot(rgb2uv(cd.rgb), (spectrum.z*.25+cd.a+float(i)*0.5)*pi)
    );
    float update = _scale(pow(spectrum.w, 0.33), 0.3, 0.8);
    c1 = mix(
      c1,
      texture(state, p+disp+driftv),
      update
    );
  }

  vec4 ff = feed * mix(
    vec4(2., 3., 5., 7.)*.25,
    (spectrum)/(length(spectrum)+eps+.5),
    spectral_color
  );
  ff *= float(
    length(_uvc-(1.0-radius)*24.0*driftv*spectrum.x) > radius*sqrt(spectrum.x)
  )*2.0-1.0;
  ff.a += sin(_uv.y*2.0*pi+syn_Time)*smoke*.08; //prevent die-out when smoke on

  vec4 c2 = (c1).gbar;
  vec4 sat = c2 - sorted(c2.rgb).gggg;
  sat = mix(0.02, 0.1, smoke)*sat/(length(sat)+eps);

  c2 = fract(c2+sat+ff);

  vec4 c3 = mix(c2, c1, drag);
  if(syn_OnBeat*smoke==1.0){
    vec3 hsl = _rgb2hsl(c3.rgb);
    c3 = vec4(
      _hsl2rgb(vec3(
        hsl.xy,
        clamp(1.-hsl.z*hsl.z*2., 0., 1.)
      )),
      .5+.5*sin(c3.a*3.*pi)
    );
    c3 = tanh((c3-0.5)*3.)*0.5+0.5;
  }
  return c3;
}
vec4 softmirror(in sampler2D state, float m){
  return mix(texture(state, _uv), texture(state, vec2(1.-_uv.x, _uv.y)), m);
}

vec4 postMain(in sampler2D state, in vec2 p){
  vec4 c = texture(state, p);
  if(bile>0.){
    int i = int(syn_BPMTwitcher);
    float cc = mix(c[i%4], c[(i+1)%4], fract(syn_BPMTwitcher));
    c = vec4(
      _hsv2rgb(tanh(2.*c.rgb-cc)),
      1.);
    c = clamp(c, 0.0, 1.0);
    c = mix(c, vec4(1, 0, 0, 1), clamp(
        c.r*c.b*(1.0-c.g)
        + (1.0-c.r)*(1.0-c.b)*c.g,
      0.0, 1.0));
  } else {
    c = mix(c, vec4(1, 0, 0, 1), clamp(
        c.r*c.b*(1.0-c.g),
      0.0, 1.0));
  }
  return c;
}

vec4 secondaryMain(in sampler2D state){
  vec4 c = softmirror(state, pow(mirror, 2.0)*.5);
  if (media_mix > 0.0){
    vec4 m = _loadMedia();
    m.a = 0.0;
    c = mix(
      c, m,
      pow(clamp(dot(m, vec4(.33333)), 0.0, 1.0), .25)*pow(media_mix, 3.0)
    );
  }
  return c;
}

vec4 initialCondition(in vec2 p){
  return vec4(tanh(vec3(1.0-length(_uvc))), sin(2.0*pi*_uv.y))*.5+.5;
}

vec4 renderMain () {
  if (FRAMECOUNT<=2.0){
    return initialCondition(_xy);
  }
  if (PASSINDEX == 0.0){
    if (texture(fb1, _uv) == vec4(0.0)) return initialCondition(_xy); // VJW: a cleared target starts again
    return fbMain(fb1, _uv);
  }
  else if (PASSINDEX == 1.0){
    return secondaryMain(fb0);
  }
  else if (PASSINDEX == 2.0){
    return postMain(fb0, _uv);
  }

  return vec4(1.0, 0.0, 0.0, 1.0);
}
