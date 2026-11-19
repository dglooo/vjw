// Copied from donor/vs3/visual_kit/src/scenes/pearl.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// A scale-periodic packing on a cone. Six large pearls per ring touch
// their neighbours and the half-turned next ring at full packing.
// Smaller pearls fill the triangular gaps using tangent-circle solutions.
import { createRecursiveFlight } from '../lib/recursive-flight.js';
export default function create() { // vjw

const PERIOD_P = 0.8115340599161882;
// Every bead of one scale, in the ring's own frame before the hexagonal
// fold: centre, height, radius and which slider grows it. The gap frame
// is the fold turned by 30 degrees. Flutes and the bore only remove
// material, so each bead's sphere encloses it at every setting.
const BEADS = [
  // [x, y, gap frame, z, radius, grows with: 0 packing, 1 nesting parent, 2 nesting child]
  [1, 0, 0, 0.55, 0.5, 0],
  [0.66928123, 0, 1, 0.40742465, 0.05591006, 1],
  [0.51391240, 0, 0, 0.30850687, 0.04277075, 1],
  [0.73517385, 0, 1, 0.45517530, 0.02546537, 2],
  [0.63435648, 0.06413385, 1, 0.38211559, 0.02137795, 2],
  [0.46134131, 0, 0, 0.28238903, 0.01593072, 2],
  [0.53856511, 0.05428523, 0, 0.32075458, 0.01809508, 2],
];
// Six turns of each, and its mirror when it sits off the fold's axis.
const BEAD_LIST = [];
for (const [x, y, gap, z, r, grow] of BEADS) {
  for (const mirror of y ? [1, -1] : [1]) for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3 + (gap ? Math.PI / 6 : 0);
    const c = Math.cos(a), sn = Math.sin(a), yy = y * mirror;
    BEAD_LIST.push([c * x - sn * yy, sn * x + c * yy, z, r, grow]);
  }
}
const PER_SCALE = BEAD_LIST.length;
// An icosphere scaled out until its faces clear the unit sphere.
function shellSphere() {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map((v) => { const l = Math.hypot(...v); return v.map((c) => c / l); });
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const mid = new Map();
  const half = (a, b) => {
    const key = a < b ? a + ',' + b : b + ',' + a;
    if (!mid.has(key)) { const v = verts[a].map((c, k) => c + verts[b][k]), l = Math.hypot(...v); verts.push(v.map((c) => c / l)); mid.set(key, verts.length - 1); }
    return mid.get(key);
  };
  faces = faces.flatMap(([a, b, c]) => { const ab = half(a, b), bc = half(b, c), ca = half(c, a); return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]; });
  // The nearest face plane to the centre sets how far to scale out.
  let inner = 1;
  for (const [a, b, c] of faces) {
    const [p, q, r] = [verts[a], verts[b], verts[c]];
    const u = q.map((v, k) => v - p[k]), w = r.map((v, k) => v - p[k]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    inner = Math.min(inner, Math.abs(n[0] * p[0] + n[1] * p[1] + n[2] * p[2]) / Math.hypot(...n));
  }
  return new Float32Array(faces.flatMap((f) => f.flatMap((i) => verts[i].map((c) => c / inner))));
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hulls = {
  positions: shellSphere(),
  update(u, { ro, lens, resolution }) {
    const phase = u.uPhase.value, distance = Math.hypot(...ro);
    // Scales below the lowest drawn sit inside one shell round the
    // centre, about four pixels across, and march from there as before.
    const pixel = 2 * distance / (lens * resolution);
    const low = Math.floor((Math.log(4 * pixel / 0.733) - phase) / PERIOD_P);
    const high = Math.ceil((Math.log(64) - phase) / PERIOD_P);
    u.uScaleLo.value = low;
    // The camera inside a bead: those rays must start at the camera.
    const amount = 0.7 + 0.3 * u.uShape.value, detail = u.uDetail.value;
    const grows = [amount, smooth(0, 0.56, detail) * amount, smooth(0.28, 1, detail) * amount];
    let inside = false;
    for (let n = Math.ceil((Math.log(distance / 1.7) - phase) / PERIOD_P); n <= high && !inside; n++) {
      const logS = phase + n * PERIOD_P, scale = Math.exp(logS);
      if (0.5 * scale > distance + 1) break;
      const a = -(logS * 0.64519630347 + 0.25), c = Math.cos(a), sn = Math.sin(a);
      for (const [x, y, z, r, grow] of BEAD_LIST) {
        // turn(-a) applied to the ring frame, as hullPoint does.
        const wx = (c * x + sn * y) * scale, wy = (-sn * x + c * y) * scale, wz = z * scale;
        if (Math.hypot(wx - ro[0], wy - ro[1], wz - ro[2]) < r * grows[grow] * scale * 1.2 + 0.05) { inside = true; break; }
      }
    }
    return { count: 1 + PER_SCALE * (high - low + 1), inside };
  },
  varyings: 'flat varying vec4 vSphere;',
  span: /* glsl */`
    bool hullSpan(vec3 ro,vec3 rd,out vec2 span) {
      vec3 o=ro-vSphere.xyz;
      float b=dot(o,rd),disc=b*b-dot(o,o)+vSphere.w*vSphere.w;
      if(disc<=0.0)return false;
      disc=sqrt(disc);span=vec2(-b-disc,-b+disc);
      return span.y>0.0;
    }
  `,
  vertex: /* glsl */`
    uniform float uScaleLo;
    const vec4 BEADS[${PER_SCALE}]=vec4[](${BEAD_LIST.map(([x, y, z, r]) => `vec4(${x.toFixed(8)},${y.toFixed(8)},${z.toFixed(8)},${r.toFixed(8)})`).join(',')});
    float hullEps(float t,float lens) { return max(0.00012,t/(uResolution*lens)*0.52); }
    // Shell 0 holds every scale below the lowest drawn; then ${PER_SCALE} beads
    // a scale, placed exactly as map() folds them.
    vec3 hullPoint(vec3 position,int instance,vec3 ro,float lens) {
      float low=exp(uPhase+uScaleLo*PERIOD);
      if(instance==0) {
        // A scale s reaches 1.65s from the centre; the ones below are at
        // most low/2.2514.
        float r=0.733*low;
        r+=2.5*hullEps(max(length(ro)-r,0.0)+2.0*r,lens);
        vSphere=vec4(0.0,0.0,0.0,r);
        return position*r;
      }
      int i=instance-1,scaleIndex=i/${PER_SCALE},bead=i%${PER_SCALE};
      float logS=uPhase+(uScaleLo+float(scaleIndex))*PERIOD,s=exp(logS);
      vec4 b=BEADS[bead];
      float amount=mix(0.70,1.0,uShape);
      float grow=bead<6?amount:bead<${6 + 6 + 6}?smoothstep(0.0,0.56,uDetail)*amount:smoothstep(0.28,1.0,uDetail)*amount;
      float radius=b.w*grow*s;
      vSphere=vec4(0.0);
      if(radius<=0.0)return vec3(0.0);
      vec3 center=vec3(turn(-(logS*0.64519630347+0.25))*b.xy,b.z)*s;
      radius+=2.5*hullEps(distance(center,ro)+radius,lens);
      vSphere=vec4(center,radius);
      return center+position*radius;
    }
  `,
};

const flight = createRecursiveFlight({
  name: 'pearl', period: 0.8115340599161882, labels: { shape: 'packing', complexity: 'nesting', density: 'bore', edge: 'complexity' },
  // The dive keeps the speed slider's rate through kicks, as crystal
  // does (Alec, 2026-10-18). Light and glow still react.
  kickSurge: 0,
  // 30 percent fewer pixels, with its own floor, as crystal (Alec
  // approved the trade there, 2026-10-17).
  budget: 0.875, renderFloor: 0.33,
  hulls,
  extraUniforms: { uScaleLo: { value: 0 } },
  defaults: { shape: 0.94, complexity: 0.78, density: 0, fill: 0.42, edge: 0.48 },
  cameraOffset: [0.075, 0.025], tiltRange: 0.24, limitedMap: true, softShadow: 4,
  // Every bead sits above the plane (the lowest, the main bead, at 2.8
  // degrees seen from the centre).
  floor: 0,
  // The reflection traces its own pass: inline it held the rest of the
  // shading at lower occupancy (about 3 ms of a 22 ms frame).
  deferred: 'pearlReflection(p+normal*eps*6.0,reflect(rd,normal),eps)',
  surface: /* glsl */`
    col=pearlCoat(normal,rd,trap.w,deferred,ao,shadow);
  `,
  geometry: /* glsl */`
    // Neighbouring scales differ by a constant factor and a constant
    // turn, so one exp and one rotation are solved per evaluation.
    const float SCALE_STEP=2.2513590586;
    const mat2 TURN_STEP=mat2(0.8660254038,-0.5000000000,0.5000000000,0.8660254038);
    // Mirror folds into the hexagonal wedge between 0 and 30 degrees: the
    // same point the six-way angle fold and abs(y) produced, without atan,
    // cos or sin. Every mirror of the wedge belongs to the same symmetry.
    vec2 hexFold(vec2 p) {
      p=abs(p);
      p-=2.0*max(dot(p,vec2(-0.8660254038,0.5)),0.0)*vec2(-0.8660254038,0.5);
      p-=2.0*max(dot(p,vec2(-0.5,0.8660254038)),0.0)*vec2(-0.5,0.8660254038);
      return p;
    }
    // The same for eight-way symmetry: the wedge between 0 and 22.5 degrees.
    vec2 octFold(vec2 p) {
      p=abs(p);
      if(p.y>p.x)p=p.yx;
      p-=2.0*max(dot(p,vec2(-0.3826834324,0.9238795325)),0.0)*vec2(-0.3826834324,0.9238795325);
      return p;
    }
    vec3 pearlLocal(vec3 p,vec2 center) {
      return vec3(dot(center,p.xy),dot(vec2(-center.y,center.x),p.xy),p.z);
    }
    float pearlForm(vec3 p,float radius) {
      float sphere=length(p)-radius;
      float d=sphere;
      if(uCut>0.001&&radius>0.00001&&sphere<radius*0.285*uCut) {
        // Round flutes cut into the original sphere, keeping the packing
        // and clear camera path. Finer grooves arrive later in the range.
        // Eight broad flutes at multiples of 45 degrees: in the folded
        // wedge the nearest one lies along the x axis.
        float radial=length(p.xy);
        vec2 w=octFold(p.xy);
        vec2 flute=w-vec2(radius*1.025,0.0);
        d=max(d,radius*0.285*uCut-length(flute));
        float detail=smoothstep(0.28,1.0,uCut);
        // Sixteen fine flutes centred between them, at 11.25 degrees in
        // the wedge.
        flute=w-radius*1.012*vec2(0.9807852804,0.1950903220);
        d=max(d,radius*0.075*detail-length(flute));
        // Paired latitude channels divide the ribs into nacre panels.
        vec2 latitude=vec2(radial-radius*0.947,abs(p.z)-radius*0.36);
        d=max(d,radius*0.108*detail-length(latitude));
      }
      if(uStructure<0.001)return d;
      return max(d,radius*uStructure*0.88-length(p.xy));
    }
    float pearlBounded(vec3 p,float radius,float limit) {
      float sphere=length(p)-radius;
      // Every groove and bore removes material. A sphere already farther
      // than the closest surface cannot contribute, even after sculpting.
      if(sphere>limit)return sphere;
      return pearlForm(p,radius);
    }
    float packing(vec3 p,float limit,out vec2 info) {
      float amount=mix(0.70,1.0,uShape);
      // The gap frame is the same fold turned by 30 degrees.
      vec2 q=hexFold(p.xy),gap=hexFold(mat2(0.8660254038,-0.5,0.5,0.8660254038)*p.xy);
      float d=pearlBounded(vec3(q-vec2(1.0,0.0),p.z-0.55),0.5*amount,limit);
      float parent=smoothstep(0.0,0.56,uDetail)*amount;
      float child=smoothstep(0.28,1.0,uDetail)*amount;
      // Two gap orientations, each with a central pearl and three
      // smaller neighbours. Mirroring supplies each off-axis pair.
      float nearest=min(d,limit);
      float small=pearlBounded(vec3(gap,p.z)-vec3(0.66928123,0,0.40742465),0.05591006*parent,nearest);
      small=min(small,pearlBounded(vec3(q,p.z)-vec3(0.51391240,0,0.30850687),0.04277075*parent,min(small,nearest)));
      nearest=min(nearest,small);
      float tiny=pearlBounded(vec3(gap,p.z)-vec3(0.73517385,0,0.45517530),0.02546537*child,nearest);
      tiny=min(tiny,pearlBounded(vec3(gap,p.z)-vec3(0.63435648,0.06413385,0.38211559),0.02137795*child,min(tiny,nearest)));
      tiny=min(tiny,pearlBounded(vec3(q,p.z)-vec3(0.46134131,0,0.28238903),0.01593072*child,min(tiny,nearest)));
      tiny=min(tiny,pearlBounded(vec3(q,p.z)-vec3(0.53856511,0.05428523,0.32075458),0.01809508*child,min(tiny,nearest)));
      info=vec2(0.0,0.22);
      if(small<d){d=small;info=vec2(0.02,0.28);}
      if(tiny<d){d=tiny;info=vec2(0.035,0.32);}
      return d;
    }
    // Rectangular studio lights separate the clear reflective coat from
    // the soft nacre body. Their broad shoulders keep glints continuous.
    vec3 pearlStudio(vec3 ray) {
      vec3 light=normalize(vec3(-0.55,0.85,0.8));
      vec3 across=normalize(cross(light,vec3(0,1,0))),up=cross(across,light);
      float facing=max(dot(ray,light),0.001);
      vec2 uv=vec2(dot(ray,across),dot(ray,up))/facing;
      float box=(1.0-smoothstep(0.28,0.38,abs(uv.x)))
        *(1.0-smoothstep(0.62,0.78,abs(uv.y)))*smoothstep(0.0,0.1,dot(ray,light));
      float shoulder=exp(-dot(uv*vec2(1.7,1.0),uv*vec2(1.7,1.0)))*max(dot(ray,light),0.0);
      float rb=(ray.x+ray.y*0.28-0.6)*14.0;
      float ribbon=exp(-rb*rb);
      float floorGlow=pow(max(0.0,-ray.y),3.0);
      return uShadow*0.09+uMid*(0.018+floorGlow*0.13)
        +uAccent*ribbon*0.21+uGlow*(box*1.35+shoulder*0.13);
    }
    vec3 pearlCoat(vec3 normal,vec3 ray,float scale,vec3 reflection,float ao,float shadow) {
      float front=clamp(dot(normal,-ray),0.0,1.0);
      float fresnel=0.30+0.62*pow(1.0-front,4.0);
      float film=0.5+0.5*cos(front*6.0+log(max(scale,0.0001))*0.42);
      vec3 nacre=mix(uMid,uAccent,film);
      nacre*=0.40/max(0.40,max(nacre.r,max(nacre.g,nacre.b)));
      float lit=max(dot(normal,normalize(vec3(-0.6,0.9,1.1))),0.0);
      float contact=mix(0.32,1.0,ao);
      vec3 body=mix(nacre,uGlow*0.17,0.22)*(0.075+0.22*lit*mix(0.25,1.0,shadow)+0.05*front);
      vec3 coat=reflection*(0.50+fresnel*0.48);
      // Soft nacre underneath a clear reflective coat; the colored grazing
      // layer is view dependent and follows each real reflected sphere.
      coat+=nacre*pow(1.0-front,2.0)*0.20;
      return (body+coat)*contact;
    }
    // Sculpted pearls for a reflected ray: the sphere entries of all
    // thirty main pearls are cheap, the flute march inside one is not.
    // Only the three nearest entries are marched, nearest first, and each
    // only while it could still beat the hit found so far.
    bool pearlHitSculpted(vec3 origin,vec3 direction,float eps,out vec3 hitPoint,out vec3 hitNormal,out float hitScale) {
      float r=max(length(origin),0.00001);
      float base=floor((log(r)-uPhase)/PERIOD);
      float logS0=uPhase+(base-3.0)*PERIOD;
      float radius=0.5*mix(0.70,1.0,uShape);
      vec3 best0=vec3(100.0,0,0),best1=best0,best2=best0;
      float s=exp(logS0);
      mat2 rotation=turn(logS0*0.64519630347+0.25);
      for(int i=0;i<5;i++) {
        s*=SCALE_STEP;rotation=rotation*TURN_STEP;
        vec3 ro=origin/s,rd=direction;ro.xy=rotation*ro.xy;rd.xy=rotation*rd.xy;
        vec2 center=vec2(1,0);
        for(int j=0;j<6;j++) {
          vec3 offset=ro-vec3(center,0.55);
          float b=dot(offset,rd),disc=b*b-dot(offset,offset)+radius*radius;
          if(disc>0.0&&(-b+sqrt(disc))*s>eps*9.0) {
            vec3 entry=vec3(max(-b-sqrt(disc),eps*9.0/s)*s,float(i),float(j));
            if(entry.x<best0.x){best2=best1;best1=best0;best0=entry;}
            else if(entry.x<best1.x){best2=best1;best1=entry;}
            else if(entry.x<best2.x)best2=entry;
          }
          center=mat2(0.5,0.8660254,-0.8660254,0.5)*center;
        }
      }
      float nearest=100.0;hitPoint=origin;hitNormal=vec3(0,0,1);hitScale=1.0;
      for(int k=0;k<3;k++) {
        vec3 pick=k==0?best0:k==1?best1:best2;
        if(pick.x>=nearest)break;
        float logS=logS0+(pick.y+1.0)*PERIOD;
        s=exp(logS);rotation=turn(logS*0.64519630347+0.25);
        float a=pick.z*1.0471975512;
        vec2 center=vec2(cos(a),sin(a));
        vec3 ro=origin/s,rd=direction;ro.xy=rotation*ro.xy;rd.xy=rotation*rd.xy;
        vec3 offset=ro-vec3(center,0.55);
        float b=dot(offset,rd),disc=sqrt(max(b*b-dot(offset,offset)+radius*radius,0.0));
        float nearT=pick.x/s,farT=min(-b+disc,nearest/s);
        float tolerance=max(eps*0.65/s,radius*0.0003);
        vec3 localOrigin=pearlLocal(offset,center),localRay=pearlLocal(rd,center);
        for(int step=0;step<48;step++) {
          if(nearT>=farT)break;
          vec3 point=localOrigin+localRay*nearT;
          float distance=pearlForm(point,radius);
          if(distance<tolerance) {
            nearest=nearT*s;hitScale=s;
            vec2 e=vec2(1,-1)*max(tolerance*1.5,radius*0.0005)*0.57735;
            hitNormal=normalize(e.xyy*pearlForm(point+e.xyy,radius)+e.yyx*pearlForm(point+e.yyx,radius)
              +e.yxy*pearlForm(point+e.yxy,radius)+e.xxx*pearlForm(point+e.xxx,radius));
            hitNormal.xy=vec2(center.x*hitNormal.x-center.y*hitNormal.y,center.y*hitNormal.x+center.x*hitNormal.y);
            hitNormal.xy=vec2(dot(rotation[0],hitNormal.xy),dot(rotation[1],hitNormal.xy));
            break;
          }
          nearT+=max(distance*0.9,tolerance*0.4);
        }
      }
      hitPoint=origin+direction*nearest;
      return nearest<99.0;
    }
    bool pearlHit(vec3 origin,vec3 direction,float eps,bool sculpted,out vec3 hitPoint,out vec3 hitNormal,out float hitScale) {
      if(sculpted)return pearlHitSculpted(origin,direction,eps,hitPoint,hitNormal,hitScale);
      float r=max(length(origin),0.00001);
      float base=floor((log(r)-uPhase)/PERIOD);
      float nearest=100.0;hitPoint=origin;hitNormal=vec3(0,0,1);hitScale=1.0;
      float logS=uPhase+(base-3.0)*PERIOD,s=exp(logS);
      mat2 rotation=turn(logS*0.64519630347+0.25);
      for(int i=-2;i<=2;i++) {
        s*=SCALE_STEP;rotation=rotation*TURN_STEP;
        vec3 ro=origin/s,rd=direction;ro.xy=rotation*ro.xy;rd.xy=rotation*rd.xy;
        vec2 center=vec2(1,0);
        float radius=0.5*mix(0.70,1.0,uShape);
        for(int j=0;j<6;j++) {
          vec3 offset=ro-vec3(center,0.55);
          float b=dot(offset,rd),c=dot(offset,offset)-radius*radius;
          float disc=b*b-c;
          // Sculpted pearls use the same conservative field as the main
          // ray, bounded by the enclosing sphere's analytic interval.
          if(sculpted) {
            if(disc>0.0) {
              float nearT=max(-b-sqrt(disc),eps*9.0/s);
              float farT=min(-b+sqrt(disc),nearest/s);
              float tolerance=max(eps*0.65/s,radius*0.0003);
              vec3 localOrigin=pearlLocal(offset,center),localRay=pearlLocal(rd,center);
              for(int step=0;step<48;step++) {
                if(nearT>=farT)break;
                vec3 point=localOrigin+localRay*nearT;
                float distance=pearlForm(point,radius);
                if(distance<tolerance) {
                  nearest=nearT*s;hitScale=s;
                  vec2 e=vec2(1,-1)*max(tolerance*1.5,radius*0.0005)*0.57735;
                  hitNormal=normalize(e.xyy*pearlForm(point+e.xyy,radius)+e.yyx*pearlForm(point+e.yyx,radius)
                    +e.yxy*pearlForm(point+e.yxy,radius)+e.xxx*pearlForm(point+e.xxx,radius));
                  hitNormal.xy=vec2(center.x*hitNormal.x-center.y*hitNormal.y,center.y*hitNormal.x+center.x*hitNormal.y);
                  hitNormal.xy=vec2(dot(rotation[0],hitNormal.xy),dot(rotation[1],hitNormal.xy));
                  break;
                }
                nearT+=max(distance*0.9,tolerance*0.4);
              }
            }
            center=mat2(0.5,0.8660254,-0.8660254,0.5)*center;
            continue;
          }
          // Keep the original single-root path for solid pearls.
          if(uStructure<0.001) {
            float distance=(-b-sqrt(max(disc,0.0)))*s;
            if(disc>0.0&&distance>eps*9.0&&distance<nearest) {
              nearest=distance;hitScale=s;hitNormal=normalize(offset+rd*(distance/s));
              hitNormal.xy=vec2(rotation[0].x*hitNormal.x+rotation[0].y*hitNormal.y,
                rotation[1].x*hitNormal.x+rotation[1].y*hitNormal.y);
            }
            center=mat2(0.5,0.8660254,-0.8660254,0.5)*center;
            continue;
          }
          if(disc<=0.0){center=mat2(0.5,0.8660254,-0.8660254,0.5)*center;continue;}
          float bore=radius*uStructure*0.88;
          // Sphere minus a cylinder: test both sphere roots and both
          // bore roots. Reflections see the same open bead as the main ray.
          float a2=dot(rd.xy,rd.xy),b2=dot(offset.xy,rd.xy);
          float disc2=b2*b2-a2*(dot(offset.xy,offset.xy)-bore*bore);
          for(int root=0;root<4;root++) {
            if(root>=2&&(a2<0.000001||disc2<=0.0))continue;
            float signRoot=mod(float(root),2.0)*2.0-1.0;
            float distance=root<2?-b+signRoot*sqrt(max(disc,0.0)):
              (-b2+signRoot*sqrt(max(disc2,0.0)))/max(a2,0.000001);
            vec3 point=offset+rd*distance;
            bool valid=root<2?length(point.xy)>=bore:dot(point,point)<=radius*radius;
            if(valid&&distance*s>eps*9.0&&distance*s<nearest) {
              nearest=distance*s;hitScale=s;
              hitNormal=root<2?normalize(point):vec3(-normalize(point.xy),0.0);
              hitNormal.xy=vec2(rotation[0].x*hitNormal.x+rotation[0].y*hitNormal.y,
                rotation[1].x*hitNormal.x+rotation[1].y*hitNormal.y);
            }
          }
          center=mat2(0.5,0.8660254,-0.8660254,0.5)*center;
        }
      }
      hitPoint=origin+direction*nearest;
      return nearest<99.0;
    }
    // Two reflected bounces resolve worlds within worlds without running
    // the full distance field again. All hits use the real ring geometry.
    vec3 pearlMirror(vec3 origin,vec3 direction,float eps,bool sculpted) {
      vec3 firstPoint,firstNormal;float firstScale;
      if(!pearlHit(origin,direction,eps,sculpted,firstPoint,firstNormal,firstScale))return pearlStudio(direction);
      vec3 secondRay=reflect(direction,firstNormal);
      vec3 secondPoint,secondNormal;float secondScale;
      vec3 bounce=pearlStudio(secondRay);
      float secondaryEps=max(eps,firstScale*0.0005);
      // The second bounce is a reflection inside a reflection, a few pixels
      // of colored light. Plain spheres stand in for the sculpted pearls
      // there; tracing every flute twice cost more than the whole scene.
      if(pearlHit(firstPoint+firstNormal*secondaryEps*6.0,secondRay,secondaryEps,false,secondPoint,secondNormal,secondScale)) {
        bounce=pearlCoat(secondNormal,secondRay,secondScale,pearlStudio(reflect(secondRay,secondNormal)),1.0,1.0);
      }
      return pearlCoat(firstNormal,direction,firstScale,bounce,1.0,1.0);
    }
    vec3 pearlReflection(vec3 origin,vec3 direction,float eps) {
      // The detailed intersection has a finite pixel tolerance. Ease its
      // reflection in while the first flutes appear, avoiding a precision
      // jump when complexity leaves the original smooth-sphere endpoint.
      if(uCut<0.001)return pearlMirror(origin,direction,eps,false);
      if(uCut>0.18)return pearlMirror(origin,direction,eps,true);
      return mix(pearlMirror(origin,direction,eps,false),pearlMirror(origin,direction,eps,true),smoothstep(0.01,0.18,uCut));
    }
    float map(vec3 p,float limit,out vec4 trap) {
      float r=max(length(p),0.00001);
      float base=floor((log(r)-uPhase)/PERIOD);
      float d=limit;trap=vec4(0);
      float logS=uPhase+(base-2.0)*PERIOD,s=exp(logS);
      mat2 spin=turn(logS*0.64519630347+0.25);
      for(int i=-1;i<=2;i++) {
        s*=SCALE_STEP;spin=spin*TURN_STEP;
        float bound=max(r-s*1.65,s*0.52-r);
        // Cull only when an actual sphere is already closer. Returning
        // the radial bound as geometry produces bands in wide AO samples.
        if(bound>d)continue;
        vec3 q=p/s;
        q.xy=spin*q.xy;
        vec2 info;
        float n=packing(q,d/s,info)*s;
        if(n<d){d=n;trap=vec4(0.31+0.025*sin(log(s)*0.65)+info.x,0.0,info.y,s);}
      }
      return d;
    }`,
});
// Literal metadata for the site hero bundler, then the built scene.
const pearl = {name: 'pearl',params: {speed: 0.5,shape: 0.94,complexity: 0.78,fill: 0.42,tilt: 0.5,density: 0,edge: 0.48},paramLabels: {'*':{shape: 'packing',complexity: 'nesting',density: 'bore',edge: 'complexity',fill: 'zoom',tilt: 'tilt'}},paramOrder: ['speed','shape','edge','complexity','density','fill','tilt']};
Object.assign(pearl, flight);
return pearl; // vjw: was `export default pearl;`
} // vjw: the factory
