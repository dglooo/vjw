// Copied from donor/vs3/visual_kit/src/scenes/crystal.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// A branching crystalline rosette. Faceted petals repeat at every scale.
import { createRecursiveFlight } from '../lib/recursive-flight.js';
export default function create() { // vjw

// Facet plane families, mirrored across all eight octants of each gem: the
// three corner and six edge families. The six finer (3,2,1) families and the
// nested carving were dropped for speed (2026-10-17, about 17 percent at
// heavy sliders); the cut slider still sets how deep these facets go.
const FACETS = [[2,1,1],[1,2,1],[1,1,2],[2,1,0],[1,2,0],[2,0,1],[1,0,2],[0,2,1],[0,1,2]];
const mixf = (a, b, t) => a + (b - a) * t;
// A gem of size factor s has half-axes uPetal*s. Every plane of the cut is
// dot(abs(p), n) - s*c with a unit normal n and offset c that depend only on
// the sliders, so they are solved here once instead of per pixel per step.
function deriveGem(values, u) {
  const shape = values.shape, cut = values.edge;
  const g = [mixf(0.60, 0.66, shape), mixf(0.13, 0.37, shape), mixf(0.18, 0.38, shape)];
  const plane = (w, offset) => { const l = Math.hypot(...w); return [w[0] / l, w[1] / l, w[2] / l, offset / l]; };
  const inv = g.map((v) => 1 / v);
  u.uPetal.value[0] = g[0]; u.uPetal.value[1] = g[1]; u.uPetal.value[2] = g[2];
  u.uOcta.value.splice(0, 4, ...plane(inv, 1));
  u.uCrown.value.splice(0, 4, ...plane([inv[0] * 0.5, inv[1] * 0.5, inv[2]], 0.70));
  const hl = Math.hypot(inv[0], inv[1]);
  u.uHole.value.splice(0, 3, inv[0] / hl, inv[1] / hl, 1 / hl);
  const radius = mixf(0.94, 0.60, Math.sqrt(Math.max(0, cut)));
  FACETS.forEach((dir, k) => {
    const n = plane([dir[0] * inv[0], dir[1] * inv[1], dir[2] * inv[2]], radius * Math.hypot(...dir));
    u.uFacetN.value[k * 3] = n[0]; u.uFacetN.value[k * 3 + 1] = n[1]; u.uFacetN.value[k * 3 + 2] = n[2];
    u.uFacetC.value[k] = n[3];
  });
  u.uGemMin.value = Math.min(...g);
}

// The uncut gem in units of its half-axes: octahedron, crown and box
// planes (dot(abs(p),n) <= c). Every other cut only removes material, so
// this one convex shell encloses the gem at every slider setting.
const SHELL = [[1, 1, 1, 1], [0.5, 0.5, 1, 0.7], [1, 0, 0, 0.82], [0, 1, 0, 0.82], [0, 0, 1, 0.58]];
// Its inradius: the shell holds a ball of this radius in these units.
const SHELL_INNER = Math.min(...SHELL.map(([x, y, z, c]) => c / Math.hypot(x, y, z)));
// With the facets at the cut's depth: radius is rounded up, so the shell
// stays outside the gem while the smoothed slider glides past it.
function shellTriangles(radius) {
  const planes = [];
  const families = [...SHELL, ...FACETS.map((d) => [...d, radius * Math.hypot(...d)])];
  for (const [x, y, z, c] of families) for (const sx of x ? [1, -1] : [1]) for (const sy of y ? [1, -1] : [1]) for (const sz of z ? [1, -1] : [1]) planes.push([x * sx, y * sy, z * sz, c]);
  const corner = (i) => [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1];
  let faces = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]].map((f) => f.map(corner));
  for (const [nx, ny, nz, c] of planes) {
    const side = (p) => nx * p[0] + ny * p[1] + nz * p[2] - c;
    const next = [], cap = [];
    for (const face of faces) {
      const kept = [];
      face.forEach((a, i) => {
        const b = face[(i + 1) % face.length], da = side(a), db = side(b);
        if (da <= 1e-9) kept.push(a);
        if (Math.abs(da) <= 1e-9) cap.push(a);
        if ((da < -1e-9 && db > 1e-9) || (da > 1e-9 && db < -1e-9)) {
          const t = da / (da - db), p = a.map((v, k) => v + (b[k] - v) * t);
          kept.push(p); cap.push(p);
        }
      });
      if (kept.length >= 3) next.push(kept);
    }
    const unique = cap.filter((p, i) => cap.findIndex((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-7) === i);
    if (unique.length >= 3) {
      const mid = [0, 1, 2].map((k) => unique.reduce((sum, p) => sum + p[k], 0) / unique.length);
      const u = unique[0].map((v, k) => v - mid[k]), n = [nx, ny, nz];
      const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
      const at = (p) => { const d = p.map((v, k) => v - mid[k]); return Math.atan2(d[0] * w[0] + d[1] * w[1] + d[2] * w[2], d[0] * u[0] + d[1] * u[1] + d[2] * u[2]); };
      next.push(unique.sort((a, b) => at(a) - at(b)));
    }
    faces = next;
  }
  const out = [];
  for (const face of faces) for (let i = 1; i + 1 < face.length; i++) out.push(...face[0], ...face[i], ...face[i + 1]);
  return out;
}
// One gem's centre in world space, as the vertex shader places it.
const turnBy = (a, x, y) => [Math.cos(a) * x + Math.sin(a) * y, -Math.sin(a) * x + Math.cos(a) * y];
function gemPlace(g, { angle, beta, offset, child, mirror }, pitch, scale, shift, theta) {
  let [x, y, z] = g;
  [x, z] = turnBy(-angle, x, z);
  if (child) { [x, y] = turnBy(-beta, x, y); x += offset[0]; y += offset[1]; z += offset[2]; }
  [x, z] = turnBy(-pitch, x, z); x += 1.22; z += 0.64;
  if (mirror) y = -y;
  x *= scale; y *= scale; z = z * scale - shift;
  [x, y] = turnBy(-theta, x, y);
  return [x, y, z];
}
function gemList(detail) {
  const mixf2 = (a, b, t) => a + (b - a) * t;
  const branch = Math.pow(detail, 0.7), fine = Math.min(1, Math.max(0, (detail - 0.24) / 0.76)), sfine = fine * fine * (3 - 2 * fine);
  const gems = [{ size: 1 - 0.28 * detail, angle: 0, beta: 0, offset: [0, 0, 0], child: false, mirror: false }];
  for (const mirror of [false, true]) {
    gems.push({ size: branch > 0.001 ? 0.68 * branch : 0, angle: -0.35, beta: mixf2(-0.38, -0.95, branch), offset: [0.18, mixf2(0.04, 0.29, branch), 0.07 * branch], child: true, mirror });
    gems.push({ size: sfine > 0.001 ? 0.44 * sfine : 0, angle: 0.45, beta: -0.62, offset: [0.38, mixf2(0.03, 0.19, sfine), 0], child: true, mirror });
    gems.push({ size: sfine > 0.001 ? 0.38 * sfine : 0, angle: -0.6, beta: 0.92, offset: [-0.28, mixf2(0.02, 0.25, sfine), 0.01], child: true, mirror });
  }
  return gems;
}
const PERIOD_C = Math.log(2.0);
const facetRadius = (cut) => Math.ceil(mixf(0.94, 0.60, Math.sqrt(Math.max(0, cut))) * 200) / 200;
let shellRadius = null;
const hulls = {
  // Room for the most faceted shell; each update draws only its own.
  positions: new Float32Array(6000 * 3),
  update(u, { ro, lens, resolution }) {
    const radius = facetRadius(u.uCut.value);
    const positions = radius === shellRadius ? null : shellTriangles(radius);
    shellRadius = radius;
    // The shell's inradius at size 1, in gem units: the nearest of its
    // planes, each dot(abs(p)/petal, n) <= c.
    const petal = u.uPetal.value;
    u.uShellInner.value = Math.min(...[...SHELL, ...FACETS.map((d) => [...d, radius * Math.hypot(...d)])]
      .map(([x, y, z, c]) => c / Math.hypot(x / petal[0], y / petal[1], z / petal[2])));
    const phase = u.uPhase.value, distance = Math.hypot(...ro);
    // Rings below the lowest octave drawn sit inside one shell round the
    // centre, about four pixels across, and march from there as before.
    const pixel = 2 * distance / (lens * resolution);
    const low = Math.floor((Math.log(4 * pixel) - phase) / PERIOD_C);
    const high = Math.ceil((Math.log(90) - phase) / PERIOD_C);
    u.uOctaveLo.value = low;
    // The camera inside a gem's shell: those rays must start at the camera.
    const widest = Math.max(...petal), pitch = mixf(-0.55, 0.58, u.uShape.value);
    const gems = gemList(u.uDetail.value);
    let inside = false;
    for (let n = Math.ceil((Math.log(distance / 2.2) - phase) / PERIOD_C); n <= high && !inside; n++) {
      const logBase = phase + n * PERIOD_C, base = Math.exp(logBase);
      if (0.3 * base > distance + 1) break;
      for (let crown = 0; crown < 2 && !inside; crown++) {
        const scale = crown ? base * 0.73 : base, logScale = crown ? logBase - 0.3147107448 : logBase, spin = crown ? 0.5235987756 : 0;
        for (let sector = 0; sector < 6 && !inside; sector++) {
          for (const gem of gems) {
            if (!gem.size) continue;
            const c = gemPlace([0, 0, 0], gem, pitch, scale, crown ? 0.18 * base : 0, logScale * 0.46 + spin + sector * 1.0471975512);
            if (Math.hypot(c[0] - ro[0], c[1] - ro[1], c[2] - ro[2]) < gem.size * scale * widest * 1.2 + 0.05) { inside = true; break; }
          }
        }
      }
    }
    return { count: 1 + 84 * (high - low + 1), inside, positions };
  },
  vertex: /* glsl */`
    uniform vec3 uPetal;
    uniform float uOctaveLo, uShellInner;
    float hullEps(float t,float lens) { return max(0.00012,t/(uResolution*lens)*0.52); }
    // crystalRing's transforms, inverted: gem coordinates to world.
    vec3 hullPlace(vec3 g,float angle,float beta,vec3 offset,bool child,bool mirror,float pitch,float scale,float shift,float theta) {
      g.xz=turn(-angle)*g.xz;
      if(child){g.xy=turn(-beta)*g.xy;g+=offset;}
      g.xz=turn(-pitch)*g.xz;g+=vec3(1.22,0.0,0.64);
      if(mirror)g.y=-g.y;
      g*=scale;g.z-=shift;
      g.xy=turn(-theta)*g.xy;
      return g;
    }
    // Shell 0 holds every ring below the lowest octave drawn. Then 84 an
    // octave: two crowns of six sectors, each the trunk and three
    // mirrored pairs of children.
    vec3 hullPoint(vec3 position,int instance,vec3 ro,float lens) {
      float low=exp(uPhase+uOctaveLo*PERIOD);
      if(instance==0) {
        // A ring of scale s lies within 2.07s of the centre, and the
        // rings below are at most half of low.
        float r=1.04*low;
        r+=2.5*hullEps(max(length(ro)-r,0.0)+2.0*r,lens);
        return position*(r/${SHELL_INNER.toFixed(6)});
      }
      int i=instance-1;
      int octave=i/84,crown=(i/42)%2,sector=(i/7)%6,gem=i%7;
      float logBase=uPhase+(uOctaveLo+float(octave))*PERIOD,base=exp(logBase);
      float scale=crown==0?base:base*0.73;
      float logScale=crown==0?logBase:logBase-0.3147107448;
      float theta=logScale*0.46+(crown==0?0.0:0.5235987756)+float(sector)*1.0471975512;
      float shift=crown==0?0.0:0.18*base;
      float branch=pow(uDetail,0.7),detail=smoothstep(0.24,1.0,uDetail);
      float size=1.0-0.28*uDetail,angle=0.0,beta=0.0;vec3 offset=vec3(0);
      if(gem>=5){size=detail>0.001?0.38*detail:0.0;angle=-0.6;offset=vec3(-0.28,mix(0.02,0.25,detail),0.01);beta=0.92;}
      else if(gem>=3){size=detail>0.001?0.44*detail:0.0;angle=0.45;offset=vec3(0.38,mix(0.03,0.19,detail),0.0);beta=-0.62;}
      else if(gem>=1){size=branch>0.001?0.68*branch:0.0;angle=-0.35;offset=vec3(0.18,mix(0.04,0.29,branch),0.07*branch);beta=mix(-0.38,-0.95,branch);}
      if(size==0.0)return vec3(0.0);
      bool child=gem>0,mirror=gem>0&&gem%2==0;
      float pitch=mix(-0.55,0.58,uShape);
      vec3 center=hullPlace(vec3(0),angle,beta,offset,child,mirror,pitch,scale,shift,theta);
      // Grow the shell past every point within the march's hit distance:
      // scaling by 1+m/inner moves each face out by at least m.
      float inner=uShellInner*size*scale;
      float reach=size*scale*max(uPetal.x,max(uPetal.y,uPetal.z));
      float margin=2.5*hullEps(distance(center,ro)+reach,lens);
      return hullPlace(position*uPetal*size*(1.0+margin/inner),angle,beta,offset,child,mirror,pitch,scale,shift,theta);
    }
  `,
};

const flight = createRecursiveFlight({
  name: 'crystal', period: Math.log(2.0),
  labels: { shape: 'bloom', complexity: 'branching', density: 'hollow', edge: 'complexity' },
  defaults: { shape: 0.64, complexity: 0.5, density: 0.0, fill: 0.44, tilt: 0.5, edge: 0.62 },
  cameraOffset: [0, 0], tiltRange: 1.04, framingRange: [0.5, 3.5], detailedMap: true, normalFootprint: true, limitedMap: true, softShadow: 4,
  // Both crowns' bounding spheres stay above 14.7 degrees below the plane
  // (sin 0.254); 0.3 keeps a margin.
  floor: 0.3,
  // Drawn at 30 percent fewer pixels than the other flights, with a floor
  // of its own so the cut also applies on large Retina panels, where the
  // app-wide floor would otherwise hold it at 0.4 of full resolution.
  budget: 0.875, renderFloor: 0.33,
  extraUniforms: {
    uPetal: { value: [0, 0, 0] }, uOcta: { value: [0, 0, 0, 0] }, uCrown: { value: [0, 0, 0, 0] }, uHole: { value: [0, 0, 0] },
    uFacetN: { value: new Float32Array(FACETS.length * 3) }, uFacetC: { value: new Float32Array(FACETS.length) },
    uGemMin: { value: 0.13 }, uOctaveLo: { value: 0 }, uShellInner: { value: 0.1 },
  },
  hulls, gradient: true,
  // The dive keeps the speed slider's rate through kicks: the surge read
  // as the speed lurching (Alec, 2026-10-18). Light and glow still react.
  kickSurge: 0,
  derive: deriveGem,
  surface: /* glsl */`
    vec3 reflected=reflect(rd,normal);
    float footprint=normalFootprint;
    float mirror=1.0-smoothstep(0.045,0.34,footprint);
    float fresnel=0.08+0.92*pow(1.0-front,4.0);
    vec3 mineral=mix(uMid,uAccent,0.32+0.3*sin(trap.x*3.0));
    mineral*=0.50/max(0.50,max(mineral.r,max(mineral.g,mineral.b)));
    vec3 glass=crystalLight(reflected,0.008+footprint*0.85);
    if(trap.y>0.9&&trap.w>eps*24.0&&mirror>0.01)glass=mix(glass,crystalReflection(p+normal*max(eps*8.0,trap.w*0.024),reflected,eps),mirror);
    vec3 transmitted=crystalLight(refract(rd,normal,0.66),0.01+footprint*0.34);
    // A cool clear coat and a deeper mineral body keep adjacent facets
    // distinct. Secondary points stay quieter than the broad petals.
    float bodyWeight=mix(0.82,1.0,trap.y);
    col=mineral*(0.045+0.27*diffuse*mix(0.25,1.0,shadow)+0.055*front)*ao*bodyWeight;
    col+=glass*(0.68+fresnel)*sqrt(ao);
    col+=transmitted*mix(mineral,uGlow*0.32,0.28)*0.48*ao;
    float glossPower=90.0/(1.0+160.0*footprint*footprint);
    float highlight=pow(max(dot(normal,normalize(key-rd)),0.0),glossPower)*glossPower/90.0;
    col+=uGlow*highlight*0.85*sqrt(ao)*shadow;
    col+=mix(uMid,uAccent,0.7)*pow(1.0-front,2.0)*0.12*sqrt(ao);
  `,
  geometry: /* glsl */`
    float crystalBand(float position,float sharpness,float footprint) {
      // Filter narrow light strips over the normal's pixel footprint.
      // This keeps tiny bevels from turning into sparkling dotted lines.
      float variance=1.0+sharpness*sharpness*footprint*footprint;
      return exp(-position*position*sharpness*sharpness/variance)/sqrt(variance);
    }
    vec3 crystalLight(vec3 ray,float footprint) {
      float window=crystalBand(ray.x+ray.y*0.36-0.28,10.0,footprint);
      float edge=crystalBand(ray.y-ray.z*0.62+0.34,18.0,footprint);
      float dome=pow(max(dot(ray,normalize(vec3(-0.6,0.9,0.7))),0.0),14.0);
      float lower=pow(max(dot(ray,normalize(vec3(0.7,-0.4,-0.5))),0.0),6.0);
      float strip=crystalBand(ray.x-ray.z*0.38+0.52,36.0,footprint)*smoothstep(-0.55,0.2,ray.y);
      return uShadow*0.16+uGlow*(window*0.86+dome*0.75+strip*0.5)+uAccent*(edge*0.72+lower*0.36);
    }
    vec3 crystalLight(vec3 ray) { return crystalLight(ray,0.008); }
    float polishedMax(float a,float b,float k) {
      float h=clamp(0.5+0.5*(a-b)/k,0.0,1.0);
      return mix(b,a,h)+k*h*(1.0-h);
    }
    uniform vec3 uPetal,uHole;
    uniform vec4 uOcta,uCrown;
    uniform vec3 uFacetN[9];
    uniform float uFacetC[9];
    uniform float uGemMin;
    // A gem of size factor s: half-axes uPetal*s. Each plane is
    // dot(abs(p),n)-s*c with n and c solved per frame from the sliders
    // (deriveGem), the same planes the inline normalization produced.
    float crystalGem(vec3 p,float s,float hollow,float limit) {
      vec3 a=abs(p);
      float d=dot(a,uOcta.xyz)-s*uOcta.w;
      // All following cuts remove material, so the uncut octahedron
      // can reject a gemstone when a nearer surface already exists.
      if(d>limit)return d;
      vec3 size=uPetal*s;
      float bevel=s*uGemMin*0.075;
      // A shallower crown above the pavilion adds a second tier of
      // gemstone facets without changing the petal's outline.
      d=polishedMax(d,dot(a,uCrown.xyz)-s*uCrown.w,bevel);
      d=polishedMax(d,a.x-size.x*0.82,bevel);
      d=polishedMax(d,a.y-size.y*0.82,bevel);
      d=polishedMax(d,a.z-size.z*0.58,bevel);
      if(uCut>0.0001) {
        float b=bevel*0.4;
        // Each family mirrors across all eight octants.
        d=polishedMax(d,dot(a,uFacetN[0])-s*uFacetC[0],b);
        d=polishedMax(d,dot(a,uFacetN[1])-s*uFacetC[1],b);
        d=polishedMax(d,dot(a,uFacetN[2])-s*uFacetC[2],b);
        d=polishedMax(d,dot(a,uFacetN[3])-s*uFacetC[3],b);
        d=polishedMax(d,dot(a,uFacetN[4])-s*uFacetC[4],b);
        d=polishedMax(d,dot(a,uFacetN[5])-s*uFacetC[5],b);
        d=polishedMax(d,dot(a,uFacetN[6])-s*uFacetC[6],b);
        d=polishedMax(d,dot(a,uFacetN[7])-s*uFacetC[7],b);
        d=polishedMax(d,dot(a,uFacetN[8])-s*uFacetC[8],b);
      }
      if(hollow<0.0001)return d;
      // A diamond aperture opens the complete gemstone, including its back.
      float aperture=dot(a.xy,uHole.xy)-hollow*s*uHole.z;
      return polishedMax(d,-aperture,bevel);
    }
    float crystalPetal(vec3 q,float size,float angle,float hollow,float limit) {
      q.xz=turn(angle)*q.xz;
      return crystalGem(q,size,hollow,limit);
    }
    float crystalRing(vec3 p,float scale,float logScale,float angle,float spin,bool marching,float limit,out vec4 trap) {
      // Physical scale gives the nesting a continuous spiral. Reindexing
      // the infinite scale sum therefore leaves the same geometry.
      float a=angle-logScale*0.46-spin;
      float sector=floor(a/1.0471975512+0.5);
      a-=sector*1.0471975512;
      float r=length(p.xy);
      vec3 q=vec3(r*cos(a),abs(r*sin(a)),p.z)/scale;
      // The rotated octahedron vertices enclose every branch below 0.675.
      // Keeping this sphere tight avoids marching through empty space.
      // Inside the range the gems' outlines are checked even while
      // marching: their tighter distance cut crystal's march from 45 to
      // 29 steps a pixel, which more than pays for the checks.
      float bound=(length(q-vec3(1.22,0.0,0.64))-0.69)*scale;
      if(bound>limit)return bound;
      float pitch=mix(-0.55,0.58,uShape);
      float aperture=uStructure*0.78;
      vec3 parent=q-vec3(1.22,0.0,0.64);parent.xz=turn(pitch)*parent.xz;
      float trunk=1.0-0.28*uDetail;
      // While marching, a gemstone farther than a few pixels returns its
      // uncut outline. Every cut removes material, so that outline is a
      // safe step, and the facets are only computed near the surface.
      // The final hit, normals, shading and shadows use the full gem.
      float near=marching?min(limit,max(0.0006,8.0/uResolution))/scale:limit/scale;
      float d=crystalPetal(parent,trunk,0.0,aperture,near);
      trap=vec4(logScale*0.19+0.08*cos(sector*1.0471975512),1.0,0.92,scale);
      // Fork the broad petals into mirrored sprays. Moving the children
      // outward while the trunk narrows exposes their full silhouettes.
      float branch=pow(uDetail,0.7);
      if(branch>0.001) {
        vec3 b=parent-vec3(0.18,mix(0.04,0.29,branch),0.07*branch);
        b.xy=turn(mix(-0.38,-0.95,branch))*b.xy;
        float child=crystalPetal(b,0.68*branch,-0.35,aperture,min(d,near));
        if(child<d){d=child;trap.y=0.7;trap.x+=0.13;}
      }
      {
        float detail=smoothstep(0.24,1.0,uDetail);
        if(detail>0.001) {
          vec3 b=parent-vec3(0.38,mix(0.03,0.19,detail),0.0);
          b.xy=turn(-0.62)*b.xy;
          float child=crystalPetal(b,0.44*detail,0.45,aperture,min(d,near));
          if(child<d){d=child;trap.y=0.5;trap.x+=0.29;}
          b=parent-vec3(-0.28,mix(0.02,0.25,detail),0.01);b.xy=turn(0.92)*b.xy;
          child=crystalPetal(b,0.38*detail,-0.6,aperture,min(d,near));
          if(child<d){d=child;trap.y=0.5;trap.x+=0.42;}
        }
      }
      return d*scale;
    }
    float crystalField(vec3 p,bool marching,float limit,out vec4 trap) {
      float radius=max(length(p),0.00001);
      float layer=floor((log(radius)-uPhase)/PERIOD);
      float logBase=uPhase+layer*PERIOD,base=exp(logBase),angle=atan(p.y,p.x);
      float d=limit;trap=vec4(0.0);
      for(int i=0;i<4;i++) {
        float index=i==0?0.0:i==1?1.0:i==2?-1.0:2.0;
        float s=base*(i==0?1.0:i==1?2.0:i==2?0.5:4.0),logScale=logBase+index*PERIOD;
        // The complete crown fits between these radial bounds.
        float bound=max(0.43*s-radius,radius-2.08*s);
        if(bound>d)continue;
        vec4 local;
        float f=crystalRing(p,s,logScale,angle,0.0,marching,d,local);
        if(f<d){d=f;trap=local;}
        vec3 q=p;q.z+=0.18*s;
        f=crystalRing(q,s*0.73,logScale-0.3147107448,angle,0.5235987756,marching,d,local);
        if(f<d){d=f;trap=local;trap.x+=0.18;}
      }
      return d;
    }
    float map(vec3 p,bool marching,float limit,out vec4 trap) {
      return crystalField(p,marching,limit,trap);
    }
    // The same field with its exact gradient, for the shading's normal.
    // Each step below mirrors the one above. Through polishedMax the
    // blend's own term cancels (a-b equals k(2h-1) wherever h is not
    // clamped), so the gradient is the same mix of the two gradients.
    void polishedMaxG(inout float d,inout vec3 g,float b,vec3 gb,float k) {
      float h=clamp(0.5+0.5*(d-b)/k,0.0,1.0);
      d=mix(b,d,h)+k*h*(1.0-h);
      g=mix(gb,g,h);
    }
    float crystalGemG(vec3 p,float s,float hollow,float limit,out vec3 g) {
      vec3 a=abs(p),flip=vec3(p.x<0.0?-1.0:1.0,p.y<0.0?-1.0:1.0,p.z<0.0?-1.0:1.0);
      // Gradients are taken in abs(p) and mirrored back at the end.
      float d=dot(a,uOcta.xyz)-s*uOcta.w;g=uOcta.xyz;
      if(d>limit){g*=flip;return d;}
      vec3 size=uPetal*s;
      float bevel=s*uGemMin*0.075;
      polishedMaxG(d,g,dot(a,uCrown.xyz)-s*uCrown.w,uCrown.xyz,bevel);
      polishedMaxG(d,g,a.x-size.x*0.82,vec3(1,0,0),bevel);
      polishedMaxG(d,g,a.y-size.y*0.82,vec3(0,1,0),bevel);
      polishedMaxG(d,g,a.z-size.z*0.58,vec3(0,0,1),bevel);
      if(uCut>0.0001) {
        float b=bevel*0.4;
        for(int k=0;k<9;k++)polishedMaxG(d,g,dot(a,uFacetN[k])-s*uFacetC[k],uFacetN[k],b);
      }
      if(hollow>=0.0001)polishedMaxG(d,g,hollow*s*uHole.z-dot(a.xy,uHole.xy),-vec3(uHole.xy,0.0),bevel);
      g*=flip;
      return d;
    }
    float crystalPetalG(vec3 q,float size,float angle,float hollow,float limit,out vec3 g) {
      q.xz=turn(angle)*q.xz;
      float d=crystalGemG(q,size,hollow,limit,g);
      g.xz=turn(-angle)*g.xz;
      return d;
    }
    float crystalRingG(vec3 p,float scale,float logScale,float angle,float spin,float limit,out vec4 trap,out vec3 g) {
      float a=angle-logScale*0.46-spin;
      float sector=floor(a/1.0471975512+0.5);
      a-=sector*1.0471975512;
      float r=length(p.xy);
      vec3 q=vec3(r*cos(a),abs(r*sin(a)),p.z)/scale;
      float bound=(length(q-vec3(1.22,0.0,0.64))-0.69)*scale;
      g=vec3(0,0,1);
      if(bound>limit)return bound;
      float pitch=mix(-0.55,0.58,uShape);
      float aperture=uStructure*0.78;
      vec3 parent=q-vec3(1.22,0.0,0.64);parent.xz=turn(pitch)*parent.xz;
      float trunk=1.0-0.28*uDetail;
      float near=limit/scale;
      vec3 gp,gc;
      float d=crystalPetalG(parent,trunk,0.0,aperture,near,gp);
      trap=vec4(logScale*0.19+0.08*cos(sector*1.0471975512),1.0,0.92,scale);
      float branch=pow(uDetail,0.7);
      if(branch>0.001) {
        vec3 b=parent-vec3(0.18,mix(0.04,0.29,branch),0.07*branch);
        float turnB=mix(-0.38,-0.95,branch);
        b.xy=turn(turnB)*b.xy;
        float child=crystalPetalG(b,0.68*branch,-0.35,aperture,min(d,near),gc);
        if(child<d){d=child;gp=vec3(turn(-turnB)*gc.xy,gc.z);trap.y=0.7;trap.x+=0.13;}
      }
      {
        float detail=smoothstep(0.24,1.0,uDetail);
        if(detail>0.001) {
          vec3 b=parent-vec3(0.38,mix(0.03,0.19,detail),0.0);
          b.xy=turn(-0.62)*b.xy;
          float child=crystalPetalG(b,0.44*detail,0.45,aperture,min(d,near),gc);
          if(child<d){d=child;gp=vec3(turn(0.62)*gc.xy,gc.z);trap.y=0.5;trap.x+=0.29;}
          b=parent-vec3(-0.28,mix(0.02,0.25,detail),0.01);b.xy=turn(0.92)*b.xy;
          child=crystalPetalG(b,0.38*detail,-0.6,aperture,min(d,near),gc);
          if(child<d){d=child;gp=vec3(turn(-0.92)*gc.xy,gc.z);trap.y=0.5;trap.x+=0.42;}
        }
      }
      // Back through the pitch, the sector's mirror fold and its turn.
      gp.xz=turn(-pitch)*gp.xz;
      if(sin(a)<0.0)gp.y=-gp.y;
      g=vec3(turn(-(logScale*0.46+spin+sector*1.0471975512))*gp.xy,gp.z);
      return d*scale;
    }
    float mapGradient(vec3 p,float limit,out vec4 trap,out vec3 grad) {
      float radius=max(length(p),0.00001);
      float layer=floor((log(radius)-uPhase)/PERIOD);
      float logBase=uPhase+layer*PERIOD,base=exp(logBase),angle=atan(p.y,p.x);
      float d=limit;trap=vec4(0.0);grad=vec3(0,0,1);
      for(int i=0;i<4;i++) {
        float index=i==0?0.0:i==1?1.0:i==2?-1.0:2.0;
        float s=base*(i==0?1.0:i==1?2.0:i==2?0.5:4.0),logScale=logBase+index*PERIOD;
        float bound=max(0.43*s-radius,radius-2.08*s);
        if(bound>d)continue;
        vec4 local;vec3 g;
        float f=crystalRingG(p,s,logScale,angle,0.0,d,local,g);
        if(f<d){d=f;trap=local;grad=g;}
        vec3 q=p;q.z+=0.18*s;
        f=crystalRingG(q,s*0.73,logScale-0.3147107448,angle,0.5235987756,d,local,g);
        if(f<d){d=f;trap=local;trap.x+=0.18;grad=g;}
      }
      return d;
    }
    bool gemSlab(vec3 o,vec3 v,vec3 n,float width,inout vec2 span,inout vec3 entryN,inout vec3 exitN) {
      float dv=dot(n,v),offset=dot(n,o);
      if(abs(dv)<0.000001)return abs(offset)<=width;
      float middle=-offset/dv,halfWidth=width/abs(dv);
      float a=middle-halfWidth,b=middle+halfWidth;
      vec3 face=n*sign(dv);
      if(a>span.x){span.x=a;entryN=-face;}
      if(b<span.y){span.y=b;exitN=face;}
      return span.x<span.y;
    }
    bool gemHit(vec3 o,vec3 ray,vec3 size,float aperture,float limit,out float t,out vec3 normal) {
      vec3 inv=1.0/size,enter=vec3(0),leave=vec3(0);vec2 span=vec2(-10000,10000);
      if(!gemSlab(o,ray,inv,1.0,span,enter,leave))return false;
      if(!gemSlab(o,ray,inv*vec3(-1,1,1),1.0,span,enter,leave))return false;
      if(!gemSlab(o,ray,inv*vec3(1,-1,1),1.0,span,enter,leave))return false;
      if(!gemSlab(o,ray,inv*vec3(1,1,-1),1.0,span,enter,leave))return false;
      if(span.x>limit)return false;
      vec3 crown=inv*vec3(0.5,0.5,1.0);
      if(!gemSlab(o,ray,crown,0.70,span,enter,leave))return false;
      if(!gemSlab(o,ray,crown*vec3(-1,1,1),0.70,span,enter,leave))return false;
      if(!gemSlab(o,ray,crown*vec3(1,-1,1),0.70,span,enter,leave))return false;
      if(!gemSlab(o,ray,crown*vec3(1,1,-1),0.70,span,enter,leave))return false;
      if(!gemSlab(o,ray,vec3(1,0,0),size.x*0.82,span,enter,leave))return false;
      if(!gemSlab(o,ray,vec3(0,1,0),size.y*0.82,span,enter,leave))return false;
      if(!gemSlab(o,ray,vec3(0,0,1),size.z*0.58,span,enter,leave))return false;
      t=span.x>0.0001?span.x:span.y;normal=span.x>0.0001?enter:leave;
      if(t<0.0001)return false;
      if(aperture>0.0001) {
        vec2 hole=vec2(-10000,10000);vec3 hn=vec3(0),hx=vec3(0);
        bool crosses=gemSlab(o,ray,vec3(inv.xy,0),aperture,hole,hn,hx);
        crosses=crosses&&gemSlab(o,ray,vec3(inv.x,-inv.y,0),aperture,hole,hn,hx);
        if(crosses&&t>hole.x-0.0001&&t<hole.y+0.0001) {
          t=hole.y;normal=-hx;if(t>=span.y||t<0.0001)return false;
        }
      }
      normal=normalize(normal);return true;
    }
    vec3 crystalReflection(vec3 origin,vec3 ray,float pixel) {
      float layer=floor((log(max(length(origin),0.001))-uPhase)/PERIOD);
      float closest=100.0,pitch=mix(-0.55,0.58,uShape);
      vec3 size=vec3(mix(0.60,0.66,uShape),mix(0.13,0.37,uShape),mix(0.18,0.38,uShape))*(1.0-0.28*uDetail);
      vec3 hitNormal=vec3(0);float hitScale=0.0;
      float rootLog=uPhase+layer*PERIOD,rootScale=exp(rootLog);
      mat2 pitchIn=turn(pitch),pitchOut=turn(-pitch);
      mat2 sectorStep=mat2(0.5,-0.8660254038,0.8660254038,0.5);
      // Each ring's orientation is the root's turned by a fixed angle, so
      // one rotation is solved here and the rest are constant products.
      mat2 rootTurn=turn(rootLog*0.46);
      const mat2 RING00=mat2(1.000000000,-0.000000000,0.000000000,1.000000000);
      const mat2 RING01=mat2(0.929097299,-0.369835381,0.369835381,0.929097299);
      const mat2 RING10=mat2(0.949597262,0.313472551,-0.313472551,0.949597262);
      const mat2 RING11=mat2(0.998201491,-0.059948165,0.059948165,0.998201491);
      const mat2 RING20=mat2(0.949597262,-0.313472551,0.313472551,0.949597262);
      const mat2 RING21=mat2(0.766335011,-0.642441166,0.642441166,0.766335011);
      const mat2 RING30=mat2(0.803469920,0.595345352,-0.595345352,0.803469920);
      const mat2 RING31=mat2(0.966681507,0.255982155,-0.255982155,0.966681507);
      for(int k=0;k<4;k++) {
        float base=rootScale*(k==0?1.0:k==1?0.5:k==2?2.0:0.25);
        for(int crown=0;crown<2;crown++) {
          float scale=base*(crown==0?1.0:0.73);
          vec3 position=origin;if(crown==1)position.z+=0.18*base;
          mat2 orientation=rootTurn*(k==0?(crown==0?RING00:RING01):k==1?(crown==0?RING10:RING11):k==2?(crown==0?RING20:RING21):(crown==0?RING30:RING31));
          vec3 ringOrigin=position/scale,ringRay=ray;
          // All six sector spheres lie within one sphere round the ring's
          // axis. A ray that misses it, or meets it beyond the nearest
          // hit, cannot reach any of the six gems.
          {
            vec3 o=ringOrigin-vec3(0.0,0.0,0.64);
            float along=-dot(o,ringRay),reach=1.22+size.x;
            if(dot(o,o)-along*along>reach*reach||along+reach<0.0||along-reach>=closest/scale)continue;
          }
          ringOrigin.xy=orientation*ringOrigin.xy;ringRay.xy=orientation*ringRay.xy;
          for(int sector=0;sector<6;sector++) {
            vec3 o=ringOrigin-vec3(1.22,0,0.64),v=ringRay;
            // Sphere rejection is rotation invariant. Test it before
            // constructing the tilted gemstone and its facet intervals.
            float along=-dot(o,v),radius=size.x;
            if(dot(o,o)-along*along<=radius*radius&&along+radius>0.0&&along-radius<closest/scale) {
              o.xz=pitchIn*o.xz;v.xz=pitchIn*v.xz;
              float distance;vec3 normal;
              if(gemHit(o,v,size,uStructure*0.78,closest/scale,distance,normal)&&distance*scale<closest&&distance*scale>pixel*5.0) {
                closest=distance*scale;normal.xz=pitchOut*normal.xz;
                // The inverse of this orthogonal rotation is its transpose.
                normal.xy=vec2(dot(orientation[0],normal.xy),dot(orientation[1],normal.xy));
                hitNormal=normal;hitScale=scale;
              }
            }
            ringOrigin.xy=sectorStep*ringOrigin.xy;ringRay.xy=sectorStep*ringRay.xy;
            orientation=sectorStep*orientation;
          }
        }
      }
      if(hitScale==0.0)return crystalLight(ray);
      float light=max(dot(hitNormal,normalize(vec3(-0.6,0.9,1.1))),0.0);
      vec3 body=mix(uMid,uAccent,0.5+0.35*sin(log(hitScale)*0.6));
      return body*(0.06+light*0.30)+crystalLight(reflect(ray,hitNormal))*0.74;
    }
  `,
});
// Literal metadata for the site hero bundler, then the built scene.
const crystal = {name: 'crystal',params: {speed: 0.5,shape: 0.64,complexity: 0.5,fill: 0.44,tilt: 0.5,density: 0,edge: 0.62},paramLabels: {'*':{shape: 'bloom',complexity: 'branching',density: 'hollow',edge: 'complexity',fill: 'zoom',tilt: 'tilt'}},paramOrder: ['speed','shape','edge','complexity','density','fill','tilt']};
Object.assign(crystal, flight);
return crystal; // vjw: was `export default crystal;`
} // vjw: the factory
