import type { Genre, PresetId } from '../audio/presets'
import type { AudioSettings } from '../audio/settings'
import type { UiSnapshot } from '../store'

// The top bar's text (Overlay.tsx), pure so it tests without a browser, and its key press.

const ANALYSER = { ours: 'ours', donor: 'vs2', vs3: 'vs3' } as const
/** The audio chip's summary, e.g. `ours · auto dnb · mid`: the analyser, the genre profile (a hand pick, else the
 *  on-stage scene's `scene: psy`, else auto naming the detected one), the sensitivity. Off: only that, as no scene
 *  hears the genre or the sensitivity then. */
export function audioSummary(s: Pick<AudioSettings, 'analyser' | 'auto' | 'pick' | 'sensitivity'>, detected: Genre | null, scene?: PresetId | null) {
  if (s.analyser === 'off') return 'analysis off'
  const genre = s.pick ?? (scene ? `scene: ${scene}` : s.auto && detected ? `auto ${detected}` : 'auto')
  return `${ANALYSER[s.analyser]} · ${genre} · ${s.sensitivity ?? 'mid'}`
}

/** The input chip's name: the device's label, the file's name, else the call to pick one. */
export const inputLabel = ({ source, devices }: Pick<UiSnapshot, 'source' | 'devices'>) =>
  !source ? 'Choose input' : source.kind === 'file' ? source.name : (devices.find((d) => d.id === source.id)?.label ?? 'Audio input')

/** A hotkey pressed from the bar, as a MIDI pad presses one (ui/Midi.tsx): app.ts's handler does what the key does. */
export const press = (code: string) => dispatchEvent(new KeyboardEvent('keydown', { code }))
