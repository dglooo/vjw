// Source: donor/visual_system_2/scenes/release/glitch.synScene (main.glsl + scene.json + images/) · unknown
// Author: Meebs ft. XOR
// License: unknown (the donor's CREDIT names Meebs ft. XOR only; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts (IMAGES myImage / anotherImage / badlands / goop from
// public/syn/glitch/images/). Changes for ES 3.00: FRAMECOUNT <= 5 -> 5.0, mod(i, 2)==0 -> mod(i, 2.0)==0.0,
// -1+mod( -> -1.0+mod(. No script.js. HARD_TRANSITIONS sizeTri / rgbSplitStyle and SMOOTH_TRANSITIONS c0..c3 are
// static controls (no re-roll on a musical transition). pass0 is the 2x1 data target (time since the last jump, the
// jump count). No media input: the centre mark is the scene's own noise cross.
// ⚡ syn_OnBeat (the kick: above .9 the background jumps to a new picture) and syn_HighHits (the white lines' light,
// linesOn) are flash-gated.
/*{
  "TITLE": "Glitch",
  "CREDIT": "Meebs ft. XOR",
  "TAGS": ["glitch", "colorful", "media", "donor"],
  "PASSES": [{"TARGET": "pass0", "WIDTH": 2, "HEIGHT": 1, "FLOAT": true}, {"TARGET": "forDripping", "WIDTH": 1920, "HEIGHT": 1080, "FLOAT": true}, {"TARGET": "dripBuffer", "WIDTH": 1920, "HEIGHT": 1080, "FLOAT": true}, {"TARGET": "forRGBSplit", "WIDTH": 1920, "HEIGHT": 1080, "FLOAT": true}],
  "IMAGES": [{"PATH": "images/city.jpg", "NAME": "myImage"}, {"PATH": "images/nightclubLights.jpg", "NAME": "anotherImage"}, {"PATH": "images/fire.jpg", "NAME": "badlands"}, {"PATH": "images/goop.jpg", "NAME": "goop"}],
  "HARD_TRANSITIONS": [{"UNIFORM": "sizeTri", "VALUES": [90.0, 30.0, 200.0]}, {"UNIFORM": "rgbSplitStyle", "VALUES": [2.0, 1.0, 0.0]}],
  "SMOOTH_TRANSITIONS": [{"UNIFORMS": ["c0", "c1", "c2", "c3"], "DURATION": 10}],
  "VJW_FLASH": ["syn_OnBeat", "syn_HighHits"],
  "CONTROLS": [
    {"NAME": "white_on", "TYPE": "toggle", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "linesOn", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "invert_white", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "rgb_split", "TYPE": "slider", "DEFAULT": 0.17, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "rotate_slice", "TYPE": "knob", "DEFAULT": 0.0, "MIN": -0.5, "MAX": 0.5},
    {"NAME": "drip_rate", "TYPE": "slider smooth", "DEFAULT": 0.0, "MIN": -1.0, "MAX": 7.0, "PARAMS": 0.05},
    {"NAME": "auto_jumps", "TYPE": "toggle", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "jump", "TYPE": "bang", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0}
  ]
}*/

float triggerNewImg(){
  float trigger = 0.0;
  if(auto_jumps>0.5){
    if (syn_OnBeat > 0.9){
      trigger = 1.0;
    }
  } else {
    if(jump>0.5){
      trigger = 1.0;
    }
  }
  return trigger;
}

vec4 dataPass(){
    vec4 oldTimeData = texelFetch(pass0, ivec2(0,0), 0);
    if (FRAMECOUNT <= 5.0){
        oldTimeData = vec4(0.0);
    }
    float timeSinceReset = oldTimeData.r;
    timeSinceReset += 1.0/60.0;
    if (triggerNewImg() == 1.0){
      timeSinceReset = 0.0;
    }

    float incrementOnReset = oldTimeData.g;
    if (triggerNewImg() == 1.0){
      incrementOnReset += 1.0;
    }
    // oldTimeData += pow(vec4(syn_BassLevel, syn_MidLevel, syn_MidHighLevel, syn_HighLevel),vec4(2.0))*0.1;
    return vec4(timeSinceReset, incrementOnReset, 0.0, 0.0);
}

float rando(float n)
{
  return fract(abs(sin(n*55.753)*367.34));   
}
float rando(vec2 n)
{
    return rando(dot(n,vec2(2.46,-1.21)));
}
float cycle(float n)
{
  return cos(fract(n)*2.0*3.141592653)*0.5+0.5;
}
vec4 genTris(float size, vec2 motion)
{
  float a = radians(60.0);
  float zoom = size;
  vec2 c = (_uv*RENDERSIZE + motion * vec2(sin(a),1.0));
  
  c = ((c+vec2(c.y,0.0)*cos(a))/zoom)+vec2(floor((c.x-c.y*cos(a))/zoom),0.0);
  
  float n = cycle(rando(floor(c*4.0))*0.2+rando(floor(c*2.0))*0.3+rando(floor(c))*0.5+TIME*0.125);
  
  float briTris = 0.1*exp(0.03*(pow(n,-1.)));

  vec4 finalCol = vec4(0.0, n*(1.0-syn_BassPresence), pow(n, 2.0), 1.0)+vec4(0.6,0.3,0.0,0.0)*pow(briTris,2.0-syn_HighPresence*1.5);


  return clamp(finalCol,0.0,1.0);
}

vec3 hash3( vec2 p ) //By iq !
{
    vec3 q = vec3( dot(p,vec2(127.1,311.7)), 
           dot(p,vec2(269.5,183.3)), 
           dot(p,vec2(419.2,371.9)) );
  return fract(sin(q)*43758.5453);
}
vec4 whiteLines(vec2 posIn)
{
  float l=sqrt(RENDERSIZE.x*RENDERSIZE.x+RENDERSIZE.y*RENDERSIZE.y);
  float eps=0.13;
  vec2 uv = _xy/RENDERSIZE;
  uv *= vec2(1.0,0.1);
  uv += vec2(1.0,0.5);
  uv.x *= 3.1415*0.5;
  uv.y *= 2.0;
  uv.y -= 1.0;
  uv.y *= RENDERSIZE.y;
  vec3 color = vec3(0.0,0.0,0.0);
  float passes = 20.0;
  
  for  (float i=0.0; i<passes; i++) {
      vec3 rd=hash3(vec2(1.45*i/passes,2.0*i/passes)*26.351);
      float rd_l=0.1-rd.x;
      float rd_p=3.1415*(rd.y);
      float rd_speed=2.0+2.0*rd.z;
      float fy=l*rd_l*cos(uv.x+rd_speed*syn_Time*0.0001+rd_p*i*syn_BassTime*0.1);
      vec3 col = texture(forDripping, _uv).rgb;
      if (mod(i, 2.0)==0.0){
        col = vec3(1.0);
      }
      if (uv.y >= fy - eps && uv.y <= fy + eps) {
          color += col*vec3(0.6 - 0.12*abs(uv.y - fy)/eps);
      }
  }
      
  return vec4(clamp(color.xyz*1.5,0.0,1.0),1.0);
}

vec4 dripGlitch() {
  vec4 timeData = texelFetch(pass0, ivec2(0,0), 0);
  float timeSinceReset = timeData.r;
  float incrementOnReset = timeData.g;

  float timeModderX, timeModderY, slicerAngleCor;


  timeModderY = smoothstep(0.0,0.25,timeSinceReset)-smoothstep(0.35, 1.0,timeSinceReset);
  timeModderY = pow(timeModderY, 1.5);
  timeModderY *= 0.0025+drip_rate*0.0025;

  timeModderX = smoothstep(0.2,2.0,timeSinceReset)-smoothstep(2.0, 3.0,timeSinceReset);
  // timeModderX += timeSinceReset*0.1;
  timeModderX = pow(timeModderX, 1.5);
  timeModderX *= 0.0005+drip_rate*0.0005;
      
  slicerAngleCor = rotate_slice;


  vec2 rotPos = _rotate(_uv, slicerAngleCor*PI);
  // vec2 rotPos = _uv;


  vec4 refreshImg = texture(forDripping, _uv);

  float columns = _pixelate(rotPos.x, 100.0);
  columns = (-0.5+_rand(columns+incrementOnReset))*2.0;

  float rows = _pixelate(rotPos.y, 500.0);
  rows = (-0.5+_rand(rows+incrementOnReset))*2.0;

  vec2 posModder = vec2(rows*timeModderX,columns*timeModderY);

  vec2 constantX = vec2(rows*0.0005*clamp(timeSinceReset-2.0, 0.0, 1.0) ,0.0)*syn_FadeInOut;

  vec2 drippedPos = _rotate(_uv, slicerAngleCor*PI)+(posModder)*(0.2+syn_Presence*1.5)+constantX;

  drippedPos = _rotate(drippedPos, -slicerAngleCor*PI);

  vec4 oldDripImg = texture(dripBuffer, _uv);
  vec4 newDripImg = texture(dripBuffer, drippedPos);

  if (length(oldDripImg)>length(newDripImg)){
    newDripImg = oldDripImg;
  }
    vec4 tritex = clamp(pow(1.0-texture(forDripping, _uv),vec4(3.0))*10.0,0.0,1.0);
    vec4 logoImg = vec4(step(max(abs(_uvc.x*_pixelate(_fbm(TIME*10.0+_uv.y*100.0), 10.0)), abs(_uvc.y*_pixelate(_fbm(TIME*10.0+_uv.x*100.0), 10.0))),0.05));
    if(_isMediaActive()){
      logoImg = _loadMediaAsMask();
    }

  if (triggerNewImg()==1.0){
    newDripImg = refreshImg;
    vec2 posModded = _uv*0.8+normalize(clamp(_uvc,0.1,1.0))*sin(TIME*0.1)*0.5+0.5*vec2(sin(TIME*0.25),cos(TIME*0.33));
    vec4 picture = texture(anotherImage, posModded);
    if (mod(incrementOnReset,2.0)==0.0){
      picture = texture(badlands, posModded);
    }
    if (mod(incrementOnReset,3.0)==0.0){
      picture = texture(myImage, posModded);
    }
    if (mod(incrementOnReset,4.0)==0.0){
      picture = texture(goop, posModded);
    }
    picture = vec4(_pixelate(picture.r,10.0),_pixelate(picture.g,10.0),_pixelate(picture.b,10.0),_pixelate(picture.a,10.0));

    newDripImg = min(newDripImg,pow(picture,vec4(3.0)));
    newDripImg += pow(newDripImg, vec4(0.5)).rgba*0.2;


    if (linesOn >= 0.5) {
      vec4 lines = whiteLines(_uv);
      newDripImg = max(newDripImg, lines*newDripImg);
      if (invert_white>0.5){
        lines = 0.9-lines;
        newDripImg = min(newDripImg, lines*newDripImg);
        newDripImg += tritex*syn_HighHits*pow(lines,vec4(10.0))*2.0;
      }else {
        newDripImg = max(newDripImg, lines*newDripImg);
        newDripImg += tritex*syn_HighHits*pow(lines,vec4(5.0))*20.0;
      }
    } 

    if (invert_white >= 0.5){
      logoImg = 0.9-logoImg;

    }
    if (white_on >= 0.5){
      newDripImg = max(newDripImg*1.3, logoImg*0.9);
      newDripImg += vec4(newDripImg.r*c0*0.4,newDripImg.g*c1*0.4,newDripImg.b*c2,c3)*0.5;
    }
  }

  if (linesOn >= 0.5) {
    vec4 lines = whiteLines(_uv);
    newDripImg = max(newDripImg, lines*newDripImg);
    newDripImg += tritex*syn_HighHits*pow(lines,vec4(5.0))*20.0;
  } 


  return newDripImg;
}

vec4 displayDrippedBuffer() {
  vec4 backbuffer = texture(dripBuffer, _uv);
  return backbuffer;
}


float rgbZoomAmt = pow((syn_BassLevel+syn_BassHits)*0.8+syn_BPMTri*0.3+syn_Hits*0.3,2.0)*pow(rgb_split,2.0);
float time = TIME;
vec4 renderMain(void)
{
	if (PASSINDEX == 0.0){
		return dataPass();
	} else if (PASSINDEX == 1.0){
    return genTris(sizeTri, vec2(sin(TIME)*96.0*3.0, cos(TIME)*96.0)*3.0);
	} else if (PASSINDEX == 2.0){
    return dripGlitch();
  } else if (PASSINDEX == 3.0){
    return displayDrippedBuffer();
  } else if (PASSINDEX == 4.0){
    vec3 col;
    vec2 posBL = _uv;
    // vec2 posTri = getNDCAspectCorrected();
    // posTri = getMirrorPosSimple(posTri, 1);
    // posTri *= vec2(0.5,-1.0);
    // float tri = triGen(posTri, rgbZoomAmt*0.5);
    float rgbZoomAmtMod = rgbZoomAmt;
    vec2 modifiedCenter = vec2(cos(time), sin(time))*0.5;
    if (rgbSplitStyle > 0.5){
      rgbZoomAmtMod *= _noise(_pixelate(_uv.y,50.0)*100.0);
    } else if (rgbSplitStyle > 1.5){
      rgbZoomAmtMod *= -1.0+mod(_xy.x,3.0);
    } else {
      rgbZoomAmtMod *= step(0.5,_noise(_pixelate(_uvc+syn_BeatTime,100.0)*100.0));
      modifiedCenter = pow(_uvc,vec2(3.0));
    }
    vec2 rPos = (posBL - modifiedCenter)*(1.0/(1.0+rgbZoomAmtMod*0.31*sin(time*0.23)))+modifiedCenter;
    vec2 gPos = (posBL - modifiedCenter)*(1.0/(1.0+rgbZoomAmtMod*0.398*sin(time*0.2)))+modifiedCenter;
    vec2 bPos = (posBL - modifiedCenter)*(1.0/(1.0+rgbZoomAmtMod*0.33*sin(time*0.3)))+modifiedCenter;

    rPos = abs(rPos);
    if (rPos.x >= 0.9999){
      rPos.x = 0.9999-rPos.x;
    }
    if (rPos.y >= 0.9999){
      rPos.y = 0.9999-rPos.y;
    }

    gPos = abs(gPos);
    if (gPos.x >= 0.9999){
      gPos.x = 0.9999-gPos.x;
    }
    if (rPos.y >= 0.9999){
      gPos.y = 0.9999-gPos.y;
    }

    bPos = abs(bPos);
    if (bPos.x >= 0.9999){
      bPos.x = 0.9999-bPos.x;
    }
    if (rPos.y >= 0.9999){
      bPos.y = 0.9999-bPos.y;
    }

    col.r = texture(forRGBSplit, rPos).r;
    col.g = texture(forRGBSplit, gPos).g;
    col.b = texture(forRGBSplit, bPos).b;

    col *= syn_FadeInOut;

    return vec4(col,1.0);
  }
}
