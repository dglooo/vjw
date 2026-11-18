// Source: donor/visual_system_2/scenes/release/overload.synScene (main.glsl + scene.json; script.js restated as VJW_CLOCK) · unknown
// Author: Alex Rowe
// License: unknown (the donor's CREDIT names Alex Rowe only; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts; body: int literals → float (ES 3.00). script.js is the clock spinTime
// (20·(Level + Presence)·dt/60). Dropped: its everyOtherBeat (read by no line) and the auto_cycle / cycle re-roll of
// the two dropdowns on syn_PrimeBang (a non-public event, no data form): the controls auto_cycle and cycle are gone,
// distortion_type and color_scheme stay manual.
// res .4 → .85 (2026-11-19, agents/guides/guide_syn_res_085.md): res only
/*{
  "TITLE": "Overload",
  "CREDIT": "Alex Rowe",
  "TAGS": ["donor"],
  "VJW_CLOCK": {
    "spinTime": [[0.3333, "syn_Level"], [0.3333, "syn_Presence"]]
  },
  "CONTROLS": [
    {"NAME": "distortion_type", "TYPE": "dropdown smooth", "DEFAULT": 1, "LABELS": ["None", "Gritty", "Wavy", "Melting"]},
    {"NAME": "color_scheme", "TYPE": "dropdown smooth", "DEFAULT": 1, "LABELS": ["Default", "Green Mix", "Teal Mix", "Red Noise", "HSV Rainbow"]},
    {"NAME": "weird_color", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "media_tile", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "logo_center", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "media_glitch", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "the_ritual_has_begun", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1}
  ]
}*/
float fixedTime = syn_Time;
float fixedHighTime = syn_HighTime * 2.0;
float fixedBassLevel = syn_BassLevel * 0.3;
float size = syn_FadeInOut * 0.7 + 0.3;

vec3 BLACK = vec3(0.0);
vec3 WHITE = vec3(0.9, 1.0, 0.8);

vec2 shakeUV (vec2 uv) {
  float amount = smoothstep(0.8, 0.9, syn_BassHits);
  vec2 shaker= vec2(
                    _noise(      fixedTime) - 0.5,
                    _noise(100.0 + fixedTime) - 0.5
                    ) * 0.05;

  return uv + shaker * amount;
}

vec2 distort(vec2 uv) {
  vec2 shaker = vec2(
                     _noise(vec2(uv.x * 100.0, uv.y * 10.0) + fixedTime),
                     _noise(vec2(uv.x * 100.0 + 100.0, uv.y * 10.0 + 100.0) + fixedTime)
                     ) - 0.5;

  shaker *= length(uv)*syn_FadeInOut;

  return shaker;
}

vec2 distort2(vec2 uv) {
  vec2 dist = vec2(
                     _noise(vec2(-uv.y*10.0 + fixedHighTime)),
                     _noise(vec2(-uv.y*10.0 + fixedHighTime + 100.0))
                     ) - 0.5;

  return dist/10.0 * sqrt(abs(uv.x));
}

float makeRing(vec2 uv) {
  uv.r -= mod(fixedTime/10.0,2.0);
  return exp(-uv.r*uv.r * 100.0);
}

vec3 colorize(vec2 uv, float level) {
  vec3 GREEN = vec3(0.9, 1.0, 0.5);
  vec3 RED   = vec3(0.9, 0.9, 0.2);
  vec3 TEAL  = vec3(0.2, 0.9, 0.9);
  
  float c1, c2, c3, c4, c5;
  c1 = _pulse(color_scheme, 0.0, 1.0);
  c2 = _pulse(color_scheme, 1.0, 1.0);
  c3 = _pulse(color_scheme, 2.0, 1.0);
  c4 = _pulse(color_scheme, 3.0, 1.0);
  c5 = _pulse(color_scheme, 4.0, 1.0);

  vec3 color = mix(WHITE, GREEN, c2);
  color = mix(color, TEAL, c3*uv.r);
  color = mix(color, RED, c4*_noise(vec3(uv.r *_uvc,fixedTime)));

  vec3 hsv = _rgb2hsv(vec3(uv.t + sin(uv.r*10.0 + fixedTime)/5.0, 0.3 + syn_HighLevel/5.0, 1.0));
  color = mix(color, hsv, c5);

  color = mix(BLACK, color, level);
  return color;
}

vec3 render(vec2 uv) {
  uv = shakeUV(uv);
  float r1, r2, r3, r4;
  r1 = _pulse(distortion_type, 0.0, 1.0);
  r2 = _pulse(distortion_type, 1.0, 1.0);
  r3 = _pulse(distortion_type, 2.0, 1.0);
  r4 = _pulse(distortion_type, 3.0, 1.0);
  uv = shakeUV(uv);

  // Melting preset
  uv += distort(uv) * r4;
  uv += distort2(uv) * r3;
  uv = _toPolar(uv);

  // Decrease size
  uv.r = uv.r / size;

  // Wrapping Preset
  // uv.t += uv.r*r3*sin(fixedTime/20.0)*100.0;
  uv.t = mix(uv.t, 0.0, r1);

  // Noise functions
  vec2 x = vec2(uv.x*100.0, fixedHighTime + TIME/2.0);
  vec2 y = vec2(uv.y*100.0, fixedTime + TIME);

  float level = 1.0 - _noise(x) * _fbm(y);

  level = mix(1.0, level, uv.r);

  if (uv.r < fixedBassLevel) {
    level = mix(0.0, level, uv.r/fixedBassLevel);
  }


  level = pow(level, 3.5 + syn_HighLevel * 5.0);
  level = mix(0.0, level, 1.0-uv.r);

  mix(level, sqrt(level), level);
  // level= 1.0 - (level - 1.0)*(level - 1.0);

  float ring = makeRing(uv)*r3;
  level += ring;

  vec3 color = colorize(uv, level);

  return color;
}

//Begin Weird Noise

// Rand one-liner
float rand(vec2 co)
{
	return fract (sin (dot (co.xy, vec2 (12.9898, 78.233))) * 43758.5453);
}


vec4 postFXNoise()
{
    // Normalized pixel coordinates (from 0.0 to 1.0)
    vec2 uv = _xy / RENDERSIZE.xy;

    // Time varying pixel color
    vec3 movement = 0.5 + 0.5 * cos (TIME + uv.xyx + vec3 (0.0, 2.0, 4.0));
    
    // Noise value at given Y
    float noise = rand (vec2 (TIME, uv.y));
    
    // Noise color
    vec3 col = (vec3 (noise * 0.5, noise * 0.8, noise) + 2.0) * 0.3;
    
    // Adds static
    col *= (rand (uv * TIME) + 3.0) * 0.3;

    // Output to screen
    return vec4 (col , 1.0);
} 

vec4 renderMain() {
  vec3 color = vec3(0.0);
    vec3 noiseCol = postFXNoise().rgb;

    vec2 uvTex = shakeUV(_uv)*(1.0+2.0*media_tile);
    uvTex += syn_HighHits*media_glitch*cos(noiseCol.rg*2.0*PI)*0.01*vec2(1.0,0.0);
    if (logo_center>0.5){
      uvTex = _uv*2.0+vec2(-0.5, -0.5);
    }
    vec3 mediaCol = _textureMedia(uvTex).rgb;
    float mediaLum = length(mediaCol);
    float maskOut = 1.0;
    if (media_tile<0.5){
      if ((uvTex.x > 1.0)||(uvTex.x<0.0)||(uvTex.y > 1.0)||(uvTex.y<0.0)) {
        mediaCol*=0.0;
        mediaLum*=0.0;
        maskOut = 0.0;
      }
    }

    vec2 d1 = vec2(1.0,0.0)*0.01*syn_Level;
    vec2 d2 = vec2(0.0,1.0)*0.01*syn_Level;

    vec2 off = vec2(
                    _noise(fixedTime/10.0),
                    _noise(fixedTime/10.0 + 100.0)
                    );
    
    // vec2 mediaOffset = vec2(mediaLum*1.0);

    vec2 sirenModeOffset = vec2(sin(spinTime), cos(spinTime));
    vec2 sirenModeOffset2 = vec2(sin(spinTime+2.0*PI/3.0), cos(spinTime+2.0*PI/3.0));
    vec2 sirenModeOffset3 = vec2(sin(spinTime+4.0*PI/3.0), cos(spinTime+4.0*PI/3.0));
    float mixer = the_ritual_has_begun;
    vec2 uvc = _uvc+sirenModeOffset*mixer;
    vec2 uvc2 = _uvc+sirenModeOffset2*mixer;
    vec2 uvc3 = _uvc+sirenModeOffset3*mixer;

    vec3 neonOff1 = vec3(1.0,0.7,0.3);
    vec3 neonOff2 = vec3(1.0,0.3,0.8);
    vec3 neonOff3 = vec3(0.5,0.8,0.9);

//  color = vec3(
//                  dot(render(uvc), neonOff1),
//                  dot(render(uvc + d1), neonOff1),
//                  dot(render(uvc + d2), neonOff1)
//                  );

//     vec3 color2 = vec3(
//                  dot(render(uvc2), neonOff1),
//                  dot(render(uvc2 + d1), neonOff1),
//                  dot(render(uvc2 + d2), neonOff1)
//                  );

//     vec3 color3 = vec3(
//                  dot(render(uvc3), neonOff1),
//                  dot(render(uvc3 + d1), neonOff1),
//                  dot(render(uvc3 + d2), neonOff1)
//                  );

    color = vec3(
                 dot(render(uvc), vec3(off,0.0)),
                 dot(render(uvc + d1), vec3(0.0,off)),
                 dot(render(uvc + d2), vec3(off.y,0.0,off.x))
                 );

    vec3 color2 = vec3(
                 dot(render(uvc2), vec3(off,0.0)),
                 dot(render(uvc2 + d1), vec3(0.0,off)),
                 dot(render(uvc2 + d2), vec3(off.y,0.0,off.x))
                 );

    vec3 color3 = vec3(
                 dot(render(uvc3), vec3(off,0.0)),
                 dot(render(uvc3 + d1), vec3(0.0,off)),
                 dot(render(uvc3 + d2), vec3(off.y,0.0,off.x))
                 );

    color = color+color2*the_ritual_has_begun+color3*the_ritual_has_begun;

    vec3 mediaColMix = vec3(
                 dot(maskOut*mediaCol, vec3(off,0.0)),
                 dot(maskOut*_textureMedia(uvTex + d1).rgb, vec3(0.0,off)),
                 dot(maskOut*_textureMedia(uvTex + d2).rgb, vec3(off.y,0.0,off.x))
                 );

    //weird glitch
    if (weird_color>0.5){
      color.rgb = _hsv2rgb(clamp(color.rgb,0.0,1.0));
      color.rgb = color.rgg;
      // color.r += 0.05;
      color.rgb = _rgb2hsv(color.rgb);
      mediaColMix.rgb = _hsv2rgb(clamp(mediaColMix.rgb,0.0,1.0));
      mediaColMix.rgb = mediaColMix.rgg;
      // color.r += 0.05;
      mediaColMix.rgb = _rgb2hsv(mediaColMix.rgb);
    }

    color += mediaColMix*syn_BassLevel*syn_BassLevel;
    color -= noiseCol*noiseCol*syn_MidHits*mediaColMix;

  return vec4(color, 1.0) * syn_FadeInOut;
}
