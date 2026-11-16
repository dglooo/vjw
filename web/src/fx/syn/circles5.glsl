// Source: donor/visual_system_2/scenes/release/circles5.synScene (main.glsl + scene.json; script.js restated as VJW_CLOCK) · unknown
// Author: Keijiro Takahashi
// License: unknown (the donor's CREDIT names Keijiro Takahashi only; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts. The script's two timers are clocks (per second, the script's own dt):
// script_time += speed_ · reverse; bassTime_scr += (.5 + .5 · syn_BassPresence) · (.05 + 3 · syn_BassLevel).
// Changes: the kick punches the donor's `pop` zoom (pop + 0.12 · syn_BassHits: `pop` is the donor's bang button, no
// audio drove it); the screen pass is opaque (the donor's alpha is its grey level).
/*{
  "TITLE": "Circles5",
  "CREDIT": "Keijiro Takahashi",
  "TAGS": ["2d", "grayscale", "feedback", "media", "dark", "donor"],
  "PASSES": [{"TARGET": "firstBuffer"}],
  "VJW_CLOCK": {
    "script_time": [["speed_", "reverse"]],
    "bassTime_scr": [[0.025], [1.5, "syn_BassLevel"], [0.025, "syn_BassPresence"], [1.5, "syn_BassPresence", "syn_BassLevel"]]
  },
  "CONTROLS": [
    {"NAME": "rain", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "pop", "TYPE": "bang smooth", "DEFAULT": 0, "MIN": 0.0, "MAX": 0.2},
    {"NAME": "feedback_on", "TYPE": "toggle smooth", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 0.9},
    {"NAME": "feedback_warp", "TYPE": "slider smooth", "DEFAULT": 0.05, "MIN": 0.0, "MAX": 0.1},
    {"NAME": "speed_", "TYPE": "slider", "DEFAULT": 0.8, "MIN": 0.0, "MAX": 1.5},
    {"NAME": "reverse", "TYPE": "toggle", "DEFAULT": 1.0, "MIN": -1.0, "MAX": 1.0}
  ]
}*/
float circles(vec2 coord)
{
    float reso = 5.0;
    float width = RENDERSIZE.x / reso;

    vec2 center = floor(coord / width + 0.5) * width;
    float dist = distance(coord, center);

    float time = TIME * 0.9;
    float phase = dot(center, vec2(1.647346, 7.323874));
    float radius = width* (0.3 + sin(bassTime_scr*1.3 + phase) * 0.16);

    return dist - radius;
}

float line(vec2 coord, float seed)
{
    vec2 dir = vec2(-1.0, 1.0);
    float bound = dot(RENDERSIZE.xy, abs(dir));

    float speed = fract(seed * 4785.9433) * 0.3 + 0.3;
    float time = fract(script_time * speed )*1.1;

    float phase = TIME * (fract(seed * 438.454) * 3.3 + 3.3);
    float width = bound * 0.02 * (sin(phase) + 1.0);

    float dist = dot(coord, dir) + (time - 0.5) * bound;
    return abs(dist) - width;
}

vec4 renderMain0()
{
    if (PASSINDEX == 0.0){
        vec2 p = _xy.xy;
        p = mix(p, p-_uvc*RENDERSIZE.y*2.0, pop + 0.12*syn_BassHits);
        
        float c = 1e+6;
        for (int i = 0; i < 4; i++)
            c = min(c, line(p, 94.3 * float(i)));

        float circ = circles(p);
        float glow = 1000.0;
        for (int i = 0; i <4; i++){
            glow = min(glow, line(p*1.0, 100.0*(1.0-_uvc.x*rain) * float(i)));
        }

        c = max(c, circles(p));
        c = clamp(1.0 - abs(1.0 - c), 0.0, 1.0);
        
        vec4 finalCol = vec4(c);

        finalCol += clamp(1.0-circ,0.0,1.0)*clamp(1.0-glow,0.0,1.0);

        if (_isMediaActive()){
            finalCol = _loadMedia()*(1.0-clamp(circ, 0.0, 1.0)) + finalCol;
        }

        finalCol = mix(finalCol, texture(firstBuffer, _uv+normalize(_uvc)*pow(feedback_warp,2.0)), feedback_on);

        return finalCol;
    } else if (PASSINDEX == 1.0){
        return texture(firstBuffer, _uv);
    }
}
// VeeJay Wizard: the screen pass is opaque (ours composites straight alpha; the donor ignores its output alpha).
vec4 renderMain() { vec4 c = renderMain0(); if (PASSINDEX == 1) c.a = 1.0; return c; }
