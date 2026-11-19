// Copied from donor/vs3/visual_kit/src/lib/kick-rise.js (the friends' engine, used with permission, 2026-11-19).
// vjw: verbatim (CRLF line endings made LF).
// A kick response with an attack. The engine's kick envelopes jump to
// their peak in the frame of the hit and fall from there, so a
// dropped photo or clip moved its whole distance in one frame and read
// as a jolt (buyer, 2026-11-09: "it jumps but not really with flow").
// KickRise carries the same response up to the same peak along an
// ease-in-out over `attack` seconds and only then lets it fall, so the
// picture starts moving on the beat, gathers speed, and reaches the
// peak with no frame-sized step. attack 0 is the old instant response.
//
// Three ways in:
//   hit(amount, cap)   an impulse (s.onKick) adds to where the response
//                      is heading, capped, the way `env = min(cap, env +
//                      amount)` did; release(dt, attack, rate) carries it
//                      up along a smoothstep, holds the peak one frame,
//                      then decays it at `rate` per second.
//   follow(x, dt, attack, release)
//                      a transient envelope (s.kick, the onset punch): a
//                      jump starts the same smoothstep up to the jump's
//                      height, and after the peak it falls with time
//                      constant `release`, never below the envelope.
//   glide(x, dt, attack, release)
//                      a sustained envelope (s.sub, s.energy), which also
//                      rises slowly in a build: a critically damped spring
//                      chases the envelope's peak, held for 1.5 attacks,
//                      so a hit eases in and a slow swell is followed at
//                      an even speed. Restarting a smoothstep every time
//                      a swell crept past it stuttered at 12 Hz.
// The smoothstep has zero velocity at both ends; its largest per-frame
// step is 1.5 * dt / attack of the rise, 31% at 80 ms and 60 fps (the
// instant response moved 96% of the way in the hit's own frame).
const GLIDE_W = 3;
const GLIDE_HOLD = 1.5;
const ease = (x) => (x >= 1 ? 1 : x * x * (3 - 2 * x));

export class KickRise {
  constructor() {
    this.v = 0;      // the response this frame
    this.from = 0;   // where the attack started
    this.to = 0;     // the peak it is heading for
    this.tau = 0;    // seconds into the attack
    this.on = false; // attacking
    this.u = 0;      // glide: the spring's velocity
    this.peak = 0;   // glide: the envelope peak being chased
    this.hold = 0;   // glide: seconds left holding that peak
  }

  // Jump straight to v (a re-seed, not a hit).
  set(v) {
    this.v = this.from = this.to = v;
    this.on = false;
  }

  hit(amount, cap = Infinity) {
    const base = this.on ? this.to : this.v;
    this.from = this.v;
    this.to = Math.min(cap, base + amount);
    this.tau = 0;
    this.on = this.to > this.v;
  }

  // Advance the attack; returns true while it runs.
  _rise(dt, attack) {
    if (!this.on) return false;
    this.tau += dt;
    if (!(attack > 0) || this.tau >= attack) {
      this.v = this.to;
      this.on = false;
      return true; // the peak frame holds; the fall starts next frame
    }
    this.v = this.from + (this.to - this.from) * ease(this.tau / attack);
    return true;
  }

  // Impulse mode: attack, then exponential decay at `rate` per second.
  release(dt, attack, rate) {
    if (!this._rise(dt, attack)) this.v *= Math.exp(-dt * rate);
    return this.v;
  }

  // Transient envelope: a rise starts an attack to it.
  follow(x, dt, attack, release) {
    if (!(attack > 0)) { this.set(x); return x; }
    if (this.on) {
      if (x > this.to) this.to = x; // still rising: aim higher, keep the ramp
    } else if (x > this.v + 1e-4) {
      this.from = this.v;
      this.to = x;
      this.tau = 0;
      this.on = true;
    }
    if (!this._rise(dt, attack)) this.v = Math.max(x, this.v * Math.exp(-dt / release));
    return this.v;
  }

  // Sustained envelope: a spring chases its held peak.
  glide(x, dt, attack, release) {
    if (!(attack > 0)) { this.set(x); this.u = 0; this.peak = x; this.hold = 0; return x; }
    if (x >= this.peak) { this.peak = x; this.hold = GLIDE_HOLD * attack; }
    else if ((this.hold -= dt) <= 0) this.peak = x;
    if (this.peak > this.v + 1e-6) {
      // exact critically damped step toward the held peak
      const w = GLIDE_W / attack, x0 = this.v - this.peak, c = this.u + w * x0, e = Math.exp(-w * dt);
      this.v = this.peak + (x0 + c * dt) * e;
      this.u = (this.u - w * c * dt) * e;
    } else {
      this.u = 0;
      this.v = Math.max(x, this.v * Math.exp(-dt / release));
    }
    return this.v;
  }
}
