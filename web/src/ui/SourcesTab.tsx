import { useEffect, useRef, useSyncExternalStore } from 'react'
import { settings, src } from '../app'
import { meterGroups } from '../audio/settings'

/** The Sources tab (S6.1): live meters driven by one rAF loop writing each meter's `value` directly — no React state,
 * so a re-render happens only when the settings change the meter set (a band added or removed). */
export function SourcesTab() {
  const s = useSyncExternalStore(settings.onChange, settings.get)
  const root = useRef<HTMLDivElement>(null)
  // The loop reads the live `src` every frame, but `els` is captured once per run: restart it when the meter *set*
  // changes (a band added or removed), not on every settings change (a sens drag re-renders but the set is the same).
  const idsKey = meterGroups(s).map((g) => g.title + g.ids.join()).join(' ')
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLMeterElement>('[data-src]') ?? []
    let raf = 0
    const loop = () => {
      for (const el of els) el.value = src[el.dataset.src!] ?? 0
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [idsKey])
  return (
    <div className="sources" ref={root}>
      {meterGroups(s).map((g) => (
        <section key={g.title} className="sgroup">
          <div className="head">
            <span>{g.title}</span>
          </div>
          {g.ids.map((id) => (
            <label key={id} className="row">
              <span>{id.startsWith('u:') ? s.custom.find((b) => b.id === id)?.name ?? id : id}</span>
              <meter data-src={id} min={0} max={1} value={0} />
            </label>
          ))}
        </section>
      ))}
    </div>
  )
}
