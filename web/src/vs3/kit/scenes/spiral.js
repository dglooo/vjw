// Copied from donor/vs3/visual_kit/src/scenes/spiral.js (the friends' engine, used with permission, 2026-11-19).
// vjw: wrapped in a factory (one scene object per layer); nothing else changed. agents/guides/guide_vs3_port.md
// Hollow, recursively carved hexagonal vaults wind toward the same origin.
// Physical scale determines rotation and materials across every phase wrap.
import { createRecursiveFlight } from '../lib/recursive-flight.js';
export default function create() { // vjw

const PERIOD_S = Math.log(1.8);
// Shells, all boxes: per scale the six sides of the vault wall, and the
// twelve helical ribs cut into eight straight pieces an octave. A cube of
// half-size 1 holds the unit ball, so every box is this cube stretched.
const RIB_PIECES = 8;
const PER_SCALE = 6 + 12 * RIB_PIECES;
const CUBE = new Float32Array([
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, -1, 1], [1, 1, 1], [-1, 1, 1], [1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
  [-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, -1, -1], [-1, 1, 1], [-1, 1, -1], [1, -1, 1], [1, -1, -1], [1, 1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
  [-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, 1], [1, 1, -1], [-1, 1, -1], [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, -1], [1, -1, 1], [-1, -1, 1],
].flat());
const hexagonJs = (x, y) => { x = Math.abs(x); y = Math.abs(y); return Math.max(x * 0.8660254 + y * 0.5, y) - 1; };
const hulls = {
  positions: CUBE,
  update(u, { ro, lens, resolution }) {
    const phase = u.uPhase.value, distance = Math.hypot(...ro);
    const pixel = 2 * distance / (lens * resolution);
    const low = Math.floor((Math.log(4 * pixel / 1.45) - phase) / PERIOD_S);
    const high = Math.ceil((Math.log(48) - phase) / PERIOD_S);
    u.uScaleLo.value = low;
    // The camera inside a wall or rib shell: march from the camera.
    const st = u.uStructure.value, twist = 0.1 + 1.65 * u.uShape.value;
    const T = 0.06 + 0.35 * st + 0.06, D = 0.055 + 0.36 * st + 0.06;
    let inside = ro[2] > 0 && Math.abs(Math.hypot(ro[0], ro[1]) - 1.4453 * ro[2]) < 0.12 * ro[2] + 0.05;
    for (let n = low; n <= high && !inside; n++) {
      const scale = Math.exp(phase + n * PERIOD_S), a = Math.log(scale) * twist;
      const x = (Math.cos(a) * ro[0] + Math.sin(a) * ro[1]) / scale, y = (-Math.sin(a) * ro[0] + Math.cos(a) * ro[1]) / scale; // turn(a), as map() frames a scale
      if (Math.abs(ro[2] / scale - 0.8) < D + 0.05 && Math.abs(hexagonJs(x, y)) < T + 0.05) inside = true;
    }
    return { count: 1 + PER_SCALE * (high - low + 1), inside };
  },
  vertex: /* glsl */`
    uniform float uScaleLo, uStructure;
    float hullEps(float t,float lens) { return max(0.00012,t/(uResolution*lens)*0.52); }
    // A rib's centre line at height z: radius 1.44532z, turned with the
    // twist, 2.97 degrees either side of each corner.
    vec3 ribAt(float z,float twist,float angle) {
      float a=log(z/0.8)*twist+angle;
      return vec3(1.44532*z*cos(a),1.44532*z*sin(a),z);
    }
    // Shell 0 holds every scale below the lowest drawn; then per scale the
    // six wall sides and twelve ribs of ${RIB_PIECES} pieces.
    vec3 hullPoint(vec3 position,int instance,vec3 ro,float lens) {
      float low=exp(uPhase+uScaleLo*PERIOD);
      if(instance==0) {
        // Walls of scale s stay within 2.1s, ribs below z=0.8s within 1.41s.
        float r=1.45*low;
        r+=2.5*hullEps(max(length(ro)-r,0.0)+2.0*r,lens);
        return position*r;
      }
      int i=instance-1,scaleIndex=i/${PER_SCALE},piece=i%${PER_SCALE};
      float logS=uPhase+(uScaleLo+float(scaleIndex))*PERIOD,s=exp(logS);
      float twist=mix(0.1,1.75,uShape);
      vec3 center,axisX,axisY,axisZ,extent;
      if(piece<6) {
        // One side of the hexagonal wall: its outer edge, the wall's
        // thickness and depth, plus the lips and rounding (0.02).
        float thickness=mix(0.06,0.41,uStructure)+0.02,depth=mix(0.055,0.415,uStructure)+0.02;
        float side=0.5235987756+float(piece)*1.0471975512+logS*twist;
        vec2 n=vec2(cos(side),sin(side));
        center=vec3(n*s,0.8*s);
        axisX=vec3(-n.y,n.x,0.0);axisY=vec3(n,0.0);axisZ=vec3(0,0,1);
        extent=vec3(0.57735*(1.0+thickness),thickness,depth)*s;
      } else {
        int rib=(piece-6)/${RIB_PIECES},k=(piece-6)%${RIB_PIECES};
        float angle=float(rib/2)*1.0471975512+(rib%2==0?0.05192:-0.05192);
        float z0=0.8*s*exp(PERIOD*float(k)/${RIB_PIECES}.0),z1=z0*exp(PERIOD/${RIB_PIECES}.0);
        vec3 a=ribAt(z0,twist,angle),b=ribAt(z1,twist,angle),m=ribAt(sqrt(z0*z1),twist,angle);
        axisZ=normalize(b-a);
        axisX=normalize(cross(axisZ,abs(axisZ.z)<0.9?vec3(0,0,1):vec3(1,0,0)));axisY=cross(axisZ,axisX);
        // The tube, plus twice the arc's bow off its chord.
        vec3 bow=m-0.5*(a+b);
        float r=0.032*z1+2.0*length(bow-dot(bow,axisZ)*axisZ);
        center=0.5*(a+b);
        extent=vec3(r,r,0.5*length(b-a)+r);
      }
      float margin=2.5*hullEps(distance(center,ro)+length(extent),lens);
      extent+=margin;
      return center+axisX*position.x*extent.x+axisY*position.y*extent.y+axisZ*position.z*extent.z;
    }
  `,
};

const flight = createRecursiveFlight({
  name: 'spiral', period: Math.log(1.8), labels: { shape: 'twist', complexity: 'carving', density: 'vault', edge: 'complexity' },
  defaults: { shape: 0.82, complexity: 0.68, density: 0.5, fill: 0.4, edge: 0.5 }, cameraZ: 4.5,
  cameraOffset: [0.115, 0.055], tiltRange: 0.36,
  // Soft shadows at one pixel in four, as crystal and pearl.
  softShadow: 4,
  // The dive keeps the speed slider's rate through kicks, as crystal
  // and pearl do (Alec, 2026-10-18); a kick surge read as stutter.
  kickSurge: 0,
  // The edges answer the music, not just the bloom on the brightest
  // patch (Alec, 2026-11-08: heat lit one part). The aperture lips and
  // the winding ribs glow with the energy and flash on the kick, every
  // silhouette edge catches the kick, and a thin ring of light marks
  // each seam where one vault meets the next smaller one.
  surface: /* glsl */`
          float lipRib=smoothstep(0.7,0.76,trap.z);
          float seamAt=fract((log(max(length(p),1e-5))-uPhase)/PERIOD);
          float seam=exp(-pow(min(seamAt,1.0-seamAt)*14.0,2.0));
          vec3 edgeLight=colorAt(trap.x+0.15);
          col+=edgeLight*lipRib*(0.06+0.22*uEnergy+0.55*uKick)*sqrt(ao);
          col+=edgeLight*rim*(0.05+0.5*uKick)*sqrt(ao);
          col+=uGlow*seam*(0.03+0.35*uKick)*sqrt(ao);`,
  // Fewer pixels than crystal, with its own floor (Alec approved the
  // trade there, 2026-10-17). 0.875 dropped one frame in nine at high
  // carving and vault on a 60 Hz monitor; 0.7 halved that (2026-11-08).
  budget: 0.7, renderFloor: 0.33,
  hulls,
  extraUniforms: { uScaleLo: { value: 0 } },
  // Every vault sits above the plane (the lowest wall at z 0.36 of its
  // scale) and the ribs start at z 0, so a ray below it heading down
  // meets nothing.
  floor: 0,
  geometry: /* glsl */`
    float hexagon(vec2 p,float radius) {
      p=abs(p);
      return max(p.x*0.8660254+p.y*0.5,p.y)-radius;
    }
    float square(vec2 p,float radius) {
      vec2 q=abs(p)-radius+radius*0.16;
      return length(max(q,0.0))+min(max(q.x,q.y),0.0)-radius*0.16;
    }
    float roundCut(float a,float b,float k) {
      float h=clamp(0.5+0.5*(a-b)/k,0.0,1.0);
      return mix(b,a,h)+k*h*(1.0-h);
    }
    float portal(vec3 q,float pixel,out vec2 info) {
      float h=hexagon(q.xy,1.0);
      float thickness=mix(0.06,0.41,uStructure);
      float depth=mix(0.055,0.415,uStructure);
      vec2 shell=vec2(abs(h)-thickness,abs(q.z-0.8)-depth);
      float d=length(max(shell,0.0))+min(max(shell.x,shell.y),0.0)-0.018;
      info=vec2(0.0,0.35);
      float lip=min(length(vec2(h+thickness+0.002,abs(q.z-0.8)-depth-0.002)),
        length(vec2(h-thickness-0.002,abs(q.z-0.8)-depth-0.002)))-0.012;
      // Carving only removes material. Outside the uncut wall, its bound
      // advances the ray safely without evaluating invisible small cells.
      if(d>pixel*4.0) {
        if(lip<d)info=vec2(0.48,0.8);
        return min(d,lip);
      }

      if(uCut>0.001) {
        // Three annular channels turn each front and back into a tiered
        // cornice. Their rounded cross sections preserve polished edges.
        float spacing=thickness*0.64;
        float radial=clamp(floor(h/spacing+0.5),-1.0,1.0)*spacing;
        vec2 groove=vec2(h-radial,abs(q.z-0.8)-depth);
        float cut=thickness*0.21*uCut-length(groove);
        if(cut>d)info=vec2(0.24,0.55);
        d=roundCut(d,cut,thickness*0.035*uCut+0.00001);
      }

      // Each wall has its own tangent plane. Three crossing passages in
      // each cell expose chambers behind the front face and through its sides.
      float sector=floor(atan(q.y,q.x)/1.04719755)*1.04719755+0.52359878;
      vec2 face=turn(sector)*q.xy;
      vec3 local=vec3(face.x-1.0,face.y,q.z-0.8);
      float cell=0.39*thickness/0.235;
      for(int j=0;j<4;j++) {
        float reveal=smoothstep(float(j)*0.23,float(j)*0.23+0.24,uDetail);
        reveal*=smoothstep(pixel*1.3,pixel*3.8,cell*0.19);
        if(reveal<0.001)break;
        vec3 c=mod(local+cell*0.5,cell)-cell*0.5;
        float width=cell*0.19*reveal;
        float hole=min(hexagon(c.xy,width),min(square(c.xz,width),square(c.yz,width)));
        float cut=-hole,bevel=cell*0.026*reveal+0.00001;
        if(cut>d)info=vec2(0.08+float(j)*0.035,0.18);
        d=roundCut(d,cut,bevel);
        if(d>pixel*4.0)break;
        cell/=3.0;
      }

      if(uCut>0.001) {
        // A diagonal fret cuts the remaining wall into framed lozenges.
        // It repeats in the face chart, so all six sides share a pattern.
        float grid=thickness*1.24;
        vec2 diamond=vec2(local.y+local.z,local.y-local.z)*0.70710678;
        vec2 panel=abs(mod(diamond+grid*0.5,grid)-grid*0.5);
        float fret=min(panel.x,panel.y)-grid*0.095*uCut;
        float faceDepth=abs(local.x)-thickness*0.52;
        float cut=-max(fret,-faceDepth);
        if(cut>d)info=vec2(0.27,0.55);
        d=roundCut(d,cut,grid*0.022*uCut+0.00001);
      }

      // Narrow lips catch the light along the inner and outer aperture.
      // They remain continuous while the wall between them becomes porous.
      if(lip<d){d=lip;info=vec2(0.48,0.8);}
      return d;
    }
    float map(vec3 p,out vec4 trap) {
      float r=max(length(p),0.00001);
      float base=floor((log(r)-uPhase)/PERIOD);
      float d=100.0;trap=vec4(0);
      for(int i=-2;i<=2;i++) {
        float s=exp(uPhase+(base+float(i))*PERIOD);
        // The carved shell and its lips fit between these radial bounds.
        float bound=max(r-s*mix(1.60,2.10,uStructure),s*mix(1.10,0.62,uStructure)-r);
        if(bound>max(r*0.1,0.002)){d=min(d,bound);continue;}
        vec3 q=p/s;
        q.xy=turn(log(s)*mix(0.1,1.75,uShape))*q.xy;
        vec2 info;
        float n=portal(q,2.5/(uResolution*s),info)*s;
        if(n<d){d=n;trap=vec4(log(s)*0.28+info.x,0.0,info.y,s);}
      }
      if(p.z>0.002) {
        // Paired helical ribs join the corners without closing the view
        // through the new side chambers. The bound includes their bend.
        float twist=mix(0.1,1.75,uShape);
        vec2 xy=turn(log(p.z/0.8)*twist)*p.xy;
        float a=mod(atan(xy.y,xy.x)+0.523599,1.047198)-0.523599;
        vec2 q=vec2(cos(a),sin(a))*length(xy);
        q.y=abs(q.y)-p.z*0.075;
        float rail=(length(q-vec2(1.443375*p.z,0))-p.z*0.032)/sqrt(3.2+twist*twist*2.2);
        if(rail<d){d=rail;trap=vec4(log(p.z)*0.28+0.48,0.0,0.75,p.z);}
      }
      return d;
    }`,
});
// Literal metadata for the site hero bundler, then the built scene.
const spiral = {name: 'spiral',params: {speed: 0.5,shape: 0.82,complexity: 0.68,fill: 0.4,tilt: 0.5,density: 0.5,edge: 0.5},paramLabels: {'*':{shape: 'twist',complexity: 'carving',density: 'vault',edge: 'complexity',fill: 'zoom',tilt: 'tilt'}},paramOrder: ['speed','shape','edge','complexity','density','fill','tilt']};
Object.assign(spiral, flight);
// The flight reads every uneven frame as stutter: a steady 60 on a fast
// panel (main.js frameGate).
spiral.steadyFps = 60;
return spiral; // vjw: was `export default spiral;`
} // vjw: the factory
