// Source: donor/visual_system_2/scenes/release/circuit_bending.synScene (main.glsl + scene.json) · CC BY-NC-SA 3.0
// Author: mojovideotech ("Equirec_MengerTunnel", after shadertoy lsjcWV); modifications by Meebs
// License: CC BY-NC-SA 3.0 (the notice is kept below; non-commercial)
// VeeJay Wizard, 2026: ported for fx/syn.ts, body unchanged (IMAGES circuits, circuits2 from
// public/syn/circuit_bending/images/). script.js (not run) restated: script_time adds rate * (0.1 + syn_BassLevel +
// syn_BassHits + syn_BassPresence) * dt = the clock below, per second. noise: the donor's reversed range (2 to .2) is
// written .2 to 2. syn_Media is black (no media input yet). ⚡ syn_HighHits (the cyan circuits' light) is flash-gated.
// res .5 → .85 (2026-11-19, agents/guides/guide_syn_res_085.md): res only
/*{
  "TITLE": "Circuit Bending",
  "CREDIT": "mojovideotech",
  "TAGS": ["3d", "raymarching", "media", "tunnel", "donor"],
  "IMAGES": [{"NAME": "circuits", "PATH": "images/circuits.jpg"}, {"NAME": "circuits2", "PATH": "images/circuits2.jpg"}],
  "VJW_FLASH": ["syn_HighHits"],
  "VJW_CLOCK": {
    "script_time": [[0.1, "rate"], ["rate", "syn_BassLevel"], ["rate", "syn_BassHits"], ["rate", "syn_BassPresence"]]
  },
  "CONTROLS": [
    {"NAME": "perspective", "TYPE": "slider smooth", "DEFAULT": 1, "MIN": 0, "MAX": 1},
    {"NAME": "lookXY", "TYPE": "xy smooth", "DEFAULT": [0, 0], "MIN": [-1, -1], "MAX": [1, 1]},
    {"NAME": "noise", "TYPE": "slider smooth", "DEFAULT": 2, "MIN": 0.2, "MAX": 2.0},
    {"NAME": "thin_structure", "TYPE": "toggle smooth", "DEFAULT": 0, "MIN": 0, "MAX": 0.68},
    {"NAME": "fully_open", "TYPE": "toggle smooth", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "rate", "TYPE": "slider", "DEFAULT": -0.35, "MIN": -1.5, "MAX": 1.5},
    {"NAME": "media_scale", "TYPE": "slider smooth", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "media_mult_or_add", "TYPE": "slider smooth", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0}
  ]
}*/


////////////////////////////////////////////////////////////
// Equirec_MengerTunnel  by mojovideotech
//
// based on : shadertoy/lsjcWV
//
// Creative Commons Attribution-NonCommercial-ShareAlike 3.0
////////////////////////////////////////////////////////////

//Modifications by Meebs


#define 	twpi  	6.283185307179586  	// two pi, 2*pi
#define 	pi   	3.141592653589793 	// pi

float mid(vec3 p) { p = min(p, p.yzx); return max( max(p.x, p.y), p.z); }

vec3 tpl( sampler2D t, in vec3 p, in vec3 n ){
   
    n = max(abs(n), 0.001);
    n /= (n.x + n.y + n.z );  
    vec3 tx = (texture(t, p.yz)*n.x + texture(t, p.zx)*n.y + texture(t, p.xy)*n.z).xyz;
    
    return tx*tx;
}

vec3 colGet(float t){
    return _palette(_triWave(t, 1.0), vec3(0.340, 0.380-0.2*syn_BassLevel, -0.180), vec3(0.339, 0.040+0.2*syn_BassLevel, 0.670), vec3(0.555, 0.900, 0.315), vec3(0.500, 0.890, 0.000));
}

vec4 renderMain() { 
 	vec4 out_FragColor = vec4(0.0);

	float T = script_time;
	vec2 v = (_xy.xy / RENDERSIZE.xy) + RENDERSIZE.y;
	v.y -= 0.5;
	float th =  v.y * pi, ph = v.x * twpi;
    vec3 sp = vec3( sin(ph) * cos(th), sin(th), cos(ph) * cos(th) );
    // sp.xy += lookXY;
    sp = mix(sp, normalize(vec3(_uvc, 1.0)), perspective);
    sp.yz = _rotate(sp.yz, lookXY.y*PI);
    sp.xy = _rotate(sp.xy, lookXY.x*PI);
    vec3 camPos = vec3( pi, pi, T);

    vec3 pos = camPos;
    vec3 dir = normalize(sp);
    vec3 signdir = sign(dir);
    float stepsize = 1.0;
    float dist = 0.0;
    vec3 normal;
    for (int i = 0; i < 20; i++) {
        vec3 p = mod(pos, twpi * stepsize) - pi * stepsize;
        p.z = mix(p.z, 0.0, mix(thin_structure, 0.78, fully_open));
        vec3 num = (stepsize - p * signdir) * step( abs(p), vec3(stepsize) ) / dir * signdir;
        float len = mid(num);
        if (len < 0.01) {
            if (stepsize < 0.05) break;
            stepsize /= noise;
            // stepsize += sin(syn_BeatTime)*0.001;
        } else normal = vec3( equal( vec3(len), num) );
        pos += dir*len;
        // pos.xy = _rotate(pos.xy, i*sin(TIME)*0.000);
        dist += len;
    }

    vec3 finalCol = vec3(0.0);
    vec3 lp = camPos;
    vec3  li = normalize( lp - pos ); // Point light.
    float spe = pow(max(dot(reflect(-li, normal), -dir), 0.), 8.); // Object specular.
    float dif = clamp(dot(normal, li), 0.0, 1.0); // Diffuse.
    finalCol = vec3(0.0);

    finalCol += colGet(dot(pos, normal*10.0)*0.01)*( 1.0 / dist);

    //cyan circuits
    finalCol.rgb += tpl(circuits2, pos*0.9, normal)*vec3(0.2,0.8,1.0)*syn_HighHits*sin(pos.z+syn_HighTime);

    finalCol.rgb += tpl(circuits, pos*0.2+vec3(0.0, 0.0, -syn_BPMTwitcher*0.05), normal)*vec3(1.0,0.8,0.0)*pow(_fbm(pos+TIME),3.0);

    if (_isMediaActive()){
        vec3 mediaCol = tpl(syn_Media, pos*media_scale, normal*10.0);
        finalCol.rgb = mix(finalCol.rgb + finalCol.rgb*mediaCol*1.5, finalCol.rgb + mediaCol, media_mult_or_add);
    }
    finalCol = clamp(finalCol, 0.0, 1.0);
    
    finalCol += 0.2*pow(mix(0.0, dist, smoothstep(10.0,200.0,dist)),0.5)*(1.0+syn_Presence);

    return vec4(finalCol,1.0); 
}
