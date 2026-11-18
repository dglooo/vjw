// Source: donor/visual_system_2/scenes/release/lattix.synScene (main.glsl + scene.json) · unknown
// Author: Anonymous
// License: unknown (the donor's CREDIT names "Anonymous" only; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts. Change: the screen pass returns alpha 1 (the donor's is 0 unless
// inverted; ours composites it). script.js (not run) restated: script_time lunges one
// unit per two beats with an ease-out (1 - exp(-5x)); here a clock on the kick's envelope (its release is that
// ease-out; about a unit per full kick, two kicks a bar in DnB) plus a slow drift, so a break does not freeze the
// lattice. fly_in_out (a traveler slider) = a clock on the new fly_speed slider. down_rot_scr / right_rot_scr (the
// smoothed bang counters, 90 degrees a press) are plain sliders in quarter turns; the smoothing is dropped.
// PASSES: FLOAT added: the donor's default target is HDR (its thumbnail is white where .6 x the ray length is above
// 1), ours is 8-bit unless FLOAT.
// res .5 → .85 (2026-11-19, agents/guides/guide_syn_res_085.md): res only
/*{
  "TITLE": "lattix",
  "CREDIT": "Anonymous",
  "TAGS": ["infinite", "raymarching", "3d", "glitchy", "tunnel", "donor"],
  "PASSES": [{"TARGET": "firstBuffer", "FLOAT": true}],
  "IMAGES": [],
  "VJW_CLOCK": {
    "script_time": [[0.15], [5, "syn_BassHits"]],
    "fly_in_out": [[1, "fly_speed"]]
  },
  "CONTROLS": [
    {"NAME": "fly_speed", "TYPE": "slider", "DEFAULT": 0, "MIN": -1, "MAX": 1},
    {"NAME": "forward_on_beat", "TYPE": "toggle", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "twitch", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "down_rot_scr", "TYPE": "slider", "DEFAULT": 0, "MIN": 0, "MAX": 4},
    {"NAME": "right_rot_scr", "TYPE": "slider", "DEFAULT": 0, "MIN": 0, "MAX": 4},
    {"NAME": "invert", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "aberration", "TYPE": "toggle", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 1.0}
  ]
}*/
float time = TIME;
vec2 mouse = vec2(0.5);
vec2 resolution = RENDERSIZE;

const int ite_max = 50;
const float dist_coeff = 1.00;
const float dist_min = 0.01;
const float dist_max = 1000.0;
const float inf = 999999999.0;


float sphere(vec3 p, float s) {
    return length(p) - s;
}

float box(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

float crossline(vec3 p, float s) {
    float da = box(p.xyz, vec3(inf, s, s));
    float db = box(p.xyz, vec3(s, inf, s));
    float dc = box(p.xyz, vec3(s, s, inf));
    return min(da,min(db,dc));
}

float sub(float a, float b) {
    return max(-a,b);
}


float modcross(vec3 p) {
    return sub(sphere(p, 0.14), crossline( p, 0.02 ) );
}


float repeatCrossline( vec3 p, vec3 c )
{
    vec3 q = mod(p,c)-0.5 * c;
    return modcross( q );
}


float map(vec3 p) {
    float t = dist_max;
    float w = 0.0;
    
    // w = box(p, vec3(0.2));
    w = repeatCrossline(p+vec3(p.x,p.y,0.0)*(0.025+syn_OnBeat*0.03)*twitch*2.0, vec3(0.5+syn_Presence*0.5, 0.5+syn_Presence*0.5, 0.5));
    t = min(t,w);
    return t;
}


vec3 intersect(vec3 pos, vec3 dir){
    float t = 0.0;
    float hit = 0.0;

    for(int i=0; i < ite_max; i++) {
        float ttemp = map(t * dir + pos);
        if(ttemp < dist_min){
        hit = 1.0;
        break;
        } 
        
        t += ttemp * dist_coeff;
    }
    vec3 col = vec3(0.6)*t;
    if (_isMediaActive()){
        col = _loadMedia().rgb*t;
    }
    return col;
}

vec3 rotate_y(vec3 v, float angle)
{
  float ca = cos(angle); float sa = sin(angle);
  return v*mat3(
                +ca, +.0, -sa,
                +.0,+1.0, +.0,
                +sa, +.0, +ca);
}

vec3 rotate_x(vec3 v, float angle)
{
  float ca = cos(angle); float sa = sin(angle);
  return v*mat3(
                +1.0, +.0, +.0,
                +.0, +ca, -sa,
                +.0, +sa, +ca);
}


vec4 renderMain( void ) {
    if (PASSINDEX == 0.0){
        vec2 uv = ( _xy / resolution.xy ) * 2.0 - 1.0;
        
        float aspect = resolution.x / resolution.y;
        vec3 dir = normalize(vec3( uv * vec2(aspect, 1.0), 1.0)+vec3(sin(TIME), cos(TIME), 0.0)*syn_HighHits*0.1*twitch);
        dir = rotate_y(dir, -PI*0.5*right_rot_scr);
        dir = rotate_x(dir, PI*0.5*down_rot_scr);

        vec3 pos = vec3(0,0,script_time*0.5*forward_on_beat+fly_in_out);
            
        vec3 color = intersect(pos, dir);
        
        return vec4(color, 1.0);
    } else if (PASSINDEX == 1.0){
        vec4 prevCol = texture(firstBuffer, _uv);

        vec2 lookupSpot = _uvc*0.03*_rand(_uvc*100.0+TIME)*(0.5+syn_BassLevel)*aberration;

        vec4 redCol = vec4(1.0,0.3,0.0,0.0)*texture(firstBuffer, _uv+lookupSpot*2.0);
        vec4 ylwCol = vec4(0.6,0.8,0.1,0.0)*texture(firstBuffer, _uv+lookupSpot);
        vec4 bluCol = vec4(0.0,0.4,1.0,0.0)*texture(firstBuffer, _uv-lookupSpot);
        vec4 vioCol = vec4(0.0,0.05,1.0,0.0)*texture(firstBuffer, _uv-lookupSpot*2.0);

        vec4 mixedCol = redCol + ylwCol*0.75 + bluCol*0.75 + vioCol;
        mixedCol *= 0.25;
        
        vec4 finalCol = mixedCol;
        if (invert>0.5){
            finalCol = 1.0-finalCol;
        }

        // if (_isMediaActive()){
        //     finalCol *= _loadMedia();
        // }

        return vec4(finalCol.rgb, 1.0); // VJW: opaque (the donor returns alpha 0 unless inverted)
    }

}
