// Source: donor/visual_system_2/scenes/release/SkaiWalkerOG.synScene (main.glsl + scene.json) · unknown
// Author: Psybernautics ("Ferro Fluid Speaker Box", 2025)
// License: unknown (no notice in the file; the inlined hg_sdf and lygia functions keep their own licence lines; ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts. Changes: the two #include lines are inlined by hand (fx/syn.ts has
// no #include); FAR 70 -> 70.0, float i = 0 -> 0.0 (ES 3.00); _Media_Contrast (a media meta-control our preamble does
// not declare) is 1 (see the VJW block). script.js (not run) restated per second: script_time = dynamic_time add 5 * time_rate * (2 +
// syn_Presence), spin_time 3.5 * time_rate * syn_Presence, bass_count 0.0075 * 0.5 * 15 * time_rate * syn_Hits per
// frame (x 60); its bass_time and portal_time are not read by the body. syn_UserImage and the media are black (no
// media input yet). ⚡ syn_Hits (x2 on the walls' colour) and syn_HighHits (auto_overlay) are flash-gated.
// res .5 → .85 (2026-11-19, agents/guides/guide_syn_res_085.md): res only
/*{
  "TITLE": "Skaiwalker OG",
  "CREDIT": "Psybernautics",
  "WIDTH": 1920,
  "HEIGHT": 1080,
  "PASSES": [{"FILTER": "linear", "FLOAT": true, "HEIGHT": 1080, "TARGET": "glyphPass", "WIDTH": 1920, "WRAP": "repeat"}, {"FILTER": "linear", "FLOAT": true, "HEIGHT": 1080, "TARGET": "mainPass", "WIDTH": 1920, "WRAP": "repeat"}],
  "TAGS": ["donor"],
  "VJW_FLASH": ["syn_Hits", "syn_HighHits"],
  "VJW_CLOCK": {
    "script_time": [[10, "time_rate"], [5, "time_rate", "syn_Presence"]],
    "dynamic_time": [[10, "time_rate"], [5, "time_rate", "syn_Presence"]],
    "spin_time": [[3.5, "time_rate", "syn_Presence"]],
    "bass_count": [[3.375, "syn_Hits", "time_rate"]]
  },
  "CONTROLS": [
    {"NAME": "auto_overlay", "TYPE": "toggle smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "overlay_glyphs", "TYPE": "slider smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "color_seed", "TYPE": "color", "DEFAULT": [0.57, 0.85, 0.95], "MIN": [0, 0, 0], "MAX": [1, 1, 1]},
    {"NAME": "show_media", "TYPE": "slider smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "time_rate", "TYPE": "slider", "DEFAULT": 0.5, "MIN": 0.2, "MAX": 1},
    {"NAME": "single_room", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "auto_flip", "TYPE": "toggle smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "flip", "TYPE": "slider smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "bubble_cam", "TYPE": "slider smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "auto_bubble", "TYPE": "toggle smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "square_bubble", "TYPE": "toggle smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "perspective", "TYPE": "slider smooth", "DEFAULT": 0, "MIN": 0, "MAX": 0.95},
    {"NAME": "auto_morph", "TYPE": "toggle smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1}
  ]
}*/
//Ferro Fluid Speaker Box - Psybernautics 2025
//Ferro Fluid Speaker Box - Psybernautics 2025

// VJW: the donor's two #include lines (the app's lib/), inlined: only what this scene calls.
// hg_sdf (MERCURY, https://mercury.sexy/hg_sdf, MIT OR CC-BY-NC-4.0): vmax, fBox
float vmax(vec3 v) {
	return max(max(v.x, v.y), v.z);
}
float fBox(vec3 p, vec3 b) {
	vec3 d = abs(p) - b;
	return length(max(d, vec3(0))) + vmax(min(d, vec3(0)));
}
// lygia/draw/digits.glsl (Patricio Gonzalez Vivo, https://github.com/patriciogonzalezvivo/lygia, the Prosperity
// Public License 3.0.0: non-commercial): digits(st, value, nDecDigit), DIGITS_SIZE its default
#define DIGITS_SIZE vec2(.025)
float digits(in vec2 st, in float value, in float nDecDigit) {
    st /= DIGITS_SIZE;

    float absValue = abs(value);
    float biggestDigitIndex = max(floor(log2(absValue) / log2(10.)), 0.);

    float counter = floor(value);
    float nIntDigits = 0.;
    for (int i = 0; i < 9; i++) {
        counter = floor(counter*.1);
        nIntDigits++;
        if (counter == 0.)
            break;
    }
    float digit = 12.;
    float digitIndex = (nIntDigits-1.) - floor(st.x);
    if (digitIndex > (-nDecDigit - 1.5)) {
        if (digitIndex > biggestDigitIndex) {
            if (value < 0.) {
                if (digitIndex < (biggestDigitIndex+1.5)) {
                    digit = 11.;
                }
            }
        } 
        else {
            if (digitIndex == -1.) {
                if (nDecDigit > 0.) {
                    digit = 10.;
                }
            } 
            else {
                if (digitIndex < 0.) {
                    digitIndex += 1.;
                }
                float digitValue = (absValue / (pow(10., digitIndex)));
                digit = mod(floor(0.0001+digitValue), 10.);
            }
        }
    }
    vec2 pos = vec2(fract(st.x), st.y);

    if (pos.x < 0.) return 0.;
    if (pos.y < 0.) return 0.;
    if (pos.x >= 1.) return 0.;
    if (pos.y >= 1.) return 0.;

    // make a 4x5 array of bits
    float bin = 0.;
    if (digit < 0.5) // 0
        bin = 7. + 5. * 16. + 5. * 256. + 5. * 4096. + 7. * 65536.; 
    else if (digit < 1.5) // 1
        bin = 2. + 2. * 16. + 2. * 256. + 2. * 4096. + 2. * 65536.;
    else if (digit < 2.5) // 2
        bin = 7. + 1. * 16. + 7. * 256. + 4. * 4096. + 7. * 65536.;
    else if (digit < 3.5) // 3
        bin = 7. + 4. * 16. + 7. * 256. + 4. * 4096. + 7. * 65536.;
    else if (digit < 4.5) // 4
        bin = 4. + 7. * 16. + 5. * 256. + 1. * 4096. + 1. * 65536.;
    else if (digit < 5.5) // 5
        bin = 7. + 4. * 16. + 7. * 256. + 1. * 4096. + 7. * 65536.;
    else if (digit < 6.5) // 6
        bin = 7. + 5. * 16. + 7. * 256. + 1. * 4096. + 7. * 65536.;
    else if (digit < 7.5) // 7
        bin = 4. + 4. * 16. + 4. * 256. + 4. * 4096. + 7. * 65536.;
    else if (digit < 8.5) // 8
        bin = 7. + 5. * 16. + 7. * 256. + 5. * 4096. + 7. * 65536.;
    else if (digit < 9.5) // 9
        bin = 7. + 4. * 16. + 7. * 256. + 5. * 4096. + 7. * 65536.;
    else if (digit < 10.5) // '.'
        bin = 2. + 0. * 16. + 0. * 256. + 0. * 4096. + 0. * 65536.;
    else if (digit < 11.5) // '-'
        bin = 0. + 0. * 16. + 7. * 256. + 0. * 4096. + 0. * 65536.;

    vec2 pixel = floor(pos * vec2(4., 5.));
    return mod(floor(bin / pow(2., (pixel.x + (pixel.y * 4.)))), 2.);
}
// VJW: _Media_Contrast is one of the app's media meta-controls (our preamble declares none of them): 1 = no change.
#define _Media_Contrast 1.0
#define FAR 70.0

float smin( float a, float b, float k )
{
    float h = max(k-abs(a-b),0.0);
    return min(a, b) - h*h*0.25/k;
}


vec3 re(vec3 p, float d) {
    return mod(p - d * .5, d) - d * .5;
}

float sdfOpenBox(vec3 p, vec3 boxSize) {
    vec3 qq = p;
    float box = fBox(qq, boxSize);
    box = abs(box) - boxSize.z*0.1;
    p.z += boxSize.z*1.125;
    float cutout = boxSize.x*mix(0.25, 1.1, mix(0.5, 0.0, single_room));
    float sphere = length(p) - cutout;
    p.z -= boxSize.z*2.5;
    float sphere2 = length(p) - cutout;
    sphere = min(sphere, sphere2);
    box = -smin(-box, sphere, 0.1);
    return box;
}

float g1 = 0.0;
vec2 map(in vec3 p) {
    vec3 pp = p;
    vec3 qq = p;
    vec2 shape = vec2(1.0);
    qq.z = re(qq, 28.0).z;
    vec3 dd = qq;
    dd.z += 1.0;
    float display = sdfOpenBox(qq, vec3(8.0, 8.0, 10.0));
    float oracle = length(dd) - 0.1;
    g1 += 0.01/(0.01+display*display);
    shape.x = display;
    return shape;
}

vec2 march( in vec3 ro, in vec3 rd)
{
    vec2 res = vec2(-1.0,-1.0);
    float t = 0.0;
    for( int i=0; i<40 && t<FAR; i++){
        vec2 h = map( ro+rd*t);
        if( abs(h.x)<(0.0005*t)){
            res = vec2(t,h.y);
            break;
        }
        t += h.x*0.75;
    }
    return res;
}

vec2 marchRef(vec3 ro, vec3 rd){
    vec2 t = vec2(0.0);
    vec2 d = vec2(0.0);
    for (int i = 0; i < 16; i++){
        d = map(ro + rd*t.x);
        if(abs(d.x)<.002 || t.x>(FAR*1.5)) break;
        t += d;
    }
    return t;
}


vec3 calcNormal( in vec3 pos )
{
    vec2 e = vec2(0.0005,0.0);
    return normalize( vec3(
        map( pos + e.xyy ).x - map( pos - e.xyy).x,
        map( pos + e.yxy).x - map( pos - e.yxy ).x,
        map( pos + e.yyx).x - map( pos - e.yyx ).x ) );
}


vec3 diffLoop(vec3 ta, vec3 tb) {
    ta = abs(ta*4.0 - tb);
    for(float i = 0.0; i < 3.0; i++) {
        ta = abs(ta - tb);
    }
    return ta;
}

// Tri-Planar blending function. Based on an old Nvidia writeup:

// GPU Gems 3 - Ryan Geiss: https://developer.nvidia.com/gpugems/GPUGems3/gpugems3_ch01.html

vec3 tex3D(sampler2D t, in vec3 p, in vec3 n ){
    n = max(abs(n) - .2, 0.001);
    n /= dot(n, vec3(1));
    vec3 mirP = p;
    vec3 modP = mod(p, vec3(2.0));
    if (modP.x > 1.0){ mirP.x = 1.0-p.x; }
    if (modP.y > 1.0){ mirP.y = 1.0-p.y; }
    if (modP.z > 1.0){ mirP.z = 1.0-p.z; }
    vec3 tx = _contrast(_invertImage(vec4(texture(t, mirP.yz).xyz, 0.0)), _Media_Contrast).rgb;
    vec3 ty = _contrast(_invertImage(vec4(texture(t, mirP.zx).xyz, 0.0)), _Media_Contrast).rgb;
    vec3 tz = _contrast(_invertImage(vec4(texture(t, mirP.xy).xyz, 0.0)), _Media_Contrast).rgb;
    return (tx*tx*n.x + ty*ty*n.y + tz*tz*n.z);
}


vec3 getObjectColor(vec3 p, vec3 n, float material){
    vec3 color = length(color_seed) < 0.3 ? (color_seed*3.0 + 0.4) : color_seed;
    vec3 paletteColor = _palette(_noise(p*0.1+vec3(0.0,0.0, TIME*0.1)), color, color, color, color);
    color = material == 1.0 ? paletteColor : paletteColor;
    return color*mix(1.0, 2.0, syn_Hits);
}


vec3 doColor(in vec3 sp, in vec3 rd, in vec3 sn, in vec3 lp, vec2 t){
    vec3 ld = lp-sp;
    float lDist = max(length(ld), .001);
    ld /= lDist;
    float diff = max(dot(sn, ld), 0.);
    float spec = pow(max( dot( reflect(-ld, sn), -rd ), 0.0), 64.0);
    vec3 objCol = getObjectColor(sp, sn, t.y);
    float mat_len = length(objCol)/3.0;
    float atten = 1.0 / (1. + lDist*.2 + lDist*lDist*.1);
    vec3 sceneCol = (objCol*(diff*5.0) + objCol*spec*10.0) * atten;
    return sceneCol;
}

float sdBox2D( in vec2 p, in vec2 b )
{
    vec2 d = abs(p)-b;
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
}


vec3 render()
{
    vec2 uv = _uvc;
    float time = dynamic_time*0.0625;
    vec3 ro = vec3(0.0,0.0, (single_room > 0.5 ? 0.0 : -10. + dynamic_time));
    vec3 rd = mix(normalize(vec3(_uvc, 0.25)), normalize(vec3(_uvc, mix(mix(1.0, _mix3(0.5, 1.0, 0.25, abs(sin(mix(clamp(length((_uvc)*2.0), -0.5, 0.5), sdBox2D(_uvc, vec2(1.25)), square_bubble)-dynamic_time*0.05))), clamp(syn_Presence*3.0, 0.0, 1.0)), 0.25+length(_uvc*0.5)*0.75, mix(1.0/length(_uvc), length(_uvc), pow(syn_BassPresence, 2.0))))), mix(bubble_cam, syn_BassPresence, auto_bubble));
    rd.xz = _rotate(rd.xz, sin(spin_time*0.125)*0.25*PI);
    rd.yz = _rotate(rd.yz, cos(spin_time*0.25)*0.25*PI);
    rd.xy = _rotate(rd.xy, fract(dynamic_time*0.005)*2.0*PI);
    float T = script_time;
    vec2 v = (_xy.xy / RENDERSIZE.xy) + RENDERSIZE.y;
    v.y += 0.5;
    float pi = PI;
    float twpi = 3.0*PI;
    float th =  v.y * pi, ph = v.x * twpi;
    vec3 ssp = vec3( sin(ph) * cos(th), sin(th), cos(ph) * cos(th) );
    ssp.xy = _rotate(ssp.xy, -script_time*0.05);
    ssp.yz = _rotate(ssp.yz, dynamic_time*0.025);
    ssp.xz = _rotate(ssp.xz, dynamic_time*0.05);
    rd = mix(rd, normalize(ssp), mix(perspective, syn_MidHighPresence*syn_Presence, auto_morph));
    vec3 lp = ro + vec3(0.0, 0.0, 7.5);
    vec2 t = march(ro, rd);
    vec2 tSave = t;
    vec3 sceneColor = vec3(0.0);
    vec3 pretext = sceneColor;
    vec3 pureCol = sceneColor;
    if (tSave.x < FAR && t.x >= 0.0) {
        vec3 sp = ro + rd*t.x;
        ro += rd*t.x;
        vec3 saveRO = ro;
        vec3 sn = calcNormal(ro);
        sceneColor = doColor(ro, rd, sn, lp, tSave);
        lp.z += 28.5;
        sceneColor += doColor(ro, rd, sn, lp, tSave);
        rd = reflect(rd, sn);
        t = marchRef(ro +  rd*.1, rd);
        ro += rd*t.x;
        sn = calcNormal(ro);
        vec3 scale_mix = ro*0.125;
        vec3 med = tex3D(syn_UserImage, scale_mix, sn)*1.5;
        pureCol = mix(sceneColor, _loadMedia().rgb*1.5, show_media);
        pretext = pureCol * texture(glyphPass, _uv*2.0).xyz;
        vec3 glyph_text = tex3D(glyphPass, scale_mix, sn);
        sceneColor *= mix(vec3(1.0), glyph_text, 1.0);
        sceneColor = mix(sceneColor, length(sceneColor) <=  0.15 ? med : sceneColor, show_media);
        float glowCol = pow(g1, 0.01325);
        sceneColor *= glowCol;
    }
    float fogF = smoothstep(0., .99, tSave.x/(FAR));
    sceneColor = mix(sceneColor, vec3(0.0), fogF);
    sceneColor = mix(sceneColor, mix( pureCol, abs(sceneColor - pretext), 1.0), mix(overlay_glyphs, mix(syn_MidHighLevel, syn_HighHits, syn_HighPresence), auto_overlay));
    return sceneColor;
}


vec4 renderMain() {
    if(PASSINDEX==0.){
        vec4 color = vec4(0.0);
        float noise_offset = floor(_noise(vec3(floor(_uvc*3.0), bass_count))*10.0 + 0.5);
        color += digits(fract((_uvc - vec2(0.15, -0.1)) * 2.0)* 0.06, noise_offset, noise_offset*0.25);
        return color;
    }
    else if(PASSINDEX==1.){
        vec3 col = render();
        return vec4( col, 1.0 );
    }
    else if (PASSINDEX == 2.0) {
        vec2 uv = _uv;
        vec4 mainPassCol = texture(mainPass, uv);
        uv = 1.0 - uv;
        vec4 vert_mir_pass = texture(mainPass, uv);
        return _mix3(mainPassCol, length(mainPassCol.xyz) <= 0.1 ? vert_mir_pass : mainPassCol, vert_mir_pass, mix(flip, syn_BassPresence, auto_flip));
    }
}
