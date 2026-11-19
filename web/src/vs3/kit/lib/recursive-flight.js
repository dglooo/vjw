// Copied from donor/vs3/visual_kit/src/lib/recursive-flight.js (the friends' engine, used with permission, 2026-11-19).
// vjw: chooseSplit() runs at creation (marked below), so the host's compileAsync warms the split passes; nothing else changed.
// Shared motion and lighting for the October fractal studies.
// Each geometry is a union over scales exp(phase + k * period). The
// geometry uses physical scale, never k, so wrapping phase is invisible.
import * as THREE from 'three';
import { PAL, drastic } from './common.js';
import { ctx } from './context.js';

export function advanceFlight(state, dt, speed, kick, period) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const h = Math.min(dt, 0.05);
  state.pulse = Math.min(1, state.pulse + Math.max(0, kick || 0) * 0.65);
  const decay = Math.exp(-h * 6);
  const advance = drastic(speed) * (0.2 * h + 0.17 * state.pulse * (1 - decay) / 6);
  state.pulse *= decay;
  const next = state.phase + advance;
  const turns = Math.floor(next / period);
  state.phase = next - turns * period;
  state.turns += turns;
  state.distance += advance;
  state.velocity = advance / h;
}

// limitedMap: the geometry's map takes a range after p (and the marching
// flag): the exact distance is only needed below it, and anything farther
// may return any value at or past the range. Shading samples pass the
// range past which their result cannot change, so distant geometry skips
// its detailed evaluation and every pixel stays the same.
// extraUniforms and derive: a geometry may keep values that depend only
// on the sliders in uniforms, recomputed on the CPU whenever the smoothed
// sliders move (derive(values, uniforms)), instead of in every distance
// evaluation of every pixel.
// deferred: a vec3 expression of the hit (p, normal, rd, eps, trap) that
// the surface reads as `deferred`. When the passes split it runs in a
// pass of its own, so a heavy term (pearl's reflection) stops costing
// the rest of the shading its registers.
// floor: k when every copy of the geometry lies above the downward cone
// z = -k|p| (seen from the centre, nothing dips further below the
// rosette's plane). A ray inside that cone heading down more steeply than
// its slope can never meet anything, so it ends there as a miss instead of
// marching on to the far limit through empty space.
// renderFloor: a lower limit than the app's for this scene's render scale,
// so a reduced pixelBudget (budget) still applies on large displays.
// softShadow: n traces the soft shadow for one pixel in n x n and spreads
// it to the rest over matching surfaces (split passes only). The shadow
// is smooth across a surface, so at 4 no pixel moves by more than a few
// levels, while ambient occlusion at any lower rate visibly blurred
// across facet edges.
// hulls: convex shells that enclose every copy of the geometry, drawn as
// triangles before the march (split passes only). Each pixel's march
// starts where its ray enters the nearest shell instead of at the camera,
// and a ray that meets no shell is a miss without a single step. The
// march itself, and with it every hit, is unchanged. { positions } is a
// non-indexed triangle buffer in the shell's own coordinates, which
// update may refill by returning a list as `positions`; { vertex }
// is GLSL defining vec3 hullPoint(vec3 position,int instance,vec3 ro,
// float lens), the world position of one corner of shell `instance`,
// already grown to enclose every point the march could call a hit;
// update(uniforms, view) sets that GLSL's uniforms for the frame and
// returns { count, inside }, inside when the camera may sit within a
// shell (the march then starts at the camera, as without shells).
// Optional { varyings, span }: GLSL shared by both stages, and bool
// hullSpan(vec3 ro,vec3 rd,out vec2 span) giving the exact entry and exit
// of the shape a shell encloses, for shapes that have one (pearl's
// spheres). Pixels the shell covers but the shape misses are dropped.
// kickSurge: how far a kick pushes the dive forward (0 keeps the speed
// slider's rate exactly; the light still answers the music).
// gradient: the geometry defines float mapGradient(vec3 p,float limit,
// out vec4 trap,out vec3 grad), its distance with the exact gradient,
// and the shading takes the normal from it instead of four taps.
export function createRecursiveFlight({ name, geometry, period, labels, defaults = {}, cameraZ = 3.8, cameraOffset = [0.035, 0.02], tiltRange = 0.24, framingRange = null, budget = 1.25, surface = '', detailedMap = false, normalFootprint = false, limitedMap = false, extraUniforms = {}, derive = null, deferred = null, softShadow = 0, floor = null, renderFloor = null, hulls = null, gradient = false, kickSurge = 1 }) {
  const call = (p, marching, limit) => `map(${p},${detailedMap ? `${marching},` : ''}${limitedMap ? `${limit},` : ''}trap)`;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const params = { speed: 0.5, shape: 0.5, complexity: 0.65, fill: 0.5, tilt: 0.5, ...defaults };
  if (labels.density !== undefined) params.density ??= 0.5;
  if (labels.edge !== undefined) params.edge ??= 0.5;
  const structuralKeys = ['shape','complexity','density','fill','tilt','edge'].filter(key => key in params);
  const values = { ...params, energy: 0.72, highs: 0.2, kick: 0 };
  const motion = { phase: 0, turns: 0, distance: 0, velocity: 0, pulse: 0 };
  let age = 0, lastAccent = -10, accentCount = 0, shapeOffset = 0;
  const uniforms = {
    uAspect: { value: 1 }, uResolution: { value: 720 },
    uPhase: { value: 0 }, uShape: { value: params.shape },
    uDetail: { value: params.complexity }, uStructure: { value: params.density ?? 0 }, uFraming: { value: params.fill },
    uTilt: { value: params.tilt }, uEnergy: { value: values.energy }, uHighs: { value: 0.2 }, uKick: { value: 0 },
    uBg: { value: PAL.bg }, uShadow: { value: PAL.shadow }, uMid: { value: PAL.mid },
    uAccent: { value: PAL.accent }, uGlow: { value: PAL.glow },
    uMarch: { value: null }, uMarchSize: { value: new THREE.Vector2(1, 1) }, uDeferred: { value: null }, uSoft: { value: null }, uHull: { value: null }, uHullEnd: { value: null }, uHullOff: { value: 1 },
    ...extraUniforms,
  };
  if (labels.edge !== undefined) uniforms.uCut = { value: params.edge };
  derive?.(values, uniforms);
  function refresh(dt) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const h = Math.min(dt, 0.05);
    for (const key of structuralKeys) {
      const target=Math.max(0,Math.min(1,params[key]+(key==='shape'?shapeOffset:0)));
      values[key]+=(target-values[key])*(1-Math.exp(-h*3));
    }
    uniforms.uShape.value=values.shape;
    uniforms.uDetail.value=values.complexity;
    uniforms.uStructure.value=values.density ?? 0;
    uniforms.uFraming.value=values.fill;
    uniforms.uTilt.value=values.tilt;
    if (uniforms.uCut) uniforms.uCut.value=values.edge;
    derive?.(values, uniforms);
  }
  // When the renderer can store float distances the image is drawn in
  // two passes: the march writes each pixel's hit distance to a float
  // target, and the shading pass reads it back, rebuilding the same ray
  // and epsilon. The march compiles on its own, so a few silhouette
  // pixels round differently; nothing else moves. One program holding both
  // runs the march at the occupancy the shading's registers leave it
  // (crystal: 19 ms alone, 28 ms beside its shading); split, each pass
  // runs at its own.
  const head = /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform float uAspect, uResolution, uPhase, uShape, uDetail, uStructure, uFraming, uTilt, uEnergy, uHighs, uKick;
      uniform vec3 uBg, uShadow, uMid, uAccent, uGlow;
      uniform sampler2D uMarch;
      uniform vec2 uMarchSize;
      uniform sampler2D uDeferred;
      uniform sampler2D uSoft;
      uniform sampler2D uHull;
      uniform sampler2D uHullEnd;
      uniform float uHullOff;
      ${labels.edge !== undefined ? 'uniform float uCut;' : ''}
      const float PERIOD = ${period.toFixed(12)};
      mat2 turn(float a) { float c=cos(a),s=sin(a);return mat2(c,-s,s,c); }
      vec3 sortFold(vec3 p) {
        p=abs(p);
        if(p.x<p.y)p.xy=p.yx;
        if(p.x<p.z)p.xz=p.zx;
        if(p.y<p.z)p.yz=p.zy;
        return p;
      }
      vec3 colorAt(float t) {
        t=fract(t)*3.0;
        if(t<1.0)return mix(uMid,uAccent,smoothstep(0.0,1.0,t));
        if(t<2.0)return mix(uAccent,uGlow,smoothstep(0.0,1.0,t-1.0));
        return mix(uGlow,uMid,smoothstep(0.0,1.0,t-2.0));
      }
      ${geometry}
      float mapD(vec3 p,float limit) { vec4 trap; return ${call('p', 'false', 'limit')}; }
      float shadowAt(vec3 p,vec3 n,vec3 light,float eps) {
        float t=eps*6.0,shade=1.0;
        float scale=max(length(p),0.03);
        for(int j=0;j<7;j++) {
          // Past t/9 an occluder cannot darken (9d/t >= 1), and past
          // scale*0.16 the step is already at its cap.
          float d=mapD(p+n*eps*4.0+light*t,max(t/9.0,scale*0.16));
          shade=min(shade,9.0*max(d,0.0)/t);
          t+=clamp(d,scale*0.025,scale*0.16);
          if(t>scale*0.8||d<eps)break;
        }
        return clamp(shade,0.0,1.0);
      }
      ${softShadow ? `
      // The four low-resolution shadows around this pixel, bilinear, each
      // kept only when its surface lies within 1% of this pixel's depth, so
      // a shadow never crosses a silhouette. With none on its own surface a
      // pixel takes the nearest sample in depth.
      float softShadowAt(float t) {
        vec2 f=(gl_FragCoord.xy-0.5)/${softShadow.toFixed(1)};
        ivec2 base=ivec2(floor(f)),last=textureSize(uSoft,0)-1;
        vec2 w=f-vec2(base);
        float shadow=0.0,sum=0.0,best=1e9,nearest=1.0;
        for(int k=0;k<4;k++) {
          ivec2 o=ivec2(k&1,k>>1);
          vec2 near=texelFetch(uSoft,min(base+o,last),0).rg;
          float gap=abs(near.y-t);
          float weight=(o.x==1?w.x:1.0-w.x)*(o.y==1?w.y:1.0-w.y)*step(gap,t*0.01);
          shadow+=near.x*weight;sum+=weight;
          if(gap<best){best=gap;nearest=near.x;}
        }
        return sum>0.0?shadow/sum:nearest;
      }` : ''}
`;
  const eye = /* glsl */`        vec3 ro=vec3(${cameraOffset[0].toFixed(4)},${cameraOffset[1].toFixed(4)},1.0)*${cameraZ.toFixed(4)};
        ro.yz=turn((uTilt-0.5)*${tiltRange.toFixed(4)})*ro.yz;
        vec3 fw=normalize(-ro),rt=normalize(cross(fw,vec3(0,1,0))),up=cross(rt,fw);
        float lens=${framingRange ? `exp(mix(${Math.log(framingRange[0]).toFixed(12)},${Math.log(framingRange[1]).toFixed(12)},uFraming))` : 'mix(0.82,2.0,uFraming)'};
`;
  const ray = (at) => /* glsl */`        vec2 uv=(${at}-0.5)*2.0*vec2(uAspect,1.0);
${eye}        vec3 rd=normalize(fw*lens+rt*uv.x+up*uv.y);
`;
  // From the hulls: the shell entry, a little early, or past the far
  // limit (no step at all) when the ray meets no shell.
  const fromHull = /* glsl */`uHullOff>0.5?0.005:hullAt>0.0?max(0.005,hullAt-max(0.00012,hullAt/(uResolution*lens)*0.52)):23.0`;
  const march = (from) => /* glsl */`        ${from === '0.005' ? '' : `float hullAt=texelFetch(uHull,ivec2(vUv*uMarchSize),0).r;
        // Past the farthest shell exit nothing is left to meet.
        float hullEnd=uHullOff>0.5?22.0:texelFetch(uHullEnd,ivec2(vUv*uMarchSize),0).r;
        `}float t=${from},eps=0.001,steps=0.0;
        bool hit=false;
        vec4 trap=vec4(0);
        ${from === '0.005' ? '' : 'if(t<22.0)'}for(int i=0;i<112;i++) {
          vec3 p=ro+rd*t;
          eps=max(0.00012,t/(uResolution*lens)*0.52);
          float d=${call('p', 'true', '100.0')};
          if(d<eps){hit=true;break;}
          ${floor === null ? '' : `if(p.z<${(-floor).toFixed(4)}*length(p)&&rd.z<${(-floor).toFixed(4)})break;`}
          // The scale selection has compact support. This radial bound
          // keeps a ray from skipping an unseen smaller copy.
          t+=min(max(d*0.72,eps*0.2),max(0.004,length(p)*0.18));
          steps+=1.0;
          if(t>22.0)break;
          ${from === '0.005' ? '' : 'if(t>hullEnd)break;'}
        }
`;
  const stored = (pixel) => /* glsl */`
        // The march pass stored the hit distance, or -1 for a miss. The
        // epsilon is rebuilt from it exactly as the march tested the hit.
        float t=texelFetch(uMarch,${pixel},0).r;
        bool hit=t>0.0;
        float eps=max(0.00012,t/(uResolution*lens)*0.52);
        vec4 trap=vec4(0);
`;
  const shadeHead = /* glsl */`        vec3 col=uBg*0.6;
        ${normalFootprint ? 'vec3 p=ro+rd*t,normal=vec3(0.0);' : ''}
        ${normalFootprint ? '{' : 'if(hit) {'}
          ${normalFootprint ? '' : 'vec3 p=ro+rd*t;'}
          // The hit and its normal taps lie within a few pixels of the
          // surface; nothing farther can be the nearest.
${gradient ? `          // The geometry differentiates its own distance: one evaluation
          // instead of five.
          {vec3 grad;mapGradient(p,eps*16.0,trap,grad);${normalFootprint ? '' : 'vec3 '}normal=normalize(grad);}
` : `          float tap=max(eps*1.4,0.00016);
          ${call('p', 'false', 'eps*16.0')};
          vec2 e=vec2(1,-1)*tap*0.57735;
          float near=eps*4.0+tap*8.0;
          ${normalFootprint ? '' : 'vec3 '}normal=normalize(e.xyy*mapD(p+e.xyy,near)+e.yyx*mapD(p+e.yyx,near)+e.yxy*mapD(p+e.yxy,near)+e.xxx*mapD(p+e.xxx,near));
`}        ${normalFootprint ? `}
        // Derivatives must execute for every pixel after the hit branch
        // reconverges. Inside that branch, edge quads have undefined values.
        // Every pixel also runs the taps above, misses included, and only
        // then takes its zero normal: with the taps inside if(hit), Metal
        // shaded edge pixels differently from run to run once the shading
        // had a program of its own (2026-10-17).
        normal=hit?normal:vec3(0.0);
        vec3 normalDelta=max(abs(dFdx(normal)),abs(dFdy(normal)));
        float normalFootprint=max(normalDelta.x,max(normalDelta.y,normalDelta.z));
        if(hit) {` : ''}
`;
  const shadeTail = /* glsl */`          float reach=max(0.015,length(p)*0.075);
          float ao=clamp(mapD(p+normal*reach,reach)/reach,0.0,1.0);
          ao*=clamp(mapD(p+normal*reach*2.7,reach*2.7)/(reach*2.7),0.0,1.0);
          ao=0.08+0.92*sqrt(ao);
          vec3 key=normalize(vec3(-0.6,0.9,1.1));
          vec3 fill=normalize(vec3(0.8,-0.3,0.35));
          float diffuse=max(dot(normal,key),0.0);
          float shadow=shadowAt(p,normal,key,eps);
          float secondary=max(dot(normal,fill),0.0);
          float front=max(dot(normal,-rd),0.0);
          float rim=pow(1.0-front,3.0);
          float spec=pow(max(dot(normal,normalize(key-rd)),0.0),mix(30.0,95.0,trap.z));
          vec3 base=colorAt(trap.x);
          // Preserve broad colored material under the neutral highlights.
          base*=0.46/max(0.46,max(base.r,max(base.g,base.b)));
          col=base*(0.055+0.95*diffuse*(0.05+0.95*shadow)+0.075*front)*ao;
          col+=colorAt(trap.x+0.37)*secondary*0.07*ao;
          col+=uGlow*spec*(0.45+uHighs*0.25)*ao*shadow;
          col+=colorAt(trap.x+0.23)*rim*(0.11+0.24*trap.z)*sqrt(ao);
          col+=colorAt(trap.x+0.5)*trap.y*0.025;
          ${surface}
          col=mix(col,uBg,smoothstep(10.0,22.0,t));
        }
        col*=0.32+0.9*uEnergy;
        gl_FragColor=vec4(max(col,0.0),1.0);
      `;
  const program = (body) => new THREE.ShaderMaterial({
    uniforms, depthWrite: false, depthTest: false,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.0);}',
    fragmentShader: `${head}      void main() {
${body}      }`,
  });
  const inline = deferred ? `          vec3 deferred=${deferred};
` : '';
  const fetched = deferred ? `          vec3 deferred=texelFetch(uDeferred,ivec2(vUv*uMarchSize),0).rgb;
` : '';
  const whole = program(ray('vUv') + march('0.005') + shadeHead + inline + shadeTail);
  const marchPass = program(ray('vUv') + march(hulls ? fromHull : '0.005') + `        gl_FragColor=vec4(hit?t:-1.0,0.0,0.0,1.0);
`);
  // Same hit and normal as the shading pass, then only the deferred term.
  const deferredPass = deferred && program(ray('vUv') + stored('ivec2(vUv*uMarchSize)') + shadeHead + `          gl_FragColor=vec4(${deferred},1.0);
          return;
        }
        gl_FragColor=vec4(0.0);
`);
  const shadowLine = '          float shadow=shadowAt(p,normal,key,eps);\n';
  if (softShadow && !shadeTail.includes(shadowLine)) throw new Error('softShadow: the shadow line moved');
  const shadePass = program(ray('vUv') + stored('ivec2(vUv*uMarchSize)') + shadeHead + fetched
    + (softShadow ? shadeTail.replace(shadowLine, '          float shadow=softShadowAt(t);\n') : shadeTail));
  // One pixel in n x n, traced from its own hit and normal.
  const softPass = softShadow && program(ray(`(vec2(ivec2(gl_FragCoord.xy)*${softShadow})+0.5)/uMarchSize`)
    + stored(`ivec2(gl_FragCoord.xy)*${softShadow}`) + shadeHead + `          gl_FragColor=vec4(shadowAt(p,normal,normalize(vec3(-0.6,0.9,1.1)),eps),t,0.0,1.0);
          return;
        }
        gl_FragColor=vec4(1.0,-1.0,0.0,1.0);
`);
  const quad = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(quad, whole);
  scene.add(mesh);
  // Never drawn by the composer; it keeps the march program reachable
  // from the scene, so the boot warm compiles it with the shading pass.
  const proxies = [marchPass, deferredPass, softPass].filter(Boolean).map((pass) => {
    const proxy = new THREE.Mesh(quad, pass);
    proxy.visible = false;
    return proxy;
  });
  let hullScene = null, hullEndScene = null, hullMesh = null;
  if (hulls) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(hulls.positions, 3));
    geometry.instanceCount = 0;
    const near = 0.004, far = 96;
    hullMesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      uniforms, side: THREE.DoubleSide, depthTest: true, depthWrite: true,
      vertexShader: /* glsl */`
      precision highp float;
      uniform float uAspect, uResolution, uPhase, uShape, uDetail, uFraming, uTilt;
      const float PERIOD = ${period.toFixed(12)};
      mat2 turn(float a) { float c=cos(a),s=sin(a);return mat2(c,-s,s,c); }
      varying vec3 vWorld;
      ${hulls.varyings || ''}
      ${hulls.vertex}
      void main() {
${eye}        vWorld=hullPoint(position,gl_InstanceID,ro,lens);
        vec3 v=vWorld-ro;
        float z=dot(v,fw);
        // The march's own projection: uv = lens * (x, y) / z.
        gl_Position=vec4(lens*dot(v,rt)/uAspect,lens*dot(v,up),z*${((far + near) / (far - near)).toFixed(9)}-${(2 * far * near / (far - near)).toFixed(9)},z);
      }`,
      fragmentShader: /* glsl */`
      precision highp float;
      uniform float uFraming, uTilt;
      varying vec3 vWorld;
      mat2 turn(float a) { float c=cos(a),s=sin(a);return mat2(c,-s,s,c); }
      ${hulls.varyings || ''}
      ${hulls.span || ''}
      void main() {
${eye}${hulls.span ? `        // The exact span of the shape the shell stands for: its entry
        // (or exit) is both the colour and the depth, so overlapping
        // shells order by what they enclose.
        vec3 rd=normalize(vWorld-ro);
        vec2 span;
        if(!hullSpan(ro,rd,span))discard;
#ifdef HULL_EXIT
        float t=span.y;
#else
        float t=max(span.x,${near.toFixed(4)});
#endif
        float z=t*dot(rd,fw);
        gl_FragDepth=0.5*(${((far + near) / (far - near)).toFixed(9)}-${(2 * far * near / (far - near)).toFixed(9)}/z)+0.5;
        gl_FragColor=vec4(t,0.0,0.0,1.0);
` : `        gl_FragColor=vec4(distance(vWorld,ro),0.0,0.0,1.0);
`}      }`,
    }));
    hullMesh.frustumCulled = false;
    hullScene = new THREE.Scene();
    hullScene.add(hullMesh);
    // The same shells keeping the farthest surface instead of the nearest.
    const exit = new THREE.Mesh(geometry, hullMesh.material.clone());
    exit.material.uniforms = uniforms;
    exit.material.depthFunc = THREE.GreaterDepth;
    exit.material.defines = { HULL_EXIT: 1 };
    exit.frustumCulled = false;
    hullEndScene = new THREE.Scene();
    hullEndScene.add(exit);
  }
  // The camera on the CPU, as the shaders build it.
  function view() {
    const f = uniforms.uFraming.value;
    const lens = framingRange ? Math.exp(Math.log(framingRange[0]) + (Math.log(framingRange[1]) - Math.log(framingRange[0])) * f) : 0.82 + 1.18 * f;
    const a = (uniforms.uTilt.value - 0.5) * tiltRange, c = Math.cos(a), s = Math.sin(a);
    const y = cameraOffset[1] * cameraZ, z = cameraZ;
    return { ro: [cameraOffset[0] * cameraZ, c * y + s * z, -s * y + c * z], lens, resolution: uniforms.uResolution.value };
  }
  const marchScene = new THREE.Scene(), deferredScene = new THREE.Scene(), softScene = new THREE.Scene();
  marchScene.add(new THREE.Mesh(quad, marchPass));
  if (deferredPass) deferredScene.add(new THREE.Mesh(quad, deferredPass));
  if (softPass) softScene.add(new THREE.Mesh(quad, softPass));
  const floatTarget = (format, depthBuffer = false) => new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.FloatType, format, minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter, depthBuffer, generateMipmaps: false,
  });
  const bufferSize = new THREE.Vector2();
  let marchTarget = null, deferredTarget = null, softTarget = null, hullTarget = null, hullEndTarget = null, split = null;
  const clearColor = new THREE.Color();
  function chooseSplit() {
    if (split !== null || !ctx.renderer) return;
    split = ctx.renderer.extensions.has('EXT_color_buffer_float');
    if (!split) return;
    mesh.material = shadePass;
    scene.add(...proxies);
  }
  // Runs after every uniform for the frame is set, before the composer
  // draws the shading pass.
  function marchFrame() {
    chooseSplit();
    if (!split) return;
    const renderer = ctx.renderer;
    renderer.getDrawingBufferSize(bufferSize);
    const w = bufferSize.x, h = bufferSize.y;
    if (!marchTarget) {
      marchTarget = floatTarget(THREE.RedFormat);
      uniforms.uMarch.value = marchTarget.texture;
      if (deferredPass) {
        deferredTarget = floatTarget(THREE.RGBAFormat);
        uniforms.uDeferred.value = deferredTarget.texture;
      }
      if (softPass) {
        softTarget = floatTarget(THREE.RGFormat);
        uniforms.uSoft.value = softTarget.texture;
      }
      if (hulls) {
        hullTarget = floatTarget(THREE.RedFormat, true);
        uniforms.uHull.value = hullTarget.texture;
        hullEndTarget = floatTarget(THREE.RedFormat, true);
        uniforms.uHullEnd.value = hullEndTarget.texture;
      }
    }
    for (const target of [marchTarget, deferredTarget, hullTarget, hullEndTarget]) {
      if (target && (target.width !== w || target.height !== h)) target.setSize(w, h);
    }
    const sw = Math.ceil(w / softShadow), sh = Math.ceil(h / softShadow);
    if (softTarget && (softTarget.width !== sw || softTarget.height !== sh)) softTarget.setSize(sw, sh);
    uniforms.uMarchSize.value.copy(bufferSize);
    const previous = renderer.getRenderTarget();
    if (hulls) {
      const { count, inside, positions } = hulls.update(uniforms, view());
      if (positions) {
        const attribute = hullMesh.geometry.attributes.position;
        attribute.array.set(positions);
        attribute.needsUpdate = true;
        hullMesh.geometry.setDrawRange(0, positions.length / 3);
      }
      uniforms.uHullOff.value = inside ? 1 : 0;
      hullMesh.geometry.instanceCount = count;
      // Cleared to zero: no shell, no hit.
      renderer.getClearColor(clearColor);
      const alpha = renderer.getClearAlpha(), auto = renderer.autoClear;
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
      renderer.setRenderTarget(hullTarget);
      renderer.render(hullScene, camera);
      const depth = renderer.state.buffers.depth;
      depth.setClear(0);
      renderer.setRenderTarget(hullEndTarget);
      renderer.render(hullEndScene, camera);
      depth.setClear(1);
      renderer.setClearColor(clearColor, alpha);
      renderer.autoClear = auto;
    }
    renderer.setRenderTarget(marchTarget);
    renderer.render(marchScene, camera);
    if (deferredPass) {
      renderer.setRenderTarget(deferredTarget);
      renderer.render(deferredScene, camera);
    }
    if (softPass) {
      renderer.setRenderTarget(softTarget);
      renderer.render(softScene, camera);
    }
    renderer.setRenderTarget(previous);
  }
  chooseSplit(); // vjw: the donor chooses on the first resize(), after the boot warm; ours compiles right after creation
  return {
    name, scene, camera, params, trails: false, edgeAA: true, grain: 0,
    pixelBudget: budget, ...(renderFloor ? { renderFloor } : {}), bloom: { strength: 0.16, gain: 0.16 },
    paramLabels: { '*': { shape: labels.shape, complexity: labels.complexity || 'detail', ...(labels.density !== undefined ? { density: labels.density } : {}), ...(labels.edge !== undefined ? { edge: labels.edge } : {}), fill: 'zoom', tilt: 'tilt' } },
    ...(labels.edge !== undefined ? { paramOrder: ['speed','shape','edge','complexity','density','fill','tilt'] } : {}),
    update(s, dt) {
      if (!(dt > 0) || !Number.isFinite(dt)) return;
      const h = Math.min(dt, 0.05);
      age += h;
      advanceFlight(motion, h, params.speed, (s.onKick || 0) * kickSurge, period);
      if (s.onKick > 0.55 && age-lastAccent > 3.2) {
        lastAccent=age; accentCount++;
        shapeOffset=(accentCount%2 ? 1 : -1)*0.07*s.onKick;
      }
      refresh(h);
      values.energy+=((s.energy ?? 0)-values.energy)*(1-Math.exp(-h*2.5));
      values.highs+=((s.highs ?? 0)-values.highs)*(1-Math.exp(-h*5));
      // A kick's flash for a surface that lights on the beat (spiral's
      // edges): jumps to the hit, fades over about a third of a second.
      values.kick=Math.max(values.kick*Math.exp(-h*7), s.onKick || 0);
      uniforms.uPhase.value=motion.phase;
      uniforms.uEnergy.value=values.energy;
      uniforms.uHighs.value=values.highs;
      uniforms.uKick.value=values.kick;
      marchFrame();
    },
    // The lab can adjust the view while paused without advancing the dive.
    refresh(dt) { refresh(dt); marchFrame(); },
    resize(w,h) { uniforms.uAspect.value=Math.max(w,1)/Math.max(h,1);uniforms.uResolution.value=Math.max(h,180);chooseSplit(); },
    debug() { return {...motion,...values,accentCount,shapeOffset,period}; },
  };
}
