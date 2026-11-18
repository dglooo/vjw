// Source: donor/visual_system_2/scenes/release/square_shoals.synScene (main.glsl + scene.json) · unknown
// Author: Alex Rowe
// License: unknown (the donor's CREDIT names Alex Rowe only; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts. Changes: GLSL ES 3.00 literals; the two `k` loops count in float;
// WIDTH / HEIGHT are the wave buffer's real size (_backbuffer_imgSize; the donor's buffer is a fixed 888x500 and the
// body hard-codes it: ours scales with the frame, ≈ the donor's at res .5 on a 3456x2234 stage). The donor's
// HARD_TRANSITIONS (config = the wave source, bassconfig = the bass dead zones, colRegimeSelector = the palette) are
// panel sliders here, at the donor's first values; each is rounded to its whole number (the body tests `== 1.0`).
// paint_position (xy) gives one number for both axes in the donor: pairs here.
// Pass 0 = the wave equation (backbuffer, FLOAT), the screen pass lights it. syn_Hits (the snare) drives the sources.
// res .5 → .85 (2026-11-19, agents/guides/guide_syn_res_085.md): res only
/*{
  "TITLE": "SquareShoals",
  "CREDIT": "Alex Rowe",
  "TAGS": ["media", "feedback", "dark", "abstract", "donor"],
  "PASSES": [{"TARGET": "backbuffer", "HEIGHT": 500, "WIDTH": 888, "FLOAT": true}],
  "CONTROLS": [
    {"NAME": "WAVE_SPEED", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": -0.2, "MAX": 0.0},
    {"NAME": "DISTORTION", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "ROTATE", "DEFAULT": 0, "MIN": -0.15, "MAX": 0.15},
    {"NAME": "DRIFT", "DEFAULT": 0, "MIN": -2, "MAX": 2},
    {"NAME": "auto_painter", "TYPE": "toggle", "DEFAULT": 1, "MIN": 0, "MAX": 1},
    {"NAME": "paint_position", "TYPE": "xy smooth", "DEFAULT": [0.0, 0.0], "MIN": [-1.0, -1.0], "MAX": [1.0, 1.0]},
    {"NAME": "logo_type", "TYPE": "toggle", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "config", "TYPE": "slider", "DEFAULT": 1, "MIN": 0, "MAX": 5},
    {"NAME": "bassconfig", "TYPE": "slider", "DEFAULT": 0, "MIN": 0, "MAX": 5},
    {"NAME": "colRegimeSelector", "TYPE": "slider", "DEFAULT": 2, "MIN": 0, "MAX": 4}
  ]
}*/
float time = syn_Time*0.5;

float volume = syn_Hits;
float brightness = syn_HighHits;
float onBeat = syn_OnBeat;
float bassAccum = syn_BassLevel;
float speedTime = syn_Time * 0.3;
float bassTime = syn_BassTime * 0.3;
float randomizerBeat = syn_ToggleOnBeat;

vec2 resolution = RENDERSIZE;
float WIDTH = _backbuffer_imgSize.x;
float HEIGHT = _backbuffer_imgSize.y;

struct ColorRegime
{
  vec3 col1;
  vec3 col2;
};

ColorRegime reg1 = ColorRegime(vec3(1.0,0.7,0.25), vec3(0.8, 0.8, 1.0));
ColorRegime reg2 = ColorRegime(vec3(0.9,0.1,0.45), vec3(0.3,0.02,0.15));
ColorRegime reg3 = ColorRegime(vec3(0.0,0.3,0.7), vec3(0.7, 0.7, 1.0));
ColorRegime reg4 = ColorRegime(vec3(0.5,0.2,0.0), vec3(0.9, 0.8, 0.65));
ColorRegime reg5 = ColorRegime(vec3(0.0,0.7,0.0), vec3(0.2, 0.6, 1.0));

// Gets the pixel in the backbuffer at (X,Y)
float current(float x, float y) {
 return texture(backbuffer, vec2(x,y)).x;
}

// Gets the previous pixel in the backbuffer at (X,Y)
float past(float x, float y) {
 return texture(backbuffer, vec2(x,y)).y;
}

// Gets normal to surface based on scenedist
vec2 getNormal(vec2 pos){
  float x = pos.x;
  float y = pos.y;
  float eps = 1.0/WIDTH/2.0;
  return normalize(vec2(
    IMG_NORM_PIXEL(backbuffer, vec2(x + eps, y)).x - IMG_NORM_PIXEL(backbuffer, vec2(x - eps, y)).x,
    IMG_NORM_PIXEL(backbuffer, vec2(x, y + eps)).x - IMG_NORM_PIXEL(backbuffer, vec2(x, y - eps)).x));
  }

// Supplies a configuration for 'source' pixels generating waves
float configuration(float i) {
  float width = WIDTH;
  float height = HEIGHT;
  float xp = floor(gl_FragCoord.x) - (width/2.0);
  float yp = floor(gl_FragCoord.y) - (height/2.0);
  vec2 pos = vec2(xp,yp);
  
  if (_isMediaActive()){
    if (logo_type < 0.5){
      float logoFloat = _loadMediaAsMask().r;
      return volume*volume*1.0*logoFloat;
    }
  }
  
  // Concentric Circle
  if (i == 0.0) {
    vec2 mirrorPos = abs(pos);
    float disty = length(pos-vec2(height*0.2*sin(speedTime*2.0*PI*0.08+randomizerBeat),height*0.2*cos(speedTime*2.0*PI*0.124+randomizerBeat)));
    if(disty < 40.0) {
      return volume*volume*1.5*pow(disty/40.0,4.0);
    }
  // Big Concentric Circles
  } else if (i == 1.0) {
    if (mod(length(pos),height/2.0) <= 5.0) {
      return volume*volume*1.5;
    }
  // Random dots
  } else if (i == 2.0) {
    if(_rand(vec2(xp, yp)) < 0.001) {
      return volume*volume*(3.0+3.0*volume);
    }
  // Square
  } else if (i == 3.0) {
    if((abs(xp) == 100.0 && abs(yp) <= 100.0 )||( abs(xp) <= 100.0 && abs(yp) == 100.0)) {
      return volume*volume;
    }
  // Blotches
  } else if (i == 4.0) {
    float noise = _noise(vec3(_uv*20.0, speedTime));
      if (noise*noise - 0.9 > 0.0) {
        return volume*volume * noise*noise * 10.0;
      }
  // Motor boat in ocean
  } else if (i == 5.0) {
    float retVal = 0.0;
    for (float k=-2.0; k<=2.0; k++){
      if(xp == k*140.0 && abs(_uv.y-mod(-abs(k*1.5)+speedTime*0.5,10.0)/10.0) < .01) {
         retVal += 0.5;
      }
    }
    return retVal;
  }
  return 0.0;
}

// Supplies a configuration for putting "dead zones" in when bass hits
float bassConfiguration(float i) {
  float width = WIDTH;
  float height = HEIGHT;
  float xp = floor(gl_FragCoord.x) - (width/2.0);
  float yp = floor(gl_FragCoord.y) - (height/2.0);
  vec2 pos = vec2(xp, yp);

  if (_isMediaActive()){
    if (logo_type > 0.5){
      float logoFloat = _loadMediaAsMask().r;
      return 1.0*logoFloat;
    }  
  }

    // Concentric Circles
  if (i == 0.0) {
    if (mod(length(pos),height/5.0) <= 5.0) {
      return 1.0;
    }
    // Concentric Squares
  } else if (i == 2.0) {
    if (mod(max(abs(pos.x),abs(pos.y)),height/10.0) <= 2.0) {
      return 1.0;
    }
    // Random pixels
  } else if (i == 3.0) {
    if(_rand(floor(pos/20.0)*20.0) < 0.3) {
      return 1.0;
    }
    // Motor boat in ocean
  } else if (i == 4.0) {
    float retVal = 0.0;
    for (float k=-2.0; k<=2.0; k++){
      if(length(pos-vec2(160.0*k,-height/2.0+height*fract((TIME*0.02+bassTime*0.04-abs(0.1*k))))) < 50.0) {
        retVal += 1.0;
      }
    }
    return retVal;
    //big pixels
  } else if (i == 5.0) {
    if(_rand(100.243+floor(vec2(0.0,TIME)+pos/50.0)*50.0) < 0.2) {
      return 1.0;
    }
  }
//  } else if (i < 0.6) {
//    return 0.0;
//  }
  return 0.0;
}

float WAVESPEED = 0.2+0.05*cos((1.0-volume)*PI) + WAVE_SPEED;
// float WAVESPEED = 0.2;

// float config = 1;
// float bassconfig = 1;
// float colRegimeSelector = 2;


// Provides the actual wave simulation
vec3 passOne() {
  float pos;

  // vec2 coord = _rotate(gl_FragCoord.xy - RENDERSIZE/2, ROTATE) + RENDERSIZE/2;
  float rot_mod = ROTATE;
  if (abs(ROTATE)<0.015){
    rot_mod = 0.0;
  }
  float drift_mod = DRIFT;
  if (abs(DRIFT)<0.2){
    drift_mod = 0.0;
  }
  vec2 coord = _rotate(_uv - 0.5*vec2(1.0, RENDERSIZE.x/RENDERSIZE.y), rot_mod * abs(rot_mod)) + 0.5*vec2(1.0, RENDERSIZE.x/RENDERSIZE.y);
  coord += vec2(sin(TIME/10.0), cos(TIME/10.0)) * drift_mod / RENDERSIZE.y;

  coord += (vec2(
    _fbm(vec3(coord * 10.0, TIME)),
    _fbm(vec3(coord * 10.0, TIME + 100.0))
    )  - 0.5) * DISTORTION / 100.0;

  float x = coord.x;
  float y = coord.y;

  // Initlialize pixel if it hasnet been yet
  if(texture(backbuffer,vec2(x,y)).z != 0.25) {
    return vec3(0.0, 0.0, 0.25);
  }

  float r = WAVESPEED;

  // Calculate next positon based on diffrential equation
  float constDamping = 0.01;

  pos = r*r*(
    current(x-1.0/RENDERSIZE.x,y) + current(x+1.0/RENDERSIZE.x,y) +
    current(x,y-1.0/RENDERSIZE.y) + current(x,y+1.0/RENDERSIZE.y) -
    4.0 * current(x,y)) + 
    2.0 * current(x,y) - past(x,y) -
    - constDamping*(current(x,y) - past(x,y));

  // Alter position of pixel if it is one of the source pixels
  if (auto_painter >= 0.5){
    float configData = configuration(floor(config + 0.5));
    if (configData > 0.0) {
      pos = configData;
    }
  } else {
    float disty = length(_uvc-vec2(paint_position.x, paint_position.y)*vec2(1.0, RENDERSIZE.y/RENDERSIZE.x)*0.9);
    if(disty < 0.075) {
      pos = volume*volume*1.5*pow(disty+1.0,4.0);
    }
  }

//  pos = 1.0;
  float bassConfigData = bassConfiguration(floor(bassconfig + 0.5));
  if (bassConfigData > 0.0) {
    pos = pos*pow((1.0-bassAccum),0.2);
  }

  // fade out based on decay (DIFFERENT from damping)
  float decay = _scale(syn_FadeInOut, 0.90, 0.999);
  pos *= decay;

  // clamp position to make sure things dont get too wild
  pos = clamp(pos, -2.0, 2.0);

  // Return position, the last position
  return vec3(pos, current(x,y), 0.25);
}

// Renders the pixels to screen
vec3 passTwo() {
  vec2 uv = _uv - 0.5;
  vec3 data = IMG_NORM_PIXEL(backbuffer,_uv).rgb;
  //Height reaches 2.0, divide by half and then pow it.
  float height = pow(clamp(data.x/2.0,0.0,1.0),0.5);
//  float height = data.x;


  // Provide noise based coloring function
 // vec3 col = vec3(
 //     _fbm(vec3(_uv.x,_uv.y, TIME/30.0)),
 //     _fbm(vec3(_uv.x+10,_uv.y, TIME/30.0)),
 //     _fbm(vec3(_uv.x+20,_uv.y, TIME/30.0))
 //   );
 // col = mix(col, vec3(0.8, 0.8, 1.0), brightness * height);

  // mix gold with silver

  vec3 col1, col2, bkgCol;
  if (floor(colRegimeSelector + 0.5) == 0.0){
    col1 = reg1.col1;
    col2 = reg1.col2;
  } else if (floor(colRegimeSelector + 0.5) == 1.0){
    col1 = reg2.col1;
    col2 = reg2.col2;
  } else if (floor(colRegimeSelector + 0.5) == 2.0){
    col1 = reg3.col1;
    col2 = reg3.col2;
  } else if (floor(colRegimeSelector + 0.5) == 3.0){
    col1 = reg4.col1;
    col2 = reg4.col2;
  } else if (floor(colRegimeSelector + 0.5) == 4.0){
    col1 = reg5.col1;
    col2 = reg5.col2;
  }

  bkgCol = vec3(0.0);
  vec2 norm = getNormal(_uv);
  vec2 light = vec2(sin(brightness+TIME/5.0), cos(brightness+TIME/5.0)*2.0);

  float ref = dot(norm, uv - light)/2.0;

  // uncomment to debug lighting
//   return vec3(ref);

  float colorMixer = clamp((1.0+0.5*sin(uv.x*3.973+speedTime*0.35) + 0.5*sin(uv.y*2.315+speedTime*0.4))/2.0,0.0,1.0);
//  colorMixer = mix(colorMixer, 1.0-colorMixer, brightness);

  vec3 col = mix(col1, col2, colorMixer);
  col = col*(1.0+5.0*pow(clamp(ref, 0.0, 0.9),3.0));

  // Mix to bkg, brightness based on wave height
  vec3 finalCol =  mix(bkgCol, col, height);

  if ((bassconfig >= 0.2&&bassconfig <0.3)||((bassconfig >=0.4)&&bassconfig == 0.5)){
    finalCol *= 2.5;
  }

  return finalCol * 2.0;
}

vec4 renderMain () {
    if (PASSINDEX == 0) {
      return vec4(passOne(),1.0);
    } else if (PASSINDEX == 1) {
      return vec4(passTwo()*(1.0-dot(_uv - 0.5,_uv -0.5)*2.3),1.0);
    } 
return vec4(0);
}
