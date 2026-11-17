// Source: donor/visual_system_2/scenes/release/boreal.synScene (main.glsl + scene.json + images/) · unknown
// Author: Alex Rowe
// License: unknown (the donor's CREDIT names Alex Rowe only; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts (IMAGES bubbles / lines / tears / linework from public/syn/boreal/images/).
// Changes for ES 3.00: int literals in float maths (mix(0, .., 1 + .., TIME/5, > 1, 2 - .., 2*PI, clamp(col, 0, 1)).
// script.js (not run) restated: tScript (the scanner's phase) adds dt x (50 pulse_forward + 4.2 (syn_BassLevel +
// syn_HighHits) scanner_audio_rate + 2.5 scanner_const_rate) / 5 = the clock below, per second. Dropped: the script's
// re-roll of the three dropdowns on a musical transition (auto_cycle / cycle: no data form; both controls removed).
// _textureImage -> vjwTextureImage (see below). PASSES: FLOAT added (the donor's default target is HDR).
/*{
  "TITLE": "Boreal",
  "CREDIT": "Alex Rowe",
  "PASSES": [{"HEIGHT": 1080, "TARGET": "backbuff", "WIDTH": 1920, "FLOAT": true}],
  "IMAGES": [{"NAME": "bubbles", "PATH": "./images/boreal_bubbles.png"}, {"NAME": "lines", "PATH": "./images/boreal_lines.jpg"}, {"NAME": "tears", "PATH": "./images/boreal_tears.jpg"}, {"NAME": "linework", "PATH": "./images/pebbletex.jpg"}],
  "TAGS": ["donor"],
  "VJW_CLOCK": {
    "tScript": [[10, "pulse_forward"], [0.84, "syn_BassLevel", "scanner_audio_rate"], [0.84, "syn_HighHits", "scanner_audio_rate"], [0.5, "scanner_const_rate"]]
  },
  "CONTROLS": [
    {"NAME": "media_warp", "TYPE": "toggle", "DEFAULT": 0},
    {"NAME": "warp_type", "TYPE": "dropdown smooth", "DEFAULT": 1, "LABELS": ["Waving", "Still", "Still 2", "Woozy"], "PARAMS": 0.04},
    {"NAME": "wind_movement", "TYPE": "dropdown smooth", "DEFAULT": 1, "LABELS": ["Moves In", "Rotate Only", "Moves Out"], "PARAMS": 0.04},
    {"NAME": "image_select", "TYPE": "dropdown smooth", "DEFAULT": 1, "LABELS": ["white_pebbles", "white_feathers", "color_tears", "color_pebbles"], "PARAMS": 0.04},
    {"NAME": "extra_color_tint", "TYPE": "slider", "DEFAULT": 0.2},
    {"NAME": "scanline_thinness", "TYPE": "slider", "DEFAULT": 1.0, "MAX": 2.0},
    {"NAME": "static_scan", "TYPE": "slider smooth", "DEFAULT": 0, "PARAMS": 0.15},
    {"NAME": "pulse_forward", "TYPE": "bang smooth", "DEFAULT": 0, "PARAMS": 0.09},
    {"NAME": "scanner_audio_rate", "TYPE": "knob", "DEFAULT": 1, "MIN": 0.0, "MAX": 2.0},
    {"NAME": "scanner_const_rate", "TYPE": "knob", "DEFAULT": 1, "MIN": 0.0, "MAX": 2.0}
  ]
}*/
// VJW: the donor's _textureImage, with its fit-or-fill ratio as fill (the preamble's _ratioFix, a meta-control, is a
// zero stub: _textureImage divides by it)
vec4 vjwTextureImage(sampler2D img, vec2 uv) {
  vec2 r = RENDERSIZE/vec2(textureSize(img, 0));
  r /= max(r.x, r.y);
  return texture(img, uv*r - r/2.0 + 0.5);
}

vec4 texMirror(sampler2D samplerIn, vec2 uvIn){
  if (mod(uvIn.x, 2.0) > 1.0){
    uvIn.x = 1.0-uvIn.x;
  }
  if (mod(uvIn.y, 2.0) > 1.0){
    uvIn.y = 1.0-uvIn.y;
  }
  return texture(samplerIn, uvIn);
}


vec4 renderMainPass() {
    vec2 p = _uv - 0.5;
    float time = tScript;

    float intensity = mix(0.0, 0.02, syn_Intensity);
    // Original: intensity = mix(intensity, -intensity, movesIn);
    // Convert to dropdown: inOutMovement (0=movesOut, 1=movesIn)

    intensity *= (wind_movement-1.0);

    float zoom = 1.0 + intensity;

    vec2 offset = 3e-3*syn_FadeInOut*sin(.3*time+vec2(0,1.6));
    // offset = _rotate(vec2(normalize(_uvc)-vec2(0.0, _uvc.x)), texture(syn_Spectrum, length(_uvc)).g*PI)*0.001;
    vec4 lastPass = texture(syn_FinalPass, p * zoom  + 0.5 - offset);

    float minMix = 0.01;
    float maxMix = 0.04;

    float distFromWhite = length(1.0 - lastPass.xyz);
    lastPass.xyz += vec3(
      _noise(vec3(p, TIME/5.0)),
      _noise(vec3(p, TIME/5.0 + 10.0)),
      _noise(vec3(p, TIME/5.0 + 20.0))
    ) * mix(minMix, maxMix, syn_MidHighPresence);

    float ratio = RENDERSIZE.y/RENDERSIZE.x;

    float exponent = mix(20.0, 30.0 + syn_BassHits * 10.0, syn_BassPresence);

    vec2 pos = p +0.3*vec2(sin(TIME*0.02),cos(TIME*0.02));
    vec2 pos2 = p;

    float waving, spinning;
    waving      = _pulse(warp_type, 0.0, 1.0);
    spinning    = _pulse(warp_type, 3.0, 1.0);

    if (waving > 0.1) {
      float amt = waving*_fbm(vec3(pos, TIME/10.0)) - 0.5;
      pos += amt;
      pos2 += amt;
    }
    if (spinning > 0.1) {
      float amt = spinning*(_fbm(vec3(p*10.0 * _rotate(vec2(0.1, 1), syn_Time/50.0),  TIME/10.0)) - 0.5);
      pos += amt;
      pos2 += amt;
    }

    pos = abs(pos);
    pos2 = abs(pos2);

    if (pos.x > 1.0) {
      pos.x = 2.0 - pos.x;
    }

    if (pos.y > 1.0) {
      pos.y = 2.0 - pos.y;
    }
    if (pos2.x > 1.0) {
      pos2.x = 2.0 - pos2.x;
    }

    if (pos2.y > 1.0) {
      pos2.y = 2.0 - pos2.y;
    }

    vec4 tex1 = vjwTextureImage(bubbles, pos*1.2);
    vec4 tex2 = vjwTextureImage(lines, 0.5*vec2(sin(TIME*0.02),cos(TIME*0.02))+_toPolar(pos*0.8*vec2(1.9,0.9)));
    vec4 tex3 = texMirror(tears, pos*vec2(1.6,0.9));
    vec4 tex4 = vjwTextureImage(linework, pos*0.65);
    vec4 texColor = tex1;
    
    float image1 = 0.0;
    float image2 = 0.0;
    float image3 = 0.0;
    float image4 = 0.0;
    image1 = _pulse(image_select, 0.0, 1.0);
    image2 = _pulse(image_select, 1.0, 1.0);
    image3 = _pulse(image_select, 2.0, 1.0);
    image4 = _pulse(image_select, 3.0, 1.0);

    // Original image mixing:
    texColor = mix(texColor, tex2, image2);
    texColor = mix(texColor, tex3, image3);
    texColor = mix(texColor, tex4, image4);

    if (_isMediaActive()){
        texColor = _loadMedia();
        if (media_warp > 0.5){
          texColor = _textureMedia(_invertYAxisVideo(pos2));
        }
    }
  
    texColor = 1.0-texColor;
    
    vec3 colorTint = vec3(
        sin(_uvc.x * 2.0 + TIME * 0.08) * 0.5 + 0.5,
        sin(_uvc.y * 1.5 + TIME * 0.12) * 0.5 + 0.5,
        sin(length(_uvc) * 1.8 + TIME * 0.1) * 0.5 + 0.5
    );
    texColor.rgb = mix(texColor.rgb, texColor.rgb * colorTint, 0.15*extra_color_tint);
    
    vec4 tex = pow(abs(sin(6.3*scanline_thinness*texColor+time+static_scan*2.0*PI)),vec4(exponent));
    // tex.rgb = mix(tex.rgb, tex.gbr, 0.1);
    // tex.rgb = 2.0-vec3(1.0,1.0,0.0)*(1.0-tex.b)-vec3(0.0,1.0,1.0)*(1.0-tex.r)-vec3(1.0,0.0,1.0)*(1.0-tex.g);
    // tex.rgb = tex.rgb*5.0*fiddle;
    vec4 col = mix(lastPass, tex, mix(0.00, 0.05, syn_FadeInOut));
    // col += texture(syn_Spectrum, length(col)*0.33)*col*0.05-0.01;
    col = clamp(col, 0.0, 1.0);
    col *= pow(syn_FadeInOut, 0.07);
    return col;
}

vec4 renderMain() {
    if (PASSINDEX == 0) {
        return renderMainPass();
    } else {
        return texture(backbuff, _uv);
    }
}
