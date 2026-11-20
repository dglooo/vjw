// The MIDI controller (user 2026-11-20, backlog 7: basic, no extras). Web MIDI in; a learn mode maps a CC (knob, fader)
// onto a layer input of one scene, or a note-on (pad) onto a hotkey's action. Pure: the MIDIAccess, the app's panel and
// keys come in, so Vitest runs it without a browser. ui/Midi.tsx wires it to the app.
import type { SceneId } from './doc'

export interface Control { kind: 'cc' | 'note'; ch: number; num: number } // ch 1–16
/** A layer input of `scene` (gl/live.ts panel.setValue's path); a CC 0–127 maps onto [lo, hi]. */
export interface ParamTarget { kind: 'param'; scene: SceneId; layer: number; node: 'gen' | 'layer' | number; input: string; lo: number; hi: number; label: string }
/** A pad presses this app.ts hotkey (e.code): one code path with the keyboard's. */
export interface KeyTarget { kind: 'key'; code: string }
export type Target = ParamTarget | KeyTarget
export interface Mapping { ctl: Control; target: Target }
export interface MidiState { on: boolean; inputs: string[]; learn: boolean; armed: Target | null; maps: Mapping[]; error: string | null }
/** A MIDIAccess as far as we use it (the tests' fake is one; DOM types only). Setting an input's onmidimessage opens it. */
export interface Access { inputs: { forEach(cb: (i: MidiIn) => void): void }; onstatechange: ((e: MIDIConnectionEvent) => void) | null }
interface MidiIn { name: string | null; state: string; onmidimessage: ((e: MIDIMessageEvent) => void) | null; close?(): unknown }

/** The pad actions, by hotkey (app.ts). No flash: a manual strobe pad would bypass the flash gate (I-FL1). */
export const KEYS: Readonly<Record<string, string>> = {
  ArrowLeft: 'scene ←', ArrowRight: 'scene →', ArrowUp: 'preset ↑', ArrowDown: 'preset ↓', KeyT: 'tap', BracketLeft: 'BPM ½', BracketRight: 'BPM ×2', KeyB: 'downbeat',
  KeyX: 'text on/off',
}

/** A message's control and value: a CC (0xBn), a note-on (0x9n) at velocity > 0. A note-off (0x8n, or 0x9n at 0) and
 *  everything else: null. */
export function parse(d: ArrayLike<number>): (Control & { val: number }) | null {
  if (d.length < 3) return null
  const type = d[0] & 0xf0
  const ch = (d[0] & 0x0f) + 1
  if (type === 0xb0) return { kind: 'cc', ch, num: d[1], val: d[2] }
  if (type === 0x90 && d[2] > 0) return { kind: 'note', ch, num: d[1], val: d[2] }
  return null
}

/** A CC value 0–127 onto [lo, hi]. */
export const scale = (val: number, lo: number, hi: number) => lo + ((hi - lo) * val) / 127
/** A layer input's place, as Panel.tsx tags its slider (data-midi). */
export const paramId = (t: { layer: number; node: ParamTarget['node']; input: string }) => `${t.layer}/${t.node}/${t.input}`
const targetId = (t: Target) => (t.kind === 'key' ? t.code : `${t.scene} ${paramId(t)}`)
const same = (a: Control, b: Control) => a.kind === b.kind && a.ch === b.ch && a.num === b.num

const rec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const int = (x: unknown, lo: number, hi: number) => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi
const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
const control = (c: unknown) => rec(c) && (c.kind === 'cc' || c.kind === 'note') && int(c.ch, 1, 16) && int(c.num, 0, 127)
const target = (t: unknown) =>
  rec(t) &&
  (t.kind === 'key'
    ? typeof t.code === 'string' && Object.hasOwn(KEYS, t.code)
    : t.kind === 'param' && typeof t.scene === 'string' && int(t.layer, 0, 3) && (t.node === 'gen' || t.node === 'layer' || int(t.node, 0, 99)) &&
      typeof t.input === 'string' && finite(t.lo) && finite(t.hi) && typeof t.label === 'string')
/** The mappings of a stored or baked value (the trust boundary): a corrupt one, or a pad on a slider or a knob on an
 *  action, is left out. */
export const mappingsOf = (x: unknown): Mapping[] =>
  Array.isArray(x) ? x.filter((m): m is Mapping => rec(m) && control(m.ctl) && target(m.target) && ((m.target as Target).kind === 'param') === ((m.ctl as Control).kind === 'cc')) : []

/** `store`: where the mappings live (library.ts: vjw.midi, mirrored and baked with the marks). `app`: the scene on
 *  stage, its input set, a hotkey pressed. */
export function createMidi(store: { load(): unknown; save(maps: Mapping[]): void }, app: { scene(): SceneId; param(t: ParamTarget, v: number): void; key(code: string): void }) {
  let state: MidiState = { on: false, inputs: [], learn: false, armed: null, maps: mappingsOf(store.load()), error: null }
  let access: Access | null = null
  const subs = new Set<() => void>()
  const set = (p: Partial<MidiState>) => {
    state = { ...state, ...p }
    subs.forEach((cb) => cb())
  }

  function message(d: ArrayLike<number>) {
    const m = parse(d)
    if (!m) return
    const ctl: Control = { kind: m.kind, ch: m.ch, num: m.num }
    const { armed } = state
    if (armed) {
      if ((armed.kind === 'param') !== (m.kind === 'cc')) return // a knob for a slider, a pad for an action
      // one target per control and one control per target: learning either again moves it
      const maps = [...state.maps.filter((x) => !same(x.ctl, ctl) && targetId(x.target) !== targetId(armed)), { ctl, target: armed }]
      set({ maps, armed: null })
      return store.save(maps)
    }
    const t = state.maps.find((x) => same(x.ctl, ctl))?.target
    if (t?.kind === 'key') app.key(t.code)
    else if (t && t.scene === app.scene()) app.param(t, scale(m.val, t.lo, t.hi)) // ponytail: another scene's knob waits
  }
  /** The connected inputs, listed and heard: on start and on every hot-plug. */
  function scan() {
    const inputs: string[] = []
    access?.inputs.forEach((i) => {
      i.onmidimessage = (e) => e.data && message(e.data)
      if (i.state === 'connected') inputs.push(i.name || 'MIDI input')
    })
    set({ on: true, inputs, error: null })
  }

  return {
    /** A snapshot, replaced by every change (useSyncExternalStore). */
    get: () => state,
    onChange(cb: () => void) {
      subs.add(cb)
      return () => void subs.delete(cb)
    },
    /** `request`: navigator.requestMIDIAccess, called here only, on the user's click (it asks for permission). */
    async start(request: () => Promise<Access>) {
      try {
        access = await request()
      } catch (e) {
        return set({ error: (e as Error)?.name === 'NotAllowedError' ? 'MIDI blocked: allow it in the address bar' : 'no Web MIDI in this browser' })
      }
      access.onstatechange = scan
      scan()
    },
    stop() {
      if (access) access.onstatechange = null
      access?.inputs.forEach((i) => {
        i.onmidimessage = null
        void i.close?.() // frees the device for other apps (a Windows port is exclusive)
      })
      access = null
      set({ on: false, inputs: [], learn: false, armed: null })
    },
    /** The store's mappings again (library.ts restores the dev mirror's after a browser data wipe, at load). */
    load: () => set({ maps: mappingsOf(store.load()) }),
    setLearn: (learn: boolean) => set({ learn, armed: null }),
    /** Learn mode: `t` waits for the next control; the armed one again cancels. */
    arm(t: Target) {
      if (state.learn) set({ armed: state.armed && targetId(state.armed) === targetId(t) ? null : t })
    },
    remove(i: number) {
      const maps = state.maps.filter((_, j) => j !== i)
      set({ maps })
      store.save(maps)
    },
    clear() {
      set({ maps: [] })
      store.save([])
    },
    message,
  }
}
