// Source: donor/visual_system_2/scenes/release/ray_marching_experiment_62.synScene (main.glsl + scene.json) · CC BY-NC-SA 3.0
// Author: aiekick (Stephane Cuillerdier)
// License: CC BY-NC-SA 3.0 Unported (the notice is kept below; non-commercial)
// VeeJay Wizard, 2026: ported for fx/syn.ts, body unchanged. script.js (not run) restated: script_time adds
// 0.75 * bass_time * (0.1 * syn_BassLevel^2 + 0.2 * syn_BassPresence + 0.01) per frame (no dt) = the clock per second
// at the donor's 60 fps (x 60). speed_direction is a traveler (the adapter's clock). flatten: the donor's reversed
// range (1 to -1) is written -1 to 1. The media texture is off (no media input yet). ⚡ syn_Hits (the `flashing`
// light; the built-in turns it on) is flash-gated.
// Our detector's logic (user 2026-11-18): one line rides syn_Intensity (the energy macro, its default binding; x 1 at
// .5 = the track's mean): fov_mod x (.8 + .4 x it), so a full track widens the lens.
/*{
  "TITLE": "Ray Marching Experiment 62",
  "CREDIT": "aiekick",
  "TAGS": ["3d", "raymarching", "spiral", "donor"],
  "WIDTH": 1920,
  "HEIGHT": 1080,
  "VJW_FLASH": ["syn_Hits"],
  "VJW_CLOCK": {
    "script_time": [[4.5, "bass_time", "syn_BassLevel", "syn_BassLevel"], [9, "bass_time", "syn_BassPresence"], [0.45, "bass_time"]]
  },
  "CONTROLS": [
    {"NAME": "auto_hue", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "darker", "TYPE": "slider smooth", "DEFAULT": 0, "MIN": 0, "MAX": 2},
    {"NAME": "flashing", "TYPE": "toggle", "DEFAULT": 0, "MIN": 0, "MAX": 1},
    {"NAME": "fov_mod", "TYPE": "slider smooth", "DEFAULT": 0.6, "MIN": 0.0, "MAX": 2},
    {"NAME": "ridges_constant", "TYPE": "toggle", "DEFAULT": 1, "MIN": 0, "MAX": 1},
    {"NAME": "flatten", "TYPE": "slider smooth", "DEFAULT": 1, "MIN": -1, "MAX": 1},
    {"NAME": "highhits_ridges", "TYPE": "toggle", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "spiral_ridges", "TYPE": "slider smooth", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "speed_direction", "TYPE": "knob traveler", "DEFAULT": 0.1, "MIN": -0.4, "MAX": 0.4},
    {"NAME": "bass_time", "TYPE": "knob", "DEFAULT": 0.35, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "media_scale", "TYPE": "slider smooth", "DEFAULT": 0.5, "MIN": 0.0, "MAX": 2.0},
    {"NAME": "media_only", "TYPE": "slider smooth", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0},
    {"NAME": "selector", "TYPE": "slider smooth", "DEFAULT": 0.0, "MIN": 0.0, "MAX": 1.0}
  ]
}*/
// Created by Stephane Cuillerdier - @Aiekick/2016
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// Tuned via XShade (http://www.funparadigm.com/xshade/)

mat3 rotx(float a){return mat3(1.,0.,0.,0.,cos(a),-sin(a),0.,sin(a),cos(a));}
mat3 roty(float a){return mat3(cos(a),0.,sin(a),0.,1.,0.,-sin(a),0.,cos(a));}
mat3 rotz(float a){return mat3(cos(a),-sin(a),0.,sin(a),cos(a),0.,0.,0.,1.);}

float retreater_var = spiral_ridges*spiral_ridges;
float rotTime = (script_time);
vec4 fragColor = vec4(0.0);

vec4 df(vec3 p) // from https://www.shadertoy.com/view/ltcSDr
{
	p *= rotz(p.z * 0.07 * flatten);
	vec2 uv = p.xz;
	float a = length(uv) - rotTime;
	uv *= mat2(cos(a), -sin(a), sin(a), cos(a));
	uv = abs(uv);
	uv = vec2(atan(uv.x-retreater_var*100.0, uv.y+retreater_var*50.0)/3.14159, length(uv));
	float b = sqrt(uv.x) + sqrt(uv.y) - sin(p.x*10.0-p.z*10.0+TIME)*highhits_ridges*0.025*syn_HighHits;
	float c = sqrt(uv.x + uv.y);
	float s = b-c;
	float d = 6. - abs(p.y)  - smoothstep(0.128,1.0-0.128, s*1.32*mix(syn_Presence,1.0,ridges_constant));
	// fragColor.rgb += getTexCol(p, vec4(b, c, s, d))*0.085;
	return vec4(d);
}

vec3 nor( in vec3 p, float prec )
{
	vec3 e = vec3( prec, 0., 0. );
	vec3 n = vec3(
	    df(p+e.xyy).x - df(p-e.xyy).x,
	    df(p+e.yxy).x - df(p-e.yxy).x,
	    df(p+e.yyx).x - df(p-e.yyx).x );
	return normalize(n);
}


// return color from temperature 
//http://www.physics.sfasu.edu/astro/color/blackbody.html
//http://www.vendian.org/mncharity/dir3/blackbody/
//http://www.vendian.org/mncharity/dir3/blackbody/UnstableURLs/bbr_color.html
vec3 blackbody(float Temp)
{
	vec3 col = vec3(255.);
    col.x = 56100000. * pow(Temp,(-3. / 2.)) + 148.;
   	col.y = 100.04 * log(Temp) - 623.6;
   	if (Temp > 6500.) col.y = 35200000. * pow(Temp,(-3. / 2.)) + 184.;
   	col.z = 194.18 * log(Temp) - 1448.6;
   	col = clamp(col, 0., 255.)/255.;
    if (Temp < 1000.) col *= Temp/1000.;
    // return col;
    
    // thansk to public_int_i
    float i1 = sin(TIME*0.45)*0.5+0.5,
          i2 = cos(TIME*0.45)*0.5+0.5;
   	return mix(col, col*max(0., 1.0-(i1+i2))+
           col.zxy*i1+
           col.yzx*i2, auto_hue);
}
vec3 tex3D( sampler2D tex, in vec3 p, in vec3 n ){
    n = max(n*n, 0.001); // n = max((abs(n) - 0.2)*7., 0.001); // n = max(abs(n), 0.001), etc.
    n /= (n.x + n.y + n.z ); 
	return (_pulse(selector, 0.00, 0.5)*_textureMedia(p.yz)*n.x + _pulse(selector, 0.5, 0.5)*_textureMedia(p.zx)*n.y + _pulse(selector, 1.0, 0.5)*_textureMedia(p.xy)*n.z).xyz;
}
// get density of the df at surfPoint
// ratio between constant step and df value
float SubDensity(vec3 surfPoint, float prec, float ms) 
{
	vec3 n;
	float s = 0.;
    const int iter = 10;
	for (int i=0;i<iter;i++)
	{
		n = nor(surfPoint,prec); 
		surfPoint = surfPoint - n * ms; 
		s += df(surfPoint).x;
	}
	
	return 1.-s/(ms*float(iter)); // s < 0. => inside df
}

float SubDensity(vec3 p, float s) 
{
	vec3 n = nor(p,s); 							
	return df(p - n * s).x;						
}

vec4 renderMainImage() {
	vec2 fragCoord = _xy;    
  vec2 g = fragCoord.xy;
	vec2 si = RENDERSIZE.xy;
	vec2 uv = (g+g-si)/si.y;
	float t = -speed_direction * 0.2;
	vec3 ro = vec3(cos(t),0., sin(t)) * 12.; 
  vec3 cv = vec3(0); 
	vec3 cu = normalize(vec3(0,1,0));
	vec3 z = normalize(cv-ro);
  vec3 x = normalize(cross(cu,z));
	vec3 y = cross(z,x);
  float fov = .9*2.5*pow(fov_mod*(0.8+0.4*syn_Intensity),2.0); // VJW: syn_Intensity widens the lens
	vec3 rd = normalize(fov * (uv.x * x + uv.y * y) + z);
    
  float s = 1., d = 0., extraLight = 0.0;
	for (int i=0; i<200; i++) 
	{
		if (log(d*d/s/1e5)>0.) break;
		d += (s=df(ro+rd*d).x)*.5;
    extraLight += d/400.*(1.0-darker)+d/300.0*flashing*syn_Hits; // new lighting try system
	}

	fragColor.rgb += extraLight;
  fragColor.rgb = mix(fragColor.rgb, vec3(d*d/400.), .5);
    
	vec3 p = ro + rd * d;											// surface point
	vec3 lid = normalize(ro-p); 									// light dir
	vec3 n = nor(p, 0.1);											// normal at surface point
	vec3 refl = reflect(rd,n);										// reflected ray dir at surf point 
	float diff = clamp( dot( n, lid ), 0.0, 1.0 ); 					// diffuse
	float fre = pow( clamp( 1. + dot(n,rd),0.0,1.0), 4. ); 			// fresnel
	float spe = pow(clamp( dot( refl, lid ), 0.0, 1.0 ),16.);		// specular
	vec3 col = vec3(.8,.5,.2);
  float sss = df(p - n*0.001).x/0.1;								// quick sss 0.001 of subsurface
	float sb = SubDensity(p, 1., 0.1);								// deep subdensity from 0.01 to 0.1 (10 iterations)
	vec3 bb = clamp(blackbody(100. * sb),0.,1.);					// blackbody color
	float sss2 = 1. - SubDensity(p, 3.); 							// one step sub density of df of 3 of subsurface
	
  fragColor.rgb *= (diff + fre + bb * sss2 * .8 + col * sss * .2) * 0.25 + spe * 1.2;

	// vigneting from iq Shader Mike : https://www.shadertoy.com/view/MsXGWr
  vec2 q = g/si;
  fragColor.rgb *= 0.5 + 0.5*pow( 16.0*q.x*q.y*(1.0-q.x)*(1.0-q.y), 0.55 );
  if (_isMediaActive()){
  	vec3 texCol = tex3D(syn_Media, p*media_scale, n);
  	fragColor.rgb = mix(texCol, fragColor.rgb+texCol, 1.0-media_only);
  }
	return fragColor; 
 } 


vec4 renderMain(){
	if(PASSINDEX == 0){
		return renderMainImage();
	}
}
