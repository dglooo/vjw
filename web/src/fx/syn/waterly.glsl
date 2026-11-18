// Source: donor/visual_system_2/scenes/release/waterly.synScene (main.glsl + scene.json + images/watertex.png; script.js restated as VJW_CLOCK) · CC BY-NC-SA 3.0
// Author: FabriceNeyret2 ("waterly video - test", https://www.shadertoy.com/view/MdlGDM), modified by Mikael Ems (Shady Headstash); noise: Inigo Quilez (https://www.shadertoy.com/view/XslGRr)
// License: CC BY-NC-SA 3.0 Unported (the body's licence lines are kept)
// VeeJay Wizard, 2026: ported for fx/syn.ts (IMAGES image10 from public/syn/waterly/images/watertex.png: the picture
// the noise distorts while there is no media; syn_Media is black, _isMediaActive() false). Changes for ES 3.00:
// rotate2d(1*-PI) -> rotate2d(-PI); a sampler cannot be a ?: operand, so the media / image choice picks between two
// texMirror calls. script.js (not run) restated per second (it multiplies by dt): bass_time += rate x (1 + 2 x
// syn_Level + syn_Presence + syn_Hits + syn_BassPresence + 2 x syn_BassHits); its script_time is not read by the
// body. Reversed ranges (direction, position) are written low to high.
// Our detector's logic (user 2026-11-18): the intensity control rides a source: the noise's strength x (.6 + .8 x
// syn_Intensity) (energy: x 1 at .5), so the water churns harder as the track fills up.
/*{
  "TITLE": "Waterly",
  "CREDIT": "Shady Headstash",
  "TAGS": ["media", "distorted", "2d", "donor"],
  "WIDTH": 1920,
  "HEIGHT": 1080,
  "IMAGES": [{"NAME": "image10", "PATH": "images/watertex.png"}],
  "VJW_CLOCK": {
    "bass_time": [["rate"], [2, "rate", "syn_Level"], ["rate", "syn_Presence"], ["rate", "syn_Hits"], ["rate", "syn_BassPresence"], [2, "rate", "syn_BassHits"]]
  },
  "CONTROLS": [
    {"NAME": "rate", "TYPE": "knob smooth", "DEFAULT": 0.25, "MIN": 0, "MAX": 1},
    {"NAME": "scale", "TYPE": "slider smooth", "DEFAULT": 0.5, "MIN": 0.1, "MAX": 1.0},
    {"NAME": "intensity", "TYPE": "slider", "DEFAULT": 0.5, "MIN": 0, "MAX": 1},
    {"NAME": "direction", "TYPE": "xy smooth", "DEFAULT": [0, 0], "MIN": [-2, -2], "MAX": [2, 2]},
    {"NAME": "position", "TYPE": "xy smooth", "DEFAULT": [0, 0], "MIN": [-1, -1], "MAX": [1, 1]},
    {"NAME": "zoom", "TYPE": "slider smooth", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0}
  ]
}*/
// --- Original "waterly video - test" shader by FabriceNeyret2 from https://www.shadertoy.com/view/MdlGDM
// Modified by Mikael Ems (Shady Headstash)
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

// --- noise functions from https://www.shadertoy.com/view/XslGRr
// Created by inigo quilez - iq/2013
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

vec4 texMirror(sampler2D samplerIn, vec2 uvIn){
    if (mod(uvIn.x, 2.0) > 1.0){
        uvIn.x = 1.0-uvIn.x;
    }
    if (mod(uvIn.y, 2.0) > 1.0){
        uvIn.y = 1.0-uvIn.y;
    }
    return texture(samplerIn, mod(uvIn, 1.0));
}

mat3 m = mat3( 0.00,  0.80,  0.60,
              -0.80,  0.36, -0.48,
              -0.60, -0.48,  0.64 );

float hash( float n )
{
    return fract(sin(n)*43758.5453);
}

float noise( in vec3 x )
{
    vec3 p = floor(x);
    vec3 f = fract(x);

    f = f*f*(3.0-2.0*f);

    float n = p.x + p.y*57.0 + 113.0*p.z;

    float res = mix(mix(mix( hash(n+  0.0), hash(n+  1.0),f.x),
                        mix( hash(n+ 57.0), hash(n+ 58.0),f.x),f.y),
                    mix(mix( hash(n+113.0), hash(n+114.0),f.x),
                        mix( hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);
    return res;
}

float fbm( vec3 p )
{
    float f;
    f  = 0.5000*noise( p ); p = m*p*2.02;
    f += 0.2500*noise( p ); p = m*p*2.03;
    f += 0.1250*noise( p ); p = m*p*2.01;
    f += 0.0625*noise( p );
    return f;
}
// --- End of: Created by inigo quilez --------------------
float mynoise ( vec3 p)
{
    return noise(p*scale)*(6.0*intensity*(0.6+0.8*syn_Intensity)); // VJW: syn_Intensity (energy) drives the strength
}
float myfbm( vec3 p )
{
    float f;
    f  = 0.5000*mynoise( p ); p = m*p*2.02;
    f += 0.2500*mynoise( p ); p = m*p*2.03;
    f += 0.1250*mynoise( p ); p = m*p*2.01;
    f += 0.0625*mynoise( p ); p = m*p*2.05;
    f += 0.0625/2.*mynoise( p ); p = m*p*2.02;
    f += 0.0625/4.*mynoise( p );
    return f;
}
mat2 rotate2d(float _angle){
    return mat2(cos(_angle),-sin(_angle),
    sin(_angle),cos(_angle));
}

vec4 renderMainImage() {
	vec4 fragColor = vec4(0.0);
	vec2 fragCoord = _xy;

	vec2 uv = fragCoord.xy / RENDERSIZE.xy;
    uv.xy += direction.xy;

    uv = rotate2d(-PI) * uv;

	vec3 v;
	vec3 p = 4.*vec3(uv,0.)+bass_time*0.1*(.1,.7,1.2);
	float x = myfbm(p);
	//v = vec3(x);
	v = (.5+.5*sin(x*vec3(30.,20.,10.)*1.))/1.;
	float g = 1.;
	//g = pow(length(v),1.);
	g =  .5*noise(8.*m*m*m*p)+.5; g = 2.*pow(g,3.);
	v *= g;

    vec2 tiUv = .02*v.xy+position.xy+(fragCoord.xy / RENDERSIZE.xy)*(1.0-zoom)*0.99-0.5*(1.0-zoom)*0.99+0.5; // VJW: one sampler per call
    vec3 Ti = (_isMediaActive() ? texMirror(syn_Media, tiUv) : texMirror(image10, tiUv)).rgb*1.4-.2;
    vec3 T=Ti;
    //T = Ti+(1.-Ti)*Tf;
	vec3 T1,T2;
	T1 = vec3(0.,0.,0.); T1 *= .5*(T+1.);
	T2 = vec3(1.,1.,1.); //T2 = 1.2*Ti*vec3(1.,.8,.6)-.2;
	v = mix(T1,T2,T);
	fragColor = vec4(v,1.0);

	return fragColor;
 }


vec4 renderMain(){
	if(PASSINDEX == 0){
		return renderMainImage();
	}
}
