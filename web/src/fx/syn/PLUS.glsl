// Source: donor/visual_system_2/scenes/release/PLUS.synScene (main.glsl + scene.json) · unknown
// Author: Meebs
// License: unknown (the donor's CREDIT names Meebs only; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts. Changes for GLSL ES 3.00: int literals in float maths (30+resoMod,
// i*2.0, -1+mod(x,2), PI/4); pow(x, 1.0) of a negative x (undefined in GLSL) is x. `type` and `resoMod` (the donor's
// HARD_TRANSITIONS uniforms, re-rolled at a scene change) are controls here. script.js only sets script_time, which
// main.glsl never reads: no clock.
// ⚡ syn_HighHits is flash-gated: a hit fattens every cross (more white).
/*{
  "TITLE": "PLUS",
  "CREDIT": "Meebs",
  "TAGS": ["2d", "grayscale", "media", "donor"],
  "VJW_FLASH": ["syn_HighHits"],
  "CONTROLS": [
    {"NAME": "x_mod", "TYPE": "slider", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 3.0},
    {"NAME": "y_mod", "TYPE": "slider", "DEFAULT": 1.0, "MIN": 0.0, "MAX": 3.0},
    {"NAME": "pop", "TYPE": "bang smooth", "DEFAULT": 0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "type", "TYPE": "slider", "DEFAULT": 0, "MIN": 0, "MAX": 2},
    {"NAME": "resoMod", "TYPE": "slider", "DEFAULT": 0, "MIN": 0, "MAX": 30}
  ]
}*/
#line 0

float reso = 30.0+resoMod;


vec3 quadTree()
{
    vec2 pos = _xy;
    float H = RENDERSIZE.y;
    pos /= H;
    pos.x -= 0.5*RENDERSIZE.x/RENDERSIZE.y;
    pos *= reso*0.05;
    pos = abs(pos);

    vec4 retCol = vec4(0.0);
    float r = 0.1; 
    float t = TIME;
    vec2 objPos = (0.5+0.5*vec2(cos(t),sin(t)));
    vec2 fU;

    pos *= 0.5;
    objPos *= 0.5;                         // unzoom for the whole domain falls within [0,1]^n
    
    float cellWarmth = 0.0;
    
    for (int i=0; i<7; i++) {             // to the infinity, and beyond ! :-)
        fU = min(pos,1.-pos); 
        if (min(fU.x,fU.y) < 20.*r/H) { //cell border thickness
            retCol--; 
            break; // cell border
        } 
        if (length(objPos-.5) - r > .7){
            break; // cell is out of the shape
        }

        // --- iterate to child cell
        fU = step(.5,pos);                 // select child
        pos    = (2.0)*pos - fU;              // go to new local frame
        objPos = (2.0)*objPos - fU;  
        r *= (2.0);
        
        cellWarmth += .1;                         // getting closer, getting hotter
        pos -= abs((-1.0+float(i)*2.0)*pos*0.1);
    }
               
    float objDraw = smoothstep(.3,1.,length(objPos-pos)/r); // draw object
    return vec3(cellWarmth,0.0, 1.0-objDraw);
}


vec4 firstPass(){
    // vec2 crossPos = abs(_uvc*20)+1/20.0;
    vec2 crossPos = abs(_uvc*reso);
    crossPos = abs(-1.0+mod(crossPos,2.0));
    if (type>0.5){
        crossPos *= vec2(1.0 - length(_uvc));
    } else if (type>1.5){
        crossPos *= vec2(1.0 - fract(length(_uvc)*10.0));
    } else {
        //normal
    }

    crossPos *= vec2(x_mod,y_mod);

    vec2 uvc = _uvc;
    uvc.x = abs(uvc.x);
    // if (_uv.x > 0.5){
    //     uvc.x = 0.5-(-uvc.x+0.5);
    // }

    vec2 rotPos = _rotate(crossPos, PI/4.0);
    float sizeMod = mix((-0.5+_fbm(vec3(_pixelate(uvc,reso),syn_Time*0.15))),1.0+length(_uvc),pop);
    float growMod = (-0.5+_fbm(vec3(_pixelate(uvc,reso),syn_Time)));

    float crossGrow = syn_HighHits*0.5+growMod;
    float crossPattern = step(crossPos.x,0.3+crossGrow)*step(crossPos.y,0.3+crossGrow);

    crossPattern = ((crossPos.y > (1.2+sizeMod*20.0)/reso)&&(crossPos.x > (1.2+sizeMod*20.0)/reso)) ? 0.0 : crossPattern;

    vec3 crosses = vec3(crossPattern);

    if (_isMediaActive()){
        crosses *= _loadMedia().rgb;
    }

    return vec4(crosses, 0.0);
}

vec4 renderMain()
{
    return firstPass();
}
