// Source: donor/visual_system_2/scenes/release/molten.synScene (main.glsl + scene.json + images/; script.js restated, see below) · unknown
// Author: Meebs ft. Flexi
// License: unknown (the donor's CREDIT names Meebs ft. Flexi only; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts (IMAGES colornoise from public/syn/molten/images/). Changes for ES
// 3.00: syn_BassLevel*2 -> *2.0, 2*PI -> 2.0*PI, numSteps = 0 -> 0.0. script.js (not run) is a camera; restated:
// - racer on: the script's circle around the planet, on the clock racer_time = 60 x racer_speed per second (the
//   script adds racer_speed per frame);
// - racer off: the script walks the camera over a sphere with the velocity (the bass / mid / high presences - .5)
//   x 10 x (2.5 x syn_BPMSin4 + 5 x zoom_out) and re-normalises it each frame. Here the clocks cam_x / cam_y / cam_z
//   sum that velocity from the script's start point (15, 15, 15) and the body puts the sum back on the sphere.
//   Dropped: the per-frame re-normalising, so ours heads for the same point but answers a turn of the mix slower
//   as the sum grows. The look point is the script's formula (its two tangents, on the syn clocks), + a start
//   phase of 6.15: straight down at the surface (the donor's thumbnail view), not at the horizon.
// The field's start (the donor: TIME < .2) is also a cleared target's (alpha 0: a resize clears our targets), so
// it starts again; a live texel writes alpha 1. The media input is a stub here. ⚡ syn_HighHits is flash-gated: a
// hit deepens the wires (deeper = brighter).
// res .5 → .85 (2026-11-19, agents/guides/guide_syn_res_085.md): res only
/*{
  "TITLE": "Molten",
  "CREDIT": "Meebs ft. Flexi",
  "TAGS": ["realistic", "3d", "dark", "donor"],
  "PASSES": [{"TARGET": "buffA", "WIDTH": 889, "HEIGHT": 500, "FLOAT": true}, {"TARGET": "buffC", "WIDTH": 889, "HEIGHT": 500, "FLOAT": true}, {"TARGET": "buffD", "WIDTH": 889, "HEIGHT": 500, "FLOAT": true}],
  "IMAGES": [{"PATH": "images/colornoise.jpg", "NAME": "colornoise"}],
  "VJW_FLASH": ["syn_HighHits"],
  "VJW_CLOCK": {
    "racer_time": [[60, "racer_speed"]],
    "cam_x": [[25, "syn_BassPresence", "syn_BPMSin4"], [-12.5, "syn_BPMSin4"], [50, "syn_BassPresence", "zoom_out"], [-25, "zoom_out"]],
    "cam_y": [[25, "syn_MidPresence", "syn_BPMSin4"], [-12.5, "syn_BPMSin4"], [50, "syn_MidPresence", "zoom_out"], [-25, "zoom_out"]],
    "cam_z": [[25, "syn_HighPresence", "syn_BPMSin4"], [-12.5, "syn_BPMSin4"], [50, "syn_HighPresence", "zoom_out"], [-25, "zoom_out"]]
  },
  "CONTROLS": [
    {"NAME": "racer", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "zoom_out", "TYPE": "toggle smooth", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "racer_look", "TYPE": "slider smooth", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 6.28},
    {"NAME": "racer_speed", "TYPE": "slider smooth", "DEFAULT": 0.03, "MIN": 0.0, "MAX": 0.05},
    {"NAME": "inside_out", "TYPE": "slider smooth", "DEFAULT": 0.8, "MIN": -0.5, "MAX": 1.0},
    {"NAME": "invert", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "Mirror", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0}
  ]
}*/

vec3 iResolution = vec3(RENDERSIZE.x, RENDERSIZE.y, 0.0);
vec3 iChannelResolution = iResolution;
float iGlobalTime = TIME*1.0;
int iFrame = int(FRAMECOUNT);
float time = TIME;
vec2 resolution = RENDERSIZE;
vec4 iMouse = vec4(0.5);
float planetRad = 20.25;


// ****************** PASS 0 ***********************
#define pi 3.141592653589793238462643383279
#define pi_inv 0.318309886183790671537767526745
#define pi2_inv 0.159154943091895335768883763372

vec2 lower_left(vec2 uv)
{
    return fract(uv * 0.5);
}

vec2 lower_right(vec2 uv)
{
    return fract((uv - vec2(1, 0.)) * 0.5);
}

vec2 upper_left(vec2 uv)
{
    return fract((uv - vec2(0., 1)) * 0.5);
}

vec2 upper_right(vec2 uv)
{
    return fract((uv - 1.) * 0.5);
}

vec4 BlurA(vec2 uv, int level)
{
    if(level <= 0)
    {
        return texture(buffA, fract(uv));
    }

    uv = upper_left(uv);
    for(int depth = 1; depth < 8; depth++)
    {
        if(depth >= level)
        {
            break;
        }
        uv = lower_right(uv);
    }

    return texture(buffD, uv);
}

vec2 complex_mul(vec2 factorA, vec2 factorB){
    return vec2( factorA.x*factorB.x - factorA.y*factorB.y, factorA.x*factorB.y + factorA.y*factorB.x);
}

vec2 complex_div(vec2 numerator, vec2 denominator){
    return vec2( numerator.x*denominator.x + numerator.y*denominator.y,
                numerator.y*denominator.x - numerator.x*denominator.y)/
        vec2(denominator.x*denominator.x + denominator.y*denominator.y);
}

float sigmoid(float x) {
    return 2./(1. + exp2(-x)) - 1.;
}

float conetip(vec2 uv, vec2 pos, float size, float min)
{
    vec2 aspect = vec2(1.,iResolution.y/iResolution.x);
    return max( min, 1. - length((uv - pos) * aspect / size) );
}

float warpFilter(vec2 uv, vec2 pos, float size, float ramp)
{
    return 0.5 + sigmoid( conetip(uv, pos, size, -16.) * ramp) * 0.5;
}

vec2 vortex_warp(vec2 uv, vec2 pos, float size, float ramp, vec2 rot)
{
    vec2 aspect = vec2(1.,iResolution.y/iResolution.x);

    vec2 pos_correct = 0.5 + (pos - 0.5);
    vec2 rot_uv = pos_correct + complex_mul((uv - pos_correct)*aspect, rot)/aspect;
    float f1lter = warpFilter(uv, pos_correct, size, ramp);
    return mix(uv, rot_uv, f1lter);
}

void mainImage0( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord.xy / iResolution.xy;

    vec4 noise = texture(colornoise, _uv*3.0 + fract(vec2(42,56)*iGlobalTime));

    if(TIME<0.2 || texelFetch(buffA, ivec2(fragCoord), 0).a == 0.0) // VJW: + a cleared target (alpha 0; the noise image not loaded yet is alpha 0 too)
    {
        fragColor = noise;
        return;
    }

    vec2 mouseV = vec2(0.5);
    vec2 aspect = vec2(1.,iResolution.y/iResolution.x);
    vec2 pixelSize = 1. / iResolution.xy;
    // vec2 warpPos = vortex_warp(_uv, vec2(0.5), 0.1, 0.1, vec2(0.5));

    vec2 d = pixelSize*3.5;
    vec2 gx;
    gx.x = BlurA(uv-vec2(1.,0.)*d, 3).r - BlurA(uv+vec2(1.,0.)*d, 3).r;
    gx.y = BlurA(uv-vec2(0.,1.)*d, 3).r - BlurA(uv+vec2(0.,1.)*d, 3).r;

    vec2 uvr = uv + gx*7.*pixelSize;

    float r = BlurA(uvr, 0).r;
    r += (BlurA(uvr, 1).r - BlurA(uv, 4).r) * 22.5/256.; // "reaction-diffusion"

    if(TIME>2.0){
        r += 2.25*(1.0+syn_BassLevel*2.0) / 256.;
    }

    fragColor.r = r;

    vec2 gradGreen;
    gradGreen.x = BlurA(uv-vec2(1.,0.)*d, 3).g - BlurA(uv+vec2(1.,0.)*d, 3).g;
    gradGreen.y = BlurA(uv-vec2(0.,1.)*d, 3).g - BlurA(uv+vec2(0.,1.)*d, 3).g;
    fragColor.gb = BlurA(_uv, 0).gb;
    fragColor.gb += (BlurA(_uv+gradGreen, 1).gb - BlurA(_uv, 2).gb) * 200.5/256.; // "reaction-diffusion"
    
    fragColor = clamp(fragColor, 0., 1.);
    fragColor.a = 1.0; // VJW: a live texel (see the start above)

    //fragColor = noise; // reset
}

// *************** PASS 1 *****************
vec4 blur_horizontal(sampler2D channel, vec2 uv, float scale)
{
    float h = scale / iResolution.x;
    vec4 sum = vec4(0.0);

    sum += texture(channel, fract(vec2(uv.x - 4.0*h, uv.y)) ) * 0.05;
    sum += texture(channel, fract(vec2(uv.x - 3.0*h, uv.y)) ) * 0.09;
    sum += texture(channel, fract(vec2(uv.x - 2.0*h, uv.y)) ) * 0.12;
    sum += texture(channel, fract(vec2(uv.x - 1.0*h, uv.y)) ) * 0.15;
    sum += texture(channel, fract(vec2(uv.x + 0.0*h, uv.y)) ) * 0.16;
    sum += texture(channel, fract(vec2(uv.x + 1.0*h, uv.y)) ) * 0.15;
    sum += texture(channel, fract(vec2(uv.x + 2.0*h, uv.y)) ) * 0.12;
    sum += texture(channel, fract(vec2(uv.x + 3.0*h, uv.y)) ) * 0.09;
    sum += texture(channel, fract(vec2(uv.x + 4.0*h, uv.y)) ) * 0.05;

    return sum/0.98; // normalize
}

vec4 blur_horizontal_left_column(vec2 uv, int depth)
{
    float h = pow(2., float(depth)) / iResolution.x;
    vec2 uv1, uv2, uv3, uv4, uv5, uv6, uv7, uv8, uv9;

    uv1 = fract(vec2(uv.x - 4.0 * h, uv.y) * 2.);
    uv2 = fract(vec2(uv.x - 3.0 * h, uv.y) * 2.);
    uv3 = fract(vec2(uv.x - 2.0 * h, uv.y) * 2.);
    uv4 = fract(vec2(uv.x - 1.0 * h, uv.y) * 2.);
    uv5 = fract(vec2(uv.x + 0.0 * h, uv.y) * 2.);
    uv6 = fract(vec2(uv.x + 1.0 * h, uv.y) * 2.);
    uv7 = fract(vec2(uv.x + 2.0 * h, uv.y) * 2.);
    uv8 = fract(vec2(uv.x + 3.0 * h, uv.y) * 2.);
    uv9 = fract(vec2(uv.x + 4.0 * h, uv.y) * 2.);

    if(uv.y > 0.5)
    {
        uv1 = upper_left(uv1);
        uv2 = upper_left(uv2);
        uv3 = upper_left(uv3);
        uv4 = upper_left(uv4);
        uv5 = upper_left(uv5);
        uv6 = upper_left(uv6);
        uv7 = upper_left(uv7);
        uv8 = upper_left(uv8);
        uv9 = upper_left(uv9);
    }
    else{
        uv1 = lower_left(uv1);
        uv2 = lower_left(uv2);
        uv3 = lower_left(uv3);
        uv4 = lower_left(uv4);
        uv5 = lower_left(uv5);
        uv6 = lower_left(uv6);
        uv7 = lower_left(uv7);
        uv8 = lower_left(uv8);
        uv9 = lower_left(uv9);
    }

    for(int level = 0; level < 8; level++)
    {
        if(level >= depth)
        {
            break;
        }

        uv1 = lower_right(uv1);
        uv2 = lower_right(uv2);
        uv3 = lower_right(uv3);
        uv4 = lower_right(uv4);
        uv5 = lower_right(uv5);
        uv6 = lower_right(uv6);
        uv7 = lower_right(uv7);
        uv8 = lower_right(uv8);
        uv9 = lower_right(uv9);
    }

    vec4 sum = vec4(0.0);

    sum += texture(buffD, uv1) * 0.05;
    sum += texture(buffD, uv2) * 0.09;
    sum += texture(buffD, uv3) * 0.12;
    sum += texture(buffD, uv4) * 0.15;
    sum += texture(buffD, uv5) * 0.16;
    sum += texture(buffD, uv6) * 0.15;
    sum += texture(buffD, uv7) * 0.12;
    sum += texture(buffD, uv8) * 0.09;
    sum += texture(buffD, uv9) * 0.05;

    return sum/0.98; // normalize
}

void horizontalBlur( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord.xy / iResolution.xy;

    if(uv.x < 0.5)
    {
        vec2 uv_half = fract(uv*2.);
        if(uv.y > 0.5)
        {
            fragColor = blur_horizontal(buffA, uv_half, 1.);
        }
        else
        {
            fragColor = blur_horizontal(buffA, uv_half, 1.);
        }
    }
    else
    {
        for(int level = 0; level < 8; level++)
        {
            if((uv.x > 0.5 && uv.y > 0.5) || (uv.x <= 0.5))
            {
                break;
            }
            vec2 uv_half = fract(uv*2.);
            fragColor = blur_horizontal_left_column(uv_half, level);
            uv = uv_half;
        }
    }
}


// *************** PASS 2 *****************

vec4 blur_vertical_upper_left(sampler2D channel, vec2 uv)
{
    float v = 1. / iResolution.y;
    vec4 sum = vec4(0.0);
    sum += texture(channel, upper_left(vec2(uv.x, uv.y - 4.0*v)) ) * 0.05;
    sum += texture(channel, upper_left(vec2(uv.x, uv.y - 3.0*v)) ) * 0.09;
    sum += texture(channel, upper_left(vec2(uv.x, uv.y - 2.0*v)) ) * 0.12;
    sum += texture(channel, upper_left(vec2(uv.x, uv.y - 1.0*v)) ) * 0.15;
    sum += texture(channel, upper_left(vec2(uv.x, uv.y + 0.0*v)) ) * 0.16;
    sum += texture(channel, upper_left(vec2(uv.x, uv.y + 1.0*v)) ) * 0.15;
    sum += texture(channel, upper_left(vec2(uv.x, uv.y + 2.0*v)) ) * 0.12;
    sum += texture(channel, upper_left(vec2(uv.x, uv.y + 3.0*v)) ) * 0.09;
    sum += texture(channel, upper_left(vec2(uv.x, uv.y + 4.0*v)) ) * 0.05;
    return sum/0.98; // normalize
}

vec4 blur_vertical_lower_left(sampler2D channel, vec2 uv)
{
    float v = 1. / iResolution.y;
    vec4 sum = vec4(0.0);
    sum += texture(channel, lower_left(vec2(uv.x, uv.y - 4.0*v)) ) * 0.05;
    sum += texture(channel, lower_left(vec2(uv.x, uv.y - 3.0*v)) ) * 0.09;
    sum += texture(channel, lower_left(vec2(uv.x, uv.y - 2.0*v)) ) * 0.12;
    sum += texture(channel, lower_left(vec2(uv.x, uv.y - 1.0*v)) ) * 0.15;
    sum += texture(channel, lower_left(vec2(uv.x, uv.y + 0.0*v)) ) * 0.16;
    sum += texture(channel, lower_left(vec2(uv.x, uv.y + 1.0*v)) ) * 0.15;
    sum += texture(channel, lower_left(vec2(uv.x, uv.y + 2.0*v)) ) * 0.12;
    sum += texture(channel, lower_left(vec2(uv.x, uv.y + 3.0*v)) ) * 0.09;
    sum += texture(channel, lower_left(vec2(uv.x, uv.y + 4.0*v)) ) * 0.05;
    return sum/0.98; // normalize
}

vec4 blur_vertical_left_column(vec2 uv, int depth)
{
    float v = pow(2., float(depth)) / iResolution.y;

    vec2 uv1, uv2, uv3, uv4, uv5, uv6, uv7, uv8, uv9;

    uv1 = fract(vec2(uv.x, uv.y - 4.0*v) * 2.);
    uv2 = fract(vec2(uv.x, uv.y - 3.0*v) * 2.);
    uv3 = fract(vec2(uv.x, uv.y - 2.0*v) * 2.);
    uv4 = fract(vec2(uv.x, uv.y - 1.0*v) * 2.);
    uv5 = fract(vec2(uv.x, uv.y + 0.0*v) * 2.);
    uv6 = fract(vec2(uv.x, uv.y + 1.0*v) * 2.);
    uv7 = fract(vec2(uv.x, uv.y + 2.0*v) * 2.);
    uv8 = fract(vec2(uv.x, uv.y + 3.0*v) * 2.);
    uv9 = fract(vec2(uv.x, uv.y + 4.0*v) * 2.);

    if(uv.y > 0.5)
    {
        uv1 = upper_left(uv1);
        uv2 = upper_left(uv2);
        uv3 = upper_left(uv3);
        uv4 = upper_left(uv4);
        uv5 = upper_left(uv5);
        uv6 = upper_left(uv6);
        uv7 = upper_left(uv7);
        uv8 = upper_left(uv8);
        uv9 = upper_left(uv9);
    }
    else{
        uv1 = lower_left(uv1);
        uv2 = lower_left(uv2);
        uv3 = lower_left(uv3);
        uv4 = lower_left(uv4);
        uv5 = lower_left(uv5);
        uv6 = lower_left(uv6);
        uv7 = lower_left(uv7);
        uv8 = lower_left(uv8);
        uv9 = lower_left(uv9);
    }

    for(int level = 0; level < 8; level++)
    {
        if(level > depth)
        {
            break;
        }

        uv1 = lower_right(uv1);
        uv2 = lower_right(uv2);
        uv3 = lower_right(uv3);
        uv4 = lower_right(uv4);
        uv5 = lower_right(uv5);
        uv6 = lower_right(uv6);
        uv7 = lower_right(uv7);
        uv8 = lower_right(uv8);
        uv9 = lower_right(uv9);
    }

    vec4 sum = vec4(0.0);

    sum += texture(buffC, uv1) * 0.05;
    sum += texture(buffC, uv2) * 0.09;
    sum += texture(buffC, uv3) * 0.12;
    sum += texture(buffC, uv4) * 0.15;
    sum += texture(buffC, uv5) * 0.16;
    sum += texture(buffC, uv6) * 0.15;
    sum += texture(buffC, uv7) * 0.12;
    sum += texture(buffC, uv8) * 0.09;
    sum += texture(buffC, uv9) * 0.05;

    return sum/0.98; // normalize
}

void verticalBlur( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec2 uv_orig = uv;
    vec2 uv_half = fract(uv*2.);
    if(uv.x < 0.5)
    {
        if(uv.y > 0.5)
        {
            fragColor = blur_vertical_upper_left(buffC, uv_half);
        }
        else
        {
            fragColor = blur_vertical_lower_left(buffC, uv_half);
        }
    }
    else
    {
        for(int level = 0; level < 8; level++)
        {
            if((uv.x > 0.5 && uv.y >= 0.5) || (uv.x < 0.5))
            {
                break;
            }
            vec2 uv_half = fract(uv*2.);
            fragColor = blur_vertical_left_column(uv_half, level);
            uv = uv_half;
        }
    }
    uv = uv_orig;
    float eighth = 1./8.;
    if(uv.x > 7.*eighth && uv.x < 8.*eighth && uv.y > 2.*eighth && uv.y < 3.*eighth)
    {
        fragColor = vec4(iMouse.xy / iResolution.xy, iMouse.zw / iResolution.xy);
    }
}

// *************** Main Image Pass *****************

//Distance to any objects
float distToSurface(vec3 pos){

    vec2 planetCoords;
    vec3 normalToSurface = normalize(pos);
    planetCoords.x = 0.5 - atan(normalToSurface.z, normalToSurface.x) / (2.0*PI);
    planetCoords.y = 0.5 - asin(-normalToSurface.y) / PI;


    if ((planetCoords.y < 0.09)||(planetCoords.y > 0.91)){
        // planetCoords.y = mix(planetCoords.y, 0.05-planetCoords*0.5, clamp(0.05-planetCoords.y,0.0,0.05)/0.05);
        // planetCoords.x = (planetCoords.x, planetCoords.x*0.05, clamp(0.05-planetCoords.y,0.0,0.05)/0.05);
        // planetCoords.x = mix(planetCoords.x, planetCoords.x*0.5, clamp(0.05-planetCoords.y,0.0,0.05)/0.05);
        planetCoords.x = planetCoords.x*0.2;
        planetCoords.y = (1.0+normalToSurface.y)*2.0;

    }

    planetCoords *= vec2(5.0); //Vec2(0.63,1.0) is a magic number to make it seamless.

    float mainLumps = texture(buffA, planetCoords).r*0.5;
    vec2 temp = BlurA(fract(planetCoords*4.0), 2).gb;
    float wires = pow(clamp(temp.r,0.0,0.8),3.0)*36.0;
    float pattern = temp.g;

    float sphere = length(pos) - planetRad + inside_out*clamp(mainLumps + inside_out*wires*2.0*(syn_HighHits*1.3+syn_HighPresence*0.5)*pattern,0.0,0.5);

    return sphere;
}

float distanceToObj(vec3 pos){
    return distToSurface(pos);
}

vec2 GradientA(vec2 uv, vec2 d, vec4 selector, int level){
  vec4 dX = 0.5*BlurA(uv + vec2(1.,0.)*d, level) - 0.5*BlurA(uv - vec2(1.,0.)*d, level);
  vec4 dY = 0.5*BlurA(uv + vec2(0.,1.)*d, level) - 0.5*BlurA(uv - vec2(0.,1.)*d, level);
  return vec2( dot(dX, selector), dot(dY, selector) );
}

vec3 col;

// VJW: script.js (not run), its camera restated. racer: the script's circle, on the clock racer_time. Else its
// walk over the sphere: cam_x / cam_y / cam_z sum the script's velocity from its start point, put back on the
// sphere here; the look point is the script's formula.
vec3 camera, camLookAtJS;
void vjwCamera() {
  float rad = 26.0+zoom_out*15.0;
  if (racer > 0.5) {
    float t = racer_time*0.5;
    camera = vec3(sin(t), cos(t), 0.1)/sqrt(1.01)*rad*0.9;
    camLookAtJS = vec3(vec2(sin(t+racer_look), cos(t+racer_look))/sqrt(1.11), 0.1/sqrt(1.01))*rad*0.86;
    return;
  }
  camera = normalize(vec3(15.0)+vec3(cam_x, cam_y, cam_z))*rad;
  vec3 base1 = vec3(1.0, 1.0, (-camera.x-camera.y)/camera.z);
  vec3 base2 = normalize(cross(base1, camera));
  base1 = normalize(base1);
  // + 6.15: our syn clocks start at 0 with the scene (the donor's run from the app's start, so its phase is any):
  // 0 looks at the horizon (half the frame is space) for the first half minute, 6.15 starts straight down
  float lookTime = 6.15+(syn_HighTime*0.2+syn_BassTime*0.1+syn_Time*0.05)*0.25;
  camLookAtJS = (camera+base1*sin(lookTime)+base2*cos(lookTime*0.77777))*0.96*(1.0-zoom_out*0.1);
}

vec3 rayMarch() {
  vec2 vPos = _uvc;
  vec2 ndcPos = _uv;
  if (Mirror > 0.5){
    if (vPos.x > 0.0){
        vPos.x = -vPos.x;
    }
    if (ndcPos.x < 0.5){
        ndcPos.x = 1.0-ndcPos.x;
    }
  }

  vjwCamera();
  vec3 camOrigin = camera;
  vec3 camLookAt = camLookAtJS;

  if(camera.z < 0.0){
      camOrigin = -camOrigin;
      camLookAt = -camLookAt;
  }

  vec3 camUpVector = vec3(0.0,1.0,0.0);

  if (racer>0.5){
    camUpVector = normalize(camOrigin);
  }

  vec3 vpn = normalize(camLookAt-camOrigin);
  vec3 u = normalize(cross(camUpVector,vpn));
  vec3 v = cross(vpn,u);
  vec3 vcv = (camOrigin+vpn);
  vec3 scrCoord = vcv+vPos.x*u*0.8+vPos.y*v*0.8;
  vec3 scp = normalize(scrCoord-camOrigin);
  
  //Raymarching
  float e = 0.05;
  const float maxd = 30.0; //Max Depth
  float dist = 0.5;
  vec3 c, rayPos, N;
  
  float depth=1.0;
  float numSteps = 0.0;
  for(int i=0; i<20; i++){
    if ((abs(dist) < 0.01)|| (depth > maxd)) {
      break;
    }
    
    depth += dist;
    rayPos = camOrigin+scp*depth;
    dist = distanceToObj(rayPos);
    numSteps++;
  }

  if (depth < maxd){
    
    vec4 c1 = vec4(0.7, 0.3, 0.5, 0.0);
    vec4 c2 = vec4(0.2, 0.0, 0.0, 0.2);
    vec4 c3 = vec4(1.0, 0.3, 0.1, 0.60);
    vec4 c4 = vec4(0.9, 0.6, 0.25, 0.85);
    vec4 c5 = vec4(0.6, 0.3, 1.2, 1.0);

    float colorPicker = 1.0-clamp((length(rayPos)-planetRad+0.75)*1.0, 0.0, 1.0);

    col = vec3(0.0);
    if (colorPicker < c2.w){
        col = mix(c1.rgb, c2.rgb, colorPicker/c2.w);
    } else if (colorPicker < c3.w){
        col = mix(c2.rgb, c3.rgb, (colorPicker-c2.w)/(c3.w-c2.w));
    } else if (colorPicker < c3.w){
        col = mix(c3.rgb, c4.rgb, (colorPicker-c3.w)/(c4.w-c3.w));
    } else if (colorPicker < c4.w){
        col = mix(c4.rgb, c5.rgb, (colorPicker-c4.w)/(c5.w-c4.w));
    }

  }
  else {
    col = vec3(0.0,0.0,0.0);
  }

  // col -= vec3(1.0,1.0,1.0)*(-rayPos.z*0.00001);
  vec4 noise = vec4(_rand(_uv+TIME))*0.5;
  col -= vec3(1.0)*depth*(0.045-(zoom_out)*0.025);
  col += noise.xyz*0.3;
  if(invert > 0.5){
    col = pow(col, 1.0-vec3(-0.5001));
  }

  // col = mix(col, col*vec3(1.0,0.8,0.0)/step(10.0,numSteps)*(numSteps-10.0)/20.0 , 0.5);

  return col;
}

void mainImage4( out vec4 fragColor, in vec2 fragCoord )
{
    vec3 rayMarchCol = rayMarch();
    if (_isMediaActive()){
        rayMarchCol = _loadMedia().rgb*rayMarchCol;
    }
    fragColor = vec4(rayMarchCol, 1.0);
}


vec4 renderMain(void)
{
  if (PASSINDEX == 0.0){
    //buffA
    vec4 fragColor;
    mainImage0(fragColor, gl_FragCoord.xy);
    return fragColor;
  }
  else if (PASSINDEX == 1.0){
    //buffC
    vec4 fragColor;
    horizontalBlur(fragColor, gl_FragCoord.xy);
    return fragColor;
  }
  else if (PASSINDEX == 2.0){
    //Image
    vec4 fragColor;
    verticalBlur(fragColor, gl_FragCoord.xy);
    return fragColor;
  }
  else if (PASSINDEX == 3.0){
    //Image
    vec4 fragColor;
    mainImage4(fragColor, gl_FragCoord.xy);
    // fragColor = texture(buffA, _uv);
    return fragColor;
  }
}
