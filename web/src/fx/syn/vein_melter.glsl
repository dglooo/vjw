// Source: donor/visual_system_2/scenes/release/vein_melter.synScene (main.glsl + scene.json + images/; script.js restated, see below) · unknown
// Author: cornusammonis
// License: unknown (the donor's CREDIT names cornusammonis only; shipped inside a commercial app; personal use, ⚠️ check before release)
// VeeJay Wizard, 2026: ported for fx/syn.ts (IMAGES image45/image16 from public/syn/vein_melter/images/: image16
// seeds the field; image45 is read only by commented-out code). Changes for ES 3.00: STEPS = 40 -> 40.0 and the
// advection loop's int index against it is float(i) < STEPS; PI/2 -> PI/2.0; _normalizeRGB(255, 255, 255) ->
// (255.0, 255.0, 255.0). script.js (not run) restated: beat_time = the bar count (bpm / 4 per minute) =
// syn_BeatTime / 4 (our grid's beat count). Controls: the reversed ranges of color_palette (the donor's MIN 4,
// MAX 0) and brush_size1 (MIN 2, MAX .3) are written 0 to 4 and .3 to 2. The media input is a stub here. The field
// starts itself again after a cleared target (the body's own rule: a zero texel takes the noise image).
/*{
  "TITLE": "Vein Melter",
  "CREDIT": "cornusammonis",
  "TAGS": ["feedback", "media", "colorful", "reaction-diffusion", "fluid", "simulation", "donor"],
  "WIDTH": 1920,
  "HEIGHT": 1080,
  "PASSES": [{"FLOAT": true, "HEIGHT": 432, "TARGET": "BuffA", "WIDTH": 768}, {"FLOAT": true, "HEIGHT": 432, "TARGET": "BuffA2", "WIDTH": 768}],
  "IMAGES": [{"NAME": "image45", "PATH": "images/45.jpg"}, {"NAME": "image16", "PATH": "images/16.png"}],
  "CONTROLS": [
    {"NAME": "pulse_out", "TYPE": "bang smooth", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "full_pulse", "TYPE": "bang smooth", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "retract", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "devolve", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "heartbeat_intensity", "TYPE": "slider smooth", "DEFAULT": 0.2, "MIN": 0.1, "MAX": 0.5},
    {"NAME": "color_palette", "TYPE": "slider smooth", "DEFAULT": 4, "MIN": 0, "MAX": 4},
    {"NAME": "melt_up_or_down", "TYPE": "slider smooth", "DEFAULT": 0.0, "MIN": -1.5, "MAX": 1.5},
    {"NAME": "zooming", "TYPE": "slider smooth", "DEFAULT": 0.0, "MIN": -1.5, "MAX": 1.5},
    {"NAME": "paint1_on", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "paint1XY", "TYPE": "xy smooth", "DEFAULT": [0, 0], "MIN": [-1.0, -1.0], "MAX": [1.0, 1.0]},
    {"NAME": "brush_size1", "TYPE": "slider smooth", "DEFAULT": 1, "MIN": 0.3, "MAX": 2},
    {"NAME": "paint2_on", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "paint2XY", "TYPE": "xy smooth", "DEFAULT": [0, 0], "MIN": [-1, -1], "MAX": [1, 1]},
    {"NAME": "grab_frame", "TYPE": "bang", "DEFAULT": 0, "MIN": 0, "MAX": 1.0},
    {"NAME": "opacity", "TYPE": "slider smooth", "DEFAULT": 1.0, "MIN": 0, "MAX": 1},
    {"NAME": "refraction", "TYPE": "slider smooth", "DEFAULT": 0.5, "MIN": 0, "MAX": 1},
    {"NAME": "combine_colors", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0, "MAX": 1},
    {"NAME": "reset_sim", "TYPE": "bang", "DEFAULT": 0, "MIN": 0, "MAX": 1}
  ]
}*/
#define beat_time (syn_BeatTime*0.25) // VJW: the bar count (script.js: a BPM / 4 counter)
			//******** BuffA2 Code Begins ********
float STEPS = 40.0;  // advection steps

float ts  =  0.2;   // advection curl
float cs  = -2.0;   // curl scale
float ls  =  0.05;   // laplacian scale
float ps  = -2.0;   // laplacian of divergence scale
float ds  = -0.4;   // divergence scale
float dp  = -0.03;  // divergence update scale
float pl  =  0.3;   // divergence smoothing
float amp =  1.0*(1.0-retract*0.1);   // self-amplification
float upd =  0.4;   // update smoothing

float _D = 0.6;   // diagonal weight

#define _K0 -20.0/6.0 // laplacian center weight
#define _K1 4.0/6.0   // laplacian edge-neighbors
#define _K2 1.0/6.0   // laplacian vertex-neighbors

#define _G0 0.25      // gaussian center weight
#define _G1 0.125     // gaussian edge-neighbors
#define _G2 0.0625    // gaussian vertex-neighbors

bool reset() {
    return reset_sim > 0.5;
}

vec2 normz(vec2 x) {
	return x == vec2(0.0) ? vec2(0.0) : normalize(x);
}

#define T(d) texture(BuffA2, fract(aUv+d)).xyz

vec3 advect(vec2 ab, vec2 vUv, vec2 texel, out float curl, out float div, out vec3 lapl, out vec3 blur) {
    
    vec2 aUv = vUv - ab * texel;
    vec4 t = vec4(texel, -texel.y, 0.0);

    vec3 uv =    T( t.ww); vec3 uv_n =  T( t.wy); vec3 uv_e =  T( t.xw);
    vec3 uv_s =  T( t.wz); vec3 uv_w =  T(-t.xw); vec3 uv_nw = T(-t.xz);
    vec3 uv_sw = T(-t.xy); vec3 uv_ne = T( t.xy); vec3 uv_se = T( t.xz);
    
    curl = uv_n.x - uv_s.x - uv_e.y + uv_w.y + _D * (uv_nw.x + uv_nw.y + uv_ne.x - uv_ne.y + uv_sw.y - uv_sw.x - uv_se.y - uv_se.x);
    div  = uv_s.y - uv_n.y - uv_e.x + uv_w.x + _D * (uv_nw.x - uv_nw.y - uv_ne.x - uv_ne.y + uv_sw.x + uv_sw.y + uv_se.y - uv_se.x);
    lapl = _K0*uv + _K1*(uv_n + uv_e + uv_w + uv_s) + _K2*(uv_nw + uv_sw + uv_ne + uv_se);
    blur = _G0*uv + _G1*(uv_n + uv_e + uv_w + uv_s) + _G2*(uv_nw + uv_sw + uv_ne + uv_se);
    
    return uv;
}

vec2 rot(vec2 v, float th) {
	return vec2(dot(v, vec2(cos(th), -sin(th))), dot(v, vec2(sin(th), cos(th)))); 
}

vec4 renderPassA() {
	vec4 fragColor = vec4(0.0);
	vec2 fragCoord = _xy;


    vec2 vUv = fragCoord.xy / RENDERSIZE.xy;
    vUv -= vec2(-(1.0-_uv.y)*(-0.5+_uv.x)*pow(abs(-0.5+_uv.x)*2.0, 2.0)*3.0, length(_uvc))*melt_up_or_down*0.001;
    // vUv= mix(vUv, vUv/(1.0+length(_uvc)*distort_amt*2.0*distort), 0.001);

    vUv -= _uvc*0.0005*zooming;


   if (paint2_on > 0.5) {
        vec2 d = vec2(abs(_uvc.x), _uvc.y)-paint2XY;
        if (paint2XY.x < 0.0){
            d = vec2(-abs(_uvc.x), _uvc.y)-paint2XY;
        }
        if (_uvc.x < 0.0){
            d.x = -d.x;
            // d = vec2(-abs(_uvc.x), _uvc.y)-paint2XY;
        }
        vec2 m = 2.0 * normz(d) * exp(-length(d) / 0.03);
        vUv += m*0.2;
        // div += pow(length(m)*3.0,2.0);
    }

    vec2 texel = 1. / RENDERSIZE.xy;
    
    vec3 lapl, blur;
    float curl, div;
    
    vec3 uv = advect(vec2(0), vUv, texel, curl, div, lapl, blur);

    float sp = ps * lapl.z;
    float sc = cs * curl;
	float sd = uv.z + dp * div + pl * lapl.z;
    vec2 norm = normz(uv.xy);

    vec2 off = uv.xy;
    vec2 offd = off;
    vec3 ab = vec3(0);

    for(int i = 0; float(i) < STEPS; i++) {
        advect(off, vUv, texel, curl, div, lapl, blur);
        offd = rot(offd,ts*curl);
        off += offd;
    	ab += blur / float(STEPS);  
    }
    
    vec2 tab = amp * ab.xy + ls * lapl.xy + norm * sp + uv.xy * ds * sd;    
    vec2 rab = rot(tab,sc);
    
    vec3 abd = mix(vec3(rab,sd), uv, upd);
    
    if (paint1_on>0.5) {
    	vec2 d = vec2(abs(_uvc.x), _uvc.y)-paint1XY;
        if (paint1XY.x < 0.0){
            d = vec2(-abs(_uvc.x), _uvc.y)-paint1XY;
        }

        // vec2 m = 0.1 * normz(d) * exp(-length(d) / 0.02);
        abd.xy += syn_HighHits*normz(d)*exp(-length(d)*50.0*brush_size1);
        abd.xy -= pow(syn_BassLevel,2.0)*normz(d)*exp(-length(d)*50.0*brush_size1);

    }

    abd = mix(abd, 1.0-abd, _pulse(length(_uvc)*0.9-0.01-length(abd)*0.1, 1.0-pulse_out, 0.01));
    abd = mix(abd, -abd, _pulse(length(_uvc)*1.0-0.01-length(abd)*0.1, 1.0-pulse_out, 0.01));

    // abd.xy += blur.xy*heartbeat_intensity*_pulse(length(_uvc)*0.5+length(abd)*0.2, 0.5+0.5*sin(beat_time*PI), heartbeat_intensity*0.1+0.02)*(0.5+0.5*sin(beat_time*PI*0.5));
    // abd.xy -= blur.xy*heartbeat_intensity*_pulse(length(_uvc)*0.5+length(abd)*0.2, 0.5+0.5*sin(beat_time*PI), heartbeat_intensity*0.1+0.02)*(0.5+0.5*sin(beat_time*PI*0.5+PI));

    vec2 hbAmt = blur.xy*heartbeat_intensity*_pulse(length(_uvc)+_fbm(vec3(_uvc*20.0,length(abd)*0.5+TIME*0.1)), (0.5+0.5*sin(beat_time*PI))+0.5, heartbeat_intensity*0.1+0.02);
    abd.xy += mix(hbAmt, -hbAmt*1.5, 0.5+0.5*sin(beat_time*PI-PI/2.0));
    // abd.xy -= blur.xy*heartbeat_intensity*_pulse(length(_uvc)+length(abd)*0.2, 0.5+0.5*sin(beat_time*PI), heartbeat_intensity*0.1+0.02);

    float lum = dot(_loadMedia().rgb, vec3(1.0))/3.0;
    abd.xy = mix(abd.xy, _rotate(vec2(0.0,1.0),lum*PI*2.0), grab_frame*lum);
    abd.z = mix(abd.z, (-1.0+lum*2.0)*0.2, grab_frame);

    abd.xy = _rotate(abd.xy, full_pulse*0.3);
    abd.xy *= 1.0+full_pulse*0.3;

    // abd.xy = mix(abd.xy, vec2(0.0), _pulse(length(_uvc)+length(abd)*0.4, 1.0-pulse3, length(abd)*0.4));


    // initialize with noise
    vec3 init = texture(image16, vUv, 5.0).xyz;
    if(uv == vec3(0) && init != vec3(0) || reset()) {
        fragColor = 1.0 * vec4(-0.5 + init, 1);
    } else {
        abd.z = clamp(abd.z, -1.0, 1.0);
        abd.xy = clamp(length(abd.xy) > 1.0 ? normz(abd.xy) : abd.xy, -1.0, 1.0);
        fragColor = vec4(abd, 0.0);
    }
    fragColor = mix(fragColor, vec4(0.0), pow(_fbm(vec3(_uvc*2.0,TIME*0.1)),3.0)*devolve);
	return fragColor; 
 } 


vec4 renderMainImage(){
    vec2 uv = _uv;
        vec3 components = texture(BuffA2, uv).xyz;
    vec3 norm = normalize(components);
    float c1 = clamp(pow(norm.z,0.4), 0.0, 1.0);
    float c2 = clamp(pow(norm.z, 1.8), 0.0, 1.0);
    float c3 =  clamp(dot(norm.xy, vec2(sin(TIME), cos(TIME))), 0.0, 1.0);
    // fragColor = vec4(red, green, blue, 1);
    // float d = length(texture(BuffA2, uv).xy);
    // vec3 tx = texture(image45, uv, 1.0).xyz;
    // vec3 col = mix(0.25 * (tx + 3.0 * vec3(1,0.85,0.7)), vec3(0.4,0,0.1), 5.0*d);
	// fragColor = vec4(col, 1.);

    float colMixer = color_palette;
    vec3 col1 = _normalizeRGB(255.0, 255.0, 255.0);
    vec3 col2 = vec3(-1.0);
    vec3 col3 = _normalizeRGB(255.0, 255.0, 255.0);
    float mixHue = 0.0;
    float mixSat = 0.0;

    // *** Color Regime 1 ***
    float cm = smoothstep(0.15, 0.85, clamp(colMixer, 0.0, 1.0));
    col1 = mix(col1, -vec3(0.1, 0.2, 0.3)*5.0, cm);
    col2 = mix(col2, vec3( 1.0, 1.0, 1.0), cm);
    col3 = mix(col3, vec3( 1.4, 1.3, 1.0), cm);
    mixHue = mix(mixHue, 0.5, cm);
    mixSat = mix(mixSat, -0.5, cm);

    // *** Color Regime 2 ***
    colMixer = colMixer-1.0;
    cm = smoothstep(0.15, 0.85, clamp(colMixer, 0.0, 1.0));
    col1 = mix(col1, vec3(0,0.62,0.56), cm);
    col2 = mix(col2, vec3(-1.0)*0.5, cm);
    col3 = mix(col3, vec3(1.0,0.56,0.0), cm);
    mixHue = mix(mixHue, 0.0, cm);
    mixSat = mix(mixSat, 0.0, cm);

    // *** Color Regime 3 ***
    colMixer = colMixer-1.0;
    cm = smoothstep(0.15, 0.85, clamp(colMixer, 0.0, 1.0));

    col1 = mix(col1, vec3(0.1,0.5,1.3), cm);
    col2 = mix(col2, -vec3(0.0,0.5,1.0), cm);
    col3 = mix(col3, vec3(1.9,0.7,0.0), cm);
    mixHue = mix(mixHue, 0.0, cm);
    mixSat = mix(mixSat, 0.2, cm);

    // *** Color Regime 4 ***
    colMixer = colMixer-1.0;
    cm = smoothstep(0.15, 0.85, clamp(colMixer, 0.0, 1.0));
    col1 = mix(col1, vec3( 2.6, 0.7, 0.9)*0.7, cm);
    col2 = mix(col2, -vec3(2.0, 2.0, 1.0)*0.9, cm);
    col3 = mix(col3, vec3(-0.9, 0.8, 1.4)*0.7, cm);
    mixHue = mix(mixHue, 0.0, cm);
    mixSat = mix(mixSat, -0.05, cm);
    float extra_red = cm;


    vec3 finalCol = col1*c1 + col2*c2 + col3*c3;
    finalCol *= vec3(1.0-finalCol.b*extra_red*0.3,1.0-finalCol.r*0.5*extra_red-finalCol.b*extra_red*0.3,1.0+finalCol.b*extra_red*0.2);

    // finalCol = _hueSaturationContrast(vec4(finalCol,1.0), mixHue, mixSat, 1.0).rgb;
    finalCol.rgb = _rgb2hsv(finalCol.rgb);
    finalCol.r += mixHue;
    finalCol.g += mixSat;
    finalCol.rgb = _hsv2rgb(finalCol.rgb);

    vec3 tx = _textureMedia(_uv+components.z*pow(refraction,2.0)).xyz;
    if (_isMediaActive()){
        vec3 texCol = vec3(0.0);
        if (combine_colors > 0.5){
            texCol = finalCol*tx*1.2;
        } else {
            texCol = 2.0*tx*dot(finalCol.rgb, vec3(1.0))/3.0;
        }
        finalCol = mix(finalCol, texCol, opacity);
    }

	return vec4(finalCol, 1.0); 
 } 


vec4 renderMain(){
	if(PASSINDEX == 0){
		return renderPassA();
	}
    if(PASSINDEX == 1){
        return texture(BuffA, _uv);
    }
	if(PASSINDEX == 2){
        // return texture(BuffA2, _uv)*4.0;
		return renderMainImage();
	}
}
