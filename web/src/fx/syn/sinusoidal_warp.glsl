// Source: donor/visual_system_2/scenes/release/sinusoidal_warp.synScene (main.glsl + scene.json; script.js restated as VJW_CLOCK) · CC BY-NC-SA 3.0
// Author: Shane ("Bumped Sinusoidal Warp", https://www.shadertoy.com/view/4l2XWK), modified by Mikael Ems (Shady Headstash)
// License: CC BY-NC-SA 3.0 Unported (the body's licence lines are kept)
// VeeJay Wizard, 2026: ported for fx/syn.ts. NEEDS A MEDIA INPUT: it warps syn_Media (black: no media yet); while
// _isMediaActive() is false it draws its textureless shaded warp. Change for ES 3.00: i<3. -> i<3. script.js (not
// run) restated per second (it multiplies by dt): bass_time += rate x (1 + syn_Level x syn_Hits + syn_BassPresence);
// its script_time is not read by the body. direction's reversed range (MIN 1, MAX -1) is written low to high.
/*{
  "TITLE": "Sinusoidal Warp",
  "CREDIT": "Shady Headstash",
  "TAGS": ["media", "uv", "distorted", "donor"],
  "WIDTH": 1920,
  "HEIGHT": 1080,
  "VJW_CLOCK": {
    "bass_time": [["rate"], ["rate", "syn_Level", "syn_Hits"], ["rate", "syn_BassPresence"]]
  },
  "CONTROLS": [
    {"NAME": "rate", "TYPE": "knob", "DEFAULT": 0.25, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "warp", "TYPE": "slider smooth", "DEFAULT": 4.0, "MIN": 1.0, "MAX": 8.0},
    {"NAME": "intensity", "TYPE": "slider smooth", "DEFAULT": 1.0, "MIN": 0, "MAX": 1},
    {"NAME": "direction", "TYPE": "xy smooth", "DEFAULT": [0.0, 0.0], "MIN": [-1.0, -1.0], "MAX": [1.0, 1.0]},
    {"NAME": "media_xy", "TYPE": "xy smooth", "DEFAULT": [0, 0], "MIN": [-1.0, -1.0], "MAX": [1, 1]},
    {"NAME": "refraction", "TYPE": "slider smooth", "DEFAULT": 0.25, "MIN": 0, "MAX": 1.0},
    {"NAME": "brightness", "TYPE": "slider smooth", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0}
  ]
}*/
// --- Original "Bumped Sinusoidal Warp" shader by Shane from https://www.shadertoy.com/view/4l2XWK
// Modified by Mikael Ems (Shady Headstash)
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

// --- noise functions from https://www.shadertoy.com/view/XslGRr
// Created by inigo quilez - iq/2013
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

#define PI 3.14159265359
#define HPI 1.570796326795
#define TWPI 6.283185307179586  	// two pi, 2*pi

vec4 texMirror(sampler2D samplerIn, vec2 uvIn){
    if (mod(uvIn.x, 2.0) > 1.0){
        uvIn.x = 1.0-uvIn.x;
    }
    if (mod(uvIn.y, 2.0) > 1.0){
        uvIn.y = 1.0-uvIn.y;
    }
    return _textureMedia(uvIn);
}

// Warp function. Variations have been around for years. This is
// almost the same as Fabrice's version:
// Fabrice - Plop 2
// https://www.shadertoy.com/view/MlSSDV
vec2 W(vec2 p){

    float t = bass_time;

    p += _uvc*10.0*mix(0.3, 0.1, (warp-1.0)/7.0);

    // Planar sine distortion.
    for (int i=0; i<3; i++)
    p += cos(p.yx*warp + vec2(t, PI*(direction.x*2.0)))/3.*intensity,
    p += cos(p.yx + vec2(0, -PI*(direction.y*2.0)) + t)/2.*intensity,
    p *= 1.3;

    // Domain repetition.
    return mod(p, 2.)-1.;
}

vec4 renderMainImage() {
	vec4 o = vec4(0.0);
	vec2 u = _xy / RENDERSIZE.xy;

    // Texture lookup.
    vec2 tu = W(u);

    u += media_xy.xy * 0.25;
    o.w = length(W(u));
    //o = texture(syn_Media, u + tu*refraction);
    //o = (vec4(.7, .4, .1, 1) * pow(max((o.w-length(W(u - .01))), 0.)*8. + 1., 4.)*.1 + .5)*o.w;

    // Shading.
    float c = (1.0-length(tu));
    c *= sqrt(c);
    c = pow(c, 1.1-brightness);

    if (_isMediaActive()) {
        // Texture color.
        o = vec4(c) * texMirror(syn_Media, u + tu*(refraction*0.1));
        //o = smoothstep(.05, .5, o*o);
    } else {
        float d = max(c - length (W(u*5. + vec2(.025, .015))), 0.)*5. + .3;
        d *= d*d*.5; // Ramp it up a bit for extra shine.
        // Textureless.
        o = sqrt((d + vec4(1.0))*c);
    }
	return o;
 }

/*
// Smaller version, sans texture.
void mainImage( inout vec4 o,  vec2 u ) {
    u /= RENDERSIZE.y/5.;
    o.w = length(W(u));
    o = texture(syn_Media, u + tu*refraction);
    o = (vec4(.7, .4, .1, 1) * pow(max((o.w-length(W(u - .01))), 0.)*8. + 1., 4.)*.1 + .5)*o.w;
}
*/


vec4 renderMain(){
	if(PASSINDEX == 0){
		return renderMainImage();
	}
}
