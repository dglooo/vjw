// Source: donor/visual_system_2/scenes/release/thresholder.synScene (main.glsl + scene.json; script.js approximated, see below) · unknown
// Author: Kyle Grover (Classic Perlin 3D Noise by Stefan Gustavson)
// License: unknown (the donor's CREDIT names Kyle Grover only; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts; body: int literals → float (ES 3.00). script.js (85 lines) approximated:
// - synthTime (a vec3 wound per frame by High / Mid / Bass level · 5·sin³(6.02·synthMacro) · synthScale · synthSpeed)
//   is the clocks synthTime_x/_y/_z, the sin³ factor frozen at the default macro (1.5, × 60 fps = 90); its random start
//   is a fixed offset;
// - randomR/G/B (re-rolled on a hit > .9) is a hash of the beat count (a new colour per beat);
// - current_pallete (set by the bangs palette1…5 / random_palette) is a dropdown; the random palette's 12 numbers
//   (re-rolled per press) are fixed hashes; the 6 bangs are gone;
// - `freezes` is read by no line: dropped.
// movementDir (the donor's HARD_TRANSITIONS uniform) is a control; keep_color gets a default (the donor file has none);
// palette 4's 100 / syn_BassTime is guarded (NaN in silence); palette 1 (the default) reads TIME + 1500 s (its three
// phases coincide at TIME 0: grey for the first minutes; the donor's app clock is minutes old when a scene shows). ⚡ syn_BassHits (the kick) is flash-gated: it turns the
// synth's hue.
/*{
  "TITLE": "Thresholder",
  "CREDIT": "Kyle Grover",
  "TAGS": ["media", "colorful", "pyschedelic", "intense", "glitchy", "donor"],
  "WIDTH": 1920,
  "HEIGHT": 1080,
  "PASSES": [{"FLOAT": true, "HEIGHT": 1080, "TARGET": "fkry", "WIDTH": 1920}, {"FLOAT": true, "HEIGHT": 1080, "TARGET": "buffA", "WIDTH": 1920}],
  "VJW_FLASH": ["syn_BassHits"],
  "VJW_CLOCK": {
    "synthTime_x": [[90, "syn_HighLevel", "synthScale", "synthSpeed"]],
    "synthTime_y": [[90, "syn_MidLevel", "synthScale", "synthSpeed"]],
    "synthTime_z": [[90, "syn_BassLevel", "synthScale", "synthSpeed"]]
  },
  "CONTROLS": [
    {"NAME": "THRESHOLD", "TYPE": "slider smooth", "DEFAULT": 0.5, "MIN": 0, "MAX": 1.1},
    {"NAME": "threshold_vol", "TYPE": "slider smooth", "DEFAULT": 0.2, "MIN": 0, "MAX": 1},
    {"NAME": "keep_color", "TYPE": "color", "DEFAULT": [0, 0, 0], "DEF_COLOR": [0.8, 0.1, 0.1]},
    {"NAME": "random_keep_color", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "tone_movement", "TYPE": "slider smooth", "DEFAULT": 0.004, "MIN": 0.0, "MAX": 0.01},
    {"NAME": "zoom_to_volume", "TYPE": "slider smooth", "DEFAULT": 0.003, "MIN": 0, "MAX": 0.02},
    {"NAME": "bufferglitch", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "bright_adjust", "TYPE": "slider smooth", "DEFAULT": 0, "MIN": -0.002, "MAX": 0.002},
    {"NAME": "color_spin", "TYPE": "slider smooth", "DEFAULT": 0.005, "MIN": 0.001, "MAX": 0.03},
    {"NAME": "saturate_adjust", "TYPE": "slider smooth", "DEFAULT": 0, "MIN": -0.002, "MAX": 0.002},
    {"NAME": "bright_adjust_auto", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "palletize_after", "TYPE": "toggle", "DEFAULT": 1.0, "MIN": 0, "MAX": 1},
    {"NAME": "palletize_before", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "get_frame", "TYPE": "bang", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "play_media", "TYPE": "toggle", "DEFAULT": 1, "MIN": 0, "MAX": 1},
    {"NAME": "auto_get_frame", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "synthScale", "TYPE": "slider smooth", "DEFAULT": 0.25, "MIN": 0, "MAX": 1},
    {"NAME": "synthMacro", "TYPE": "slider smooth", "DEFAULT": 0.4, "MIN": 0, "MAX": 1},
    {"NAME": "synthSpeed", "TYPE": "slider smooth", "DEFAULT": 0.1, "MIN": 0, "MAX": 1},
    {"NAME": "current_pallete", "TYPE": "dropdown", "DEFAULT": 1, "LABELS": ["random", "1", "2", "3", "4", "5"]},
    {"NAME": "movementDir", "TYPE": "slider", "DEFAULT": 1, "MIN": -1, "MAX": 1}
  ]
}*/
#define T1 (TIME + 1500.0) // VeeJay Wizard: palette 1 (the default) on an app clock 25 min old
const float twopies = 6.28318530718;
//helper functions
vec3 hsv_2_rgb( in vec3 c ){
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 rgb_2_hsv( in vec3 c ){
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
float plot(vec2 st, float pct, float width){
  return  smoothstep( pct-width, pct, st.x) -
          smoothstep( pct, pct+width, st.x);
}

//	Classic Perlin 3D Noise 
//	by Stefan Gustavson
//
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}

float cnoise(vec3 P){
  vec3 Pi0 = floor(P); // Integer part for indexing
  vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1.0
  Pi0 = mod(Pi0, 289.0);
  Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P); // Fractional part for interpolation
  vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;

  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0);
  vec4 ixy1 = permute(ixy + iz1);

  vec4 gx0 = ixy0 / 7.0;
  vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);

  vec4 gx1 = ixy1 / 7.0;
  vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);

  vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
  vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
  vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
  vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
  vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
  vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
  vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
  vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

  vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x;
  g010 *= norm0.y;
  g100 *= norm0.z;
  g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x;
  g011 *= norm1.y;
  g101 *= norm1.z;
  g111 *= norm1.w;

  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);

  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x); 
  return 2.2 * n_xyz;
}

vec4 defaultSynth(in vec2 fragCoord ) {    
    vec2 synthuv = _uv - 0.5;
    synthuv *= (0.02 + (synthScale * synthScale * 8.0));

    vec2 noisescaleR = vec2(
        sin(synthMacro * 12.015), 
        sin(synthMacro * 12.522)
    ) * 10.0;
    vec2 noisescaleG = vec2(
        sin(synthMacro * 13.04), 
        sin(synthMacro * 13.3)
    ) * 10.0;
    vec2 noisescaleB = vec2(
        sin(synthMacro * 14.08), 
        sin(synthMacro * 14.55)
    ) * 10.0; 

    vec3 synthTimeNow = vec3(synthTime_x, synthTime_y, synthTime_z) + vec3(17.3, 43.7, 71.1); // VeeJay Wizard: the clocks
    float noiser = cnoise( vec3(
        synthuv.x * noisescaleR.x, 
        synthuv.y * noisescaleR.y, 
        synthTimeNow.r
    ));
    float noiseg = cnoise( vec3(
        synthuv.x * noisescaleG.x, 
        synthuv.y * noisescaleG.y, 
        synthTimeNow.g
    ));
    float noiseb = cnoise( vec3(
        synthuv.x * noisescaleB.x, 
        synthuv.y * noisescaleB.y, 
        synthTimeNow.b
    ));
    vec3 noisecol = vec3(noiser, noiseg, noiseb);
    vec3 noisecolhsv = rgb_2_hsv(noisecol);
    noisecolhsv.r = sin(noisecol.r * 3.0);
    noisecolhsv.g = sin(noisecol.g * 4.0);
    noisecolhsv.b = sin(noisecol.b * 5.0);
    noisecol = hsv_2_rgb(noisecolhsv);
    // shuffle values and do some sin or mod stuff
    noisecol = vec3( 
        sin(noisecol.r * noisecol.g / noisecol.b) * noiser,
        (noisecol.g * noisecol.b / noisecol.r) * noiseg,
        mod(noisecol.b * noisecol.r / noisecol.g, 1.0) * noiseb
    );
    // switch to hsv to rotate color based on some sound variable
    noisecol = rgb_2_hsv(noisecol);
    noisecol.r += syn_BPMSin4 + 0.5 - syn_BassHits;
    noisecol = hsv_2_rgb(noisecol);
    return vec4(noisecol.r,noisecol.g,noisecol.b,1.0);
}

bool getthreshold(in vec4 userimage) {
    // escape conditions first
    if (userimage.a < 0.2) { return false;}
 
    // color similarity threshold 
    float threshold_factor = THRESHOLD + ((threshold_vol * syn_BassLevel + threshold_vol * syn_MidHighLevel) / 2.0);
    vec3 color_to_keep = keep_color;
    if (random_keep_color > 0.5) {
        color_to_keep = _hash31(floor(syn_BeatTime)); // VeeJay Wizard: a new colour per beat; // get randomizing color from javascript
    }
    if (abs(userimage.r - color_to_keep.r) < threshold_factor &&
        abs(userimage.g - color_to_keep.g) < threshold_factor &&
        abs(userimage.b - color_to_keep.b) < threshold_factor) {
            return true;
    }
    return false;
}

vec3 palette( in float brightness, in vec3 bias, in vec3 amp, in vec3 freq, in vec3 phase ) {
    return bias + amp*cos( twopies*(freq*brightness+phase) );
}


vec3 palletize(inout vec3 color) {
  float grayscale = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
  if (int(current_pallete + 0.5) == 0) color = palette(grayscale, _hash31(1.0)-0.5,_hash31(2.0)*2.0,_hash31(3.0),_hash31(4.0) );
  if (int(current_pallete + 0.5) == 1) color = palette(grayscale, 
    vec3(0.5),vec3(0.5),vec3(1.0,1.0,1.0),vec3( abs(_uv.x - 0.5) * sin(syn_Time * T1 * 0.001) - abs(_uv.y - 0.5) * sin(syn_BassTime * T1 * 0.001),mod(syn_Time / 100.0 + T1 / 600.0, 1.0),sin(syn_Time / 200.0 + T1 / 900.0)) );
  if (int(current_pallete + 0.5) == 2) color = palette(grayscale, 
    vec3(0.5),vec3(0.5),vec3(sin(syn_BassTime * 0.01) + 1.0,sin(syn_MidTime * 0.01) + 1.0,sin(syn_HighTime * 0.01) + 1.0),vec3(TIME * 0.01) );
  if (int(current_pallete + 0.5) == 3) color = palette(mod(grayscale * 4.0 * abs(_uv.x - 0.5) * abs(_uv.y - 0.5), 1.0), 
    vec3(mod(TIME * 0.0001, 1.0)),vec3(mod(TIME * -0.0001, 1.0)),vec3(1.0,1.0,0.5),vec3(
        syn_BassLevel * 3.0,
        syn_MidHighLevel * 3.0, 
        syn_HighPresence * 3.0 ) );
  if (int(current_pallete + 0.5) == 4) color = palette(grayscale, 
    vec3(1.0),vec3(1.0),vec3(_uv.x * 10.0, _uv.y, 20.0),vec3( _uv.x + TIME * 0.1 * (100.0 / max(syn_BassTime, 1.0)) ) );
  if (int(current_pallete + 0.5) == 5) color = palette(grayscale, 
    vec3(0.5),vec3(0.5),vec3(11.1 + syn_HighLevel / 5.0, 11.2, 11.3 + syn_BassLevel / 5.0),vec3(TIME) );
  return color;
}
// pass 0.0, generate image and save to buffer
void bufferImage1( out vec4 fragColor, in vec2 fragCoord ){
    // load user image at the start, we'll need it later
    vec3 oldcolors = texture(buffA,_uv).rgb;
    // offset for bump to beat
    _uv = _uv;
    // bump to beat
    _uv = ( ( _uv - 0.5 ) / ( 1.0 + (syn_MidLevel * zoom_to_volume) ) + 0.5 );
    // tone movement
    oldcolors = rgb_2_hsv(oldcolors);
    oldcolors.r += TIME / 100.0;
    oldcolors = hsv_2_rgb(oldcolors);
    _uv.x += oldcolors.r * 0.005 + (syn_BassPresence * tone_movement*movementDir);
    _uv.y += oldcolors.g * 0.005 + (syn_Presence * tone_movement*movementDir);
    _uv -= oldcolors.b * 0.005 + (syn_MidHighPresence * tone_movement*movementDir);
    vec3 colors = texture(buffA,_uv).rgb;
    vec3 hsv_colors = rgb_2_hsv(colors);
    hsv_colors.r += color_spin;
    hsv_colors.g += saturate_adjust * 2.0;
    if (bright_adjust_auto > 0.5) {
        hsv_colors.b += 1.0 - rgb_2_hsv(keep_color).b * 0.05;
    } else {
        hsv_colors.b += bright_adjust * 2.0;
    }
    colors = hsv_2_rgb(hsv_colors);
    if (palletize_before > 0.5) colors = palletize(colors);
    fragColor = vec4(colors,1.0);
}
vec4 mainpass(in vec2 _uv) {    
    vec4 fragColor;
    // should we snag this frame?
    bool snagthisframe = false;
    if (get_frame > 0.5) snagthisframe = true;
    if (play_media > 0.5) snagthisframe = true;
    if (auto_get_frame > 0.5 && syn_Hits > 0.8) snagthisframe = true;
    if (auto_get_frame > 0.5 && play_media > 0.5 && syn_Hits < 0.8) snagthisframe = false;
    if (snagthisframe) {
        if (_isMediaActive()) { // check if user has media available
            fragColor = _loadMedia();
        } else {
            fragColor = defaultSynth(_xy);
        }
        if ( !getthreshold(fragColor)) bufferImage1(fragColor, _xy);
    } else {
        bufferImage1(fragColor, _xy);
    }
    return fragColor; 
}
// framework / main loop
vec4 renderMain(void)
{
  if (PASSINDEX == 0.0){ 
      if (bufferglitch > 0.5) {
        return texture(fkry,_uv);
      } else {
        return mainpass(_uv);
      } 
  } else if (PASSINDEX == 1.0){ // store buffer for feedback
      if (bufferglitch > 0.5) {
        return mainpass(_uv);
      } else {
        return texture(fkry,_uv);
      } 
  } else if (PASSINDEX == 2.0){ // another pass for final tweaks
    //output
    vec4 color4 = texture(buffA,_uv);
    vec3 color = vec3(color4.r, color4.g, color4.b); 
    if (palletize_after > 0.5) color = palletize(color);
    return vec4(vec3(color),1.0);
  }
}
