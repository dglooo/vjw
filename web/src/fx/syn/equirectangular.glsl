// Source: donor/visual_system_2/scenes/release/equirectangular.synScene (main.glsl + scene.json + images/1.jpg) · unknown
// Author: Shady Headstash (the donor's CREDIT)
// License: unknown (no licence in the file; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts, body unchanged (the scene has no script.js). NEEDS A MEDIA INPUT: it
// projects syn_Media (black: no media yet) on a sphere; while _isMediaActive() is false it tiles its own image1
// (public/syn/equirectangular/images/1.jpg) instead. velocity (an xy traveler) keeps its PARAMS (the adapter's
// clock: 60 x PARAMS x the pad per second).
/*{
  "TITLE": "Equirectangular",
  "CREDIT": "Shady Headstash",
  "TAGS": ["media", "utility", "uv", "2d", "donor"],
  "WIDTH": 1920,
  "HEIGHT": 1080,
  "IMAGES": [{"NAME": "image1", "PATH": "images/1.jpg"}],
  "CONTROLS": [
    {"NAME": "perspective", "TYPE": "slider smooth", "DEFAULT": 1, "MIN": 0, "MAX": 1},
    {"NAME": "look_xy", "TYPE": "xy smooth", "DEFAULT": [1.0, 1.0], "MIN": [0, 0], "MAX": [2, 2]},
    {"NAME": "zoom", "TYPE": "slider smooth", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "position", "TYPE": "xy smooth", "DEFAULT": [0, 0], "MIN": [-1.0, -1.0], "MAX": [1.0, 1.0]},
    {"NAME": "velocity", "TYPE": "xy traveler", "DEFAULT": [0, 0], "MIN": [-0.5, -0.5], "MAX": [0.5, 0.5], "PARAMS": 0.0025},
    {"NAME": "mirror", "TYPE": "toggle", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 1.0}
  ]
}*/
#define 	TWPI  	6.283185307179586  	// two pi, 2*pi

vec4 texMirror(sampler2D samplerIn, vec2 uvIn){
    if (mod(uvIn.x, 2.0) > 1.0){
        uvIn.x = 1.0-uvIn.x;
    }
    if (mod(uvIn.y, 2.0) > 1.0){
        uvIn.y = 1.0-uvIn.y;
    }
    return _textureMedia(mod(uvIn, 1.0));
}

vec4 renderMainImage() {
	vec4 fragColor = vec4(0.0);
	vec2 fragCoord = _xy;
    vec2 v = (_uv.xy + RENDERSIZE.y) - 0.5;

    float th = v.y * PI,
        ph = v.x * TWPI;
    vec3 sp = vec3( sin(ph) * cos(th), sin(th), cos(ph) * cos(th) );
    vec3 pos = vec3( PI, 0, 0);

    pos *= ((mix(0.25+(1.0-zoom)*4., 0.25+(1.0-zoom)*2., perspective)) * 0.1);
    //pos += (zoom * 0.18 * perspective);
    sp = mix(sp, normalize(vec3(_uvc, 1.0)), 1.0-perspective);

    sp.yz = _rotate(sp.yz, look_xy.y*PI);
    sp.xy = _rotate(sp.xy, look_xy.x*PI);

    vec2 nUv = vec2(dot(pos, sp.zxy), dot(pos.yzx, sp.zxy));
    nUv -= 0.5;
    nUv.x += velocity.x;
    nUv.y += velocity.y;
    nUv += (position);
    nUv.y += mix(0.0, 1.0, mirror);

    if (_isMediaActive()) {
        fragColor = mirror > 0.0 ? texMirror(syn_Media, nUv) : _textureMedia(mod(nUv, 1.0));
    } else {
        fragColor = texture(image1, mod(nUv * 6.0, 1.0));
    }

    return fragColor;
}
vec4 renderMain(){
	if(PASSINDEX == 0){
		return renderMainImage();
	}
}
