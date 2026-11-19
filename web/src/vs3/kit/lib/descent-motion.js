// Copied from donor/vs3/visual_kit/src/lib/descent-motion.js (the friends' engine, used with permission, 2026-11-19).
// vjw: verbatim (pure math on the caller's state object; descent.js is its one reader).
// Bounded, frame-rate independent travel through a recursive scale field.
import { drastic } from './common.js';

export const LOG_SCALE = Math.log(3);
export function advanceDescent(state, dt, speed, kick = 0) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const h = Math.min(dt, 0.05);
  // Integrate the decaying accent exactly, so different frame rates travel
  // the same distance. The pulse only increases forward speed.
  state.pulse = Math.min(1, state.pulse + Math.max(0, kick) * 0.7);
  const decay = Math.exp(-h * 5);
  const advance = drastic(speed) * (0.16 * h + 0.1 * state.pulse * (1 - decay) / 5);
  state.pulse *= decay;
  const next = state.phase + advance;
  const turns = Math.floor(next / LOG_SCALE);
  state.phase = next - turns * LOG_SCALE;
  state.turns += turns;
  state.distance += advance;
  state.velocity = advance / h;
}
