// Source: donor/visual_system_2/scenes/release/hue_review.synScene (main.glsl + scene.json) · unknown
// Author: Meebs
// License: unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts. Changes: 16*PI -> 16.0*PI (ES 3.00). script.js (not run) smooths a bang
// counter into fire_pulse_scr ("Boom": one ring sweeps out per press); we have no bang, so the ring rides the snare:
// fire_pulse_scr = 1 - syn_Hits (the hit starts the ring at the centre, its release sweeps it out of the frame; rest =
// off-screen, as the donor's). The fire_pulse control is dropped; the script's bpmTime is not read by the body.
// feedback: the donor's reversed range (MIN .4, MAX 0) is written 0 to .4. The final _hueSaturationContrastLEGACY is
// _hueSaturationLEGACY (the app's contrast meta-control, neutral there, is a zero stub in our preamble). ⚡ syn_Hits (the ring's x6 light) and
// syn_BassHits (the glitchdown brightness) are flash-gated. PASSES: FLOAT added (the donor's default target is HDR:
// lattix and swarm show it; ours is 8-bit unless FLOAT).
/*{
  "TITLE": "Hue Review",
  "CREDIT": "Meebs",
  "TAGS": ["feedback", "media", "dark", "psychedelic", "donor"],
  "PASSES": [{"TARGET": "backbuff", "FLOAT": true}, {"TARGET": "backbuff2", "FLOAT": true}],
  "VJW_FLASH": ["syn_Hits", "syn_BassHits"],
  "CONTROLS": [
    {"NAME": "feedback", "TYPE": "slider", "DEFAULT": 0.08, "MIN": 0, "MAX": 0.4},
    {"NAME": "ripple_amt", "TYPE": "slider", "DEFAULT": 0.02, "MIN": 0.0, "MAX": 0.1},
    {"NAME": "sat_amt", "TYPE": "slider", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 0.05},
    {"NAME": "brighter", "TYPE": "slider", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "darker", "TYPE": "slider", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "glitchdown", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "glitchdown_speed", "TYPE": "slider", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "zoom", "TYPE": "slider", "DEFAULT": 0.0, "MIN": -1.0, "MAX": 1.0},
    {"NAME": "rays", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "digital_mode", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "color_palette", "TYPE": "slider", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 4.0}
  ]
}*/
#define fire_pulse_scr (1.0 - syn_Hits) // VJW: the snare fires the ring (script.js: a smoothed bang counter)
vec2 uvCor = _uvc+vec2(0.2,0.0);

vec4 renderRoom() {
  
  vec2 pos = _uv - vec2(0.5,0.5); 
  float horizon = 0.5*sin(TIME*0.01); 
  float fov = 0.02; 
  float scaling = 0.1;
  float roofHeight = 0.2;
  
  float playerHeight = ((sin(TIME*0.2) + 1.0) / 4.0) + 0.1;
  vec3 p = vec3(pos.x, fov, pos.y - horizon);   
  p.xy = _rotate(p.xy, p.z);   
  vec2 s = vec2(p.x/p.z, p.y/p.z);
  // s.x += TIME*0.1+syn_BassTime*0.02;
  s = _rotate(s, p.y+syn_BassTime*0.03);
  s.x += sin(syn_HighTime*0.1);
  if(p.z > 0.0) {
    // Ceiling
    s *= roofHeight - playerHeight;
  } else {
    // Floor
    s *= playerHeight;
  }
  
  //checkboard texture
  
  float color = sign((mod(s.x, 0.1) - 0.05) * (mod(s.y, 0.1) - 0.05));  
  // //fading
  color *= p.z*10.0;

  vec3 colOut = (0.1+texture(backbuff2, p.xz).rgb*1.2)*color*0.75;
  
  return vec4(colOut, 1.0 );

}

vec4 renderMain () {
  if (PASSINDEX == 0.0){
    vec2 pixelSize = 1.0/RENDERSIZE;
    vec2 diffusionDirection = vec2(0.0);
    vec2 polarPos = _toPolarTrue(_uvc);

    vec2 wp = 4.0/RENDERSIZE.xy;

    vec2 uv = _uv + _uvc*0.02*zoom*vec2(RENDERSIZE.y/RENDERSIZE.x, 1.0);

    vec4 cOrig = -1.+2.*texture(backbuff2, _uv);
    vec4 c = cOrig;
    float bri = dot(vec3(1.0),cOrig.rgb)/3.0;
    c = -1.+2.*texture(backbuff2, _uv + vec2(0.1,-0.1)*wp*c.rg);
    c = -1.+2.*texture(backbuff2, _uv - vec2(0.32,-0.135)*wp*c.ba);
    c = -1.+2.*texture(backbuff2, _uv + vec2(0.17,-0.37)*wp*c.ar);
    c = -1.+2.*texture(backbuff2, _uv - vec2(0.01,-0.01)*wp*c.gb);

    diffusionDirection = mix(c.rg, c.ba, syn_Presence)*(1.0);
    diffusionDirection = _rotate(diffusionDirection, polarPos.y*16.0*PI*rays*(-1.0+2.0*step(fract(polarPos.y*(30.0)),0.5)));
    // diffusionDirection += _uvc*syn_OnBeat*10.0*dot(cOrig, vec4(1.0));
    // diffusionDirection *= 1.0-pow(_fbm(_uvc*10.0),3.0);

    if (digital_mode > 0.5){
        diffusionDirection = _rotate(diffusionDirection, c.r*PI);
        diffusionDirection = floor(diffusionDirection);
    }

    diffusionDirection = mix(diffusionDirection, vec2(0.0,_rand(_pixelate(abs(_uvc.x), 50.0)+syn_BeatTime))*(1.0+syn_HighHits)*pow(glitchdown_speed*2.0,5.0), glitchdown);

    vec2 pos = uv;

    float red = texture(backbuff2, pos+diffusionDirection*pixelSize*1.0).r;
    float gre = texture(backbuff2, pos+diffusionDirection*pixelSize*2.0).g;
    float blu = texture(backbuff2, pos+diffusionDirection*pixelSize*3.0).b;

    vec4 diffusionCol = vec4(red, gre, blu, 1.0);
    // diffusionCol /= 5.0;

    vec4 finalCol = vec4(0.0);

    vec4 img = renderRoom();

    if (_isMediaActive()){
        img = _loadMedia();
    }

    //Feedback Step
    finalCol = mix(diffusionCol, img, feedback);
    finalCol = mix(finalCol, max(diffusionCol, finalCol), brighter);
    finalCol = mix(finalCol, min(diffusionCol, finalCol), darker);

    finalCol = clamp(finalCol, 0.0, 1.0);
    float oscillator = _pulse(length(_uvc)+(bri-1.0)*0.4, -0.81+fract(fire_pulse_scr)*2.5, 0.01);
    finalCol *= 1.0+oscillator*(1.0-bri)*5.0;
    // finalCol *= 1.0-glitchdown*dot();
    vec3 hsv = _rgb2hsv(finalCol.rgb);
    hsv.r += ripple_amt;
    hsv.g += sat_amt;
    // hsv.g += glitchdown*(cos(bri*2*PI-syn_BassHits*PI))*0.2;
    hsv.b += syn_BassHits*glitchdown*cos(dot(diffusionCol,vec4(1.0))*10.0-pow(syn_OnBeat,0.2)*10.0)*0.3;

    hsv = _hsv2rgb(hsv);
    finalCol.rgb = hsv;
    // finalCol = vec4(oscillator);

    return finalCol;
  } else if (PASSINDEX == 1.0){
    return texture(backbuff, _uv);
  } else if (PASSINDEX == 2.0){
    vec3 data = texture(backbuff2, _uv).rgb;
    data = clamp(data, 0.0, 1.0);

  float colMixer = color_palette;

  vec3 col1 = vec3(0.8,0.5,0.0);
  vec3 col2 = vec3(0.0,0.8,1.0);
  vec3 col3 = vec3(1.0,0.0,0.0);

  float passthru = 0.0;


  float cm = smoothstep(0.25, 0.75, clamp(colMixer, 0.0, 1.0));



  // *** Color Regime 4 ***
  col1 = mix(col1, vec3(0.3,1.3,2.3)*1.0, cm);
  col2 = mix(col2, -vec3(0.0,1.5,1.5), cm);
  col3 = mix(col3, vec3(2.3,1.5,0.4)*1.0, cm);
  passthru = mix(passthru, 0.5, cm);

  colMixer = colMixer-1.0;
  cm = smoothstep(0.25, 0.75, clamp(colMixer, 0.0, 1.0));

  // *** Color Regime 3 ***
  col1 = mix(col1, vec3(1.8,0.1,1.4), cm);
  col2 = mix(col2, -vec3(2.0), cm);
  col3 = mix(col3, vec3(1.6,2.7,1.0), cm);
  passthru = mix(passthru, 0.5, cm);

  colMixer = colMixer-1.0;
  cm = smoothstep(0.25, 0.75, clamp(colMixer, 0.0, 1.0));
  
  // *** Color Regime 2 ***
  col1 = mix(col1, vec3(1.8,0.3,1.0), cm);
  col2 = mix(col2, -vec3(0.2,0.0,0.8), cm);
  col3 = mix(col3, vec3(0.3,0.7,1.9), cm);

  colMixer = colMixer-1.0;
  cm = smoothstep(0.25, 0.75, clamp(colMixer, 0.0, 1.0));

  // *** Color Regime 1 ***
  col1 = mix(col1, vec3(2.0,1.7,1.0), cm);
  col2 = mix(col2, -vec3(2.0), cm);
  col3 = mix(col3, vec3(0.1,2.0,2.4), cm);
  passthru = mix(passthru, 1.0, cm);

    vec3 finalCol = vec3(0.0);
    finalCol += data.r*col1;
    finalCol += data.g*col2;
    finalCol += data.b*col3;
    // finalCol *= (-0.5+dot(finalCol.rgb, vec3(1.0))/3.0);
    finalCol = clamp(finalCol, 0.0, 1.0);

    // Uses LEGACY code to apply old hue saturation. The old, broken hsv.g += saturation is critical for the color palettes of this scene to function.
    vec3 corrCol = _hueSaturationLEGACY(vec4(finalCol,1.0), 0.0, 0.5).rgb; // VJW: was _hueSaturationContrastLEGACY(..., 1.0) = this + the app contrast meta-control (neutral = identity; the preamble stubs it to zero) 

    // vec3 hsv = _rgb2hsv(finalCol);
    // hsv.g = clamp(hsv.g+0.5, 0.0, 1.0);
    // // hsv.b = mix(0.0, 1.0-hsv.b, hsv.b)*2.0;

    // hsv = _hsv2rgb(hsv);
    // finalCol.rgb = hsv;

    // finalCol = mix(finalCol.rgb, _loadMedia().rgb, pow(hsv.b,2.0));
    // finalCol = clamp(finalCol, 0.0, 1.0);

    return vec4(mix(corrCol, finalCol.rgb, passthru), 1.0);
  }
}
