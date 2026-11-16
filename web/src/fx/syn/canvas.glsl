// Source: donor/visual_system_2/scenes/release/canvas.synScene (main.glsl + scene.json) · unknown
// Author: unknown (the donor's CREDIT is empty)
// License: unknown (no credit, no licence text; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts. Changes for GLSL ES 3.00: int literals in float maths ((i+1)/10.0,
// 2*syn_BPMTri, 2*PI). The pulse ring rode syn_BPMTri2 / syn_BPMConfidence (the donor's ungated 2-beat ramp: the
// fract() wraps it seamlessly); here it is the beat count, fract(syn_BeatTime / 2), so the ring runs outward without a
// 0 / 0 at confidence 0. The bpm flasher keeps the donor's names, its divisor guarded. syn_FinalPass (the paint that
// stays) = the screen pass's own TARGET (fx/syn.ts).
// ⚡ syn_OnBeat (the kick: beat_flasher_on) and syn_BPMTri (bpm_flasher_on) are flash-gated: whole-frame light.
/*{
  "TITLE": "Canvas",
  "TAGS": ["grayscale", "feedback", "media", "dark", "donor"],
  "VJW_FLASH": ["syn_OnBeat", "syn_BPMTri"],
  "CONTROLS": [
    {"NAME": "pulser_on", "TYPE": "toggle", "DEFAULT": 1.0, "MIN": 0, "MAX": 1},
    {"NAME": "bpm_pulse", "TYPE": "toggle", "DEFAULT": 1.0, "MIN": 0, "MAX": 1},
    {"NAME": "manual_pulse", "TYPE": "bang smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "beat_flasher_on", "TYPE": "toggle", "DEFAULT": 1.0, "MIN": 0, "MAX": 1},
    {"NAME": "bpm_flasher_on", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0, "MAX": 1},
    {"NAME": "painter_on", "TYPE": "toggle", "DEFAULT": 1.0, "MIN": 0, "MAX": 1},
    {"NAME": "auto_painter", "TYPE": "toggle", "DEFAULT": 1.0, "MIN": 0, "MAX": 1},
    {"NAME": "paint_pulse", "TYPE": "bang smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "manual_painter", "TYPE": "xy smooth", "DEFAULT": [0.0, 0.0], "MIN": [-1.0, -1.0], "MAX": [1.0, 1.0]},
    {"NAME": "brush_size", "TYPE": "slider smooth", "DEFAULT": 0.44, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "feedback", "TYPE": "slider smooth", "DEFAULT": 0.4, "MIN": 0, "MAX": 0.99},
    {"NAME": "noise_on", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0, "MAX": 1},
    {"NAME": "invert", "TYPE": "toggle smooth", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "brightness", "TYPE": "slider smooth", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 3.0}
  ]
}*/
float triGen(vec2 pos, float grower){
  pos.x *= (RENDERSIZE.x / RENDERSIZE.y);
  pos *= vec2(3.0,2.0)*2.0;
  pos += vec2(0.0,0.2+grower*8.0);
  pos.y += abs(pos.x);

  //        float r = triRand(sin(pos.y), grower);
  float r = tan(pos.y);
  float retVal = r;
  for (int i=0;i<10;i++){
    retVal -= sin(syn_BassTime+pos.x*float(i+1)/10.0);
  }

  return retVal;
}

float pulseTime = fract(length(_uvc)*0.9 - fract(syn_BeatTime*0.5)*bpm_pulse + manual_pulse +0.12)*3.5;
float pulse = smoothstep(0.0,0.4,pulseTime)-smoothstep(0.4,0.55,pulseTime);

vec4 renderMain(void)
{
  float data = 0.0;
  data += pulse*pulser_on;

  data += syn_OnBeat*beat_flasher_on;
  data += clamp(pow(2.0*syn_BPMTri/max(syn_BPMConfidence,0.001),0.9),0.0,1.0)*bpm_flasher_on;

  float disty = length(_uvc-vec2(manual_painter.x, manual_painter.y)*vec2(1.0, RENDERSIZE.y/RENDERSIZE.x)*0.9);
  if (auto_painter>0.5){
    disty = length(_uvc-vec2(sin(syn_Time*2.0*PI*0.08*0.25+syn_RandomOnBeat),cos(syn_Time*2.0*PI*0.124*0.25+syn_RandomOnBeat))*0.3);
  }
  if(disty < pow(brush_size+paint_pulse*brush_size,3.0)) {
    data += pow(disty+1.0,4.0)*painter_on;
  }

  float backbuffer = texture(syn_FinalPass, _uv).r;

  data = mix(data, backbuffer, pow(feedback,0.2));

  data -= clamp(pow(_rand(_uvc*10000.0+TIME+_uvc.x*_uvc.y*1000.0),4.0)*noise_on,0.0,1.0);

  if (_isMediaActive()){
    data = mix(data, 1.0-data, _loadMediaAsMask().r);
  }

  data *= brightness;

  data = mix(data, 1.0-data, invert);

  vec4 colorOut = vec4(vec3(data), 1.0);
  return colorOut;
}
