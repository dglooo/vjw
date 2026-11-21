import type { ReactNode, ToggleEventHandler } from 'react'

// The top bar's icons (Overlay.tsx and its menus), drawn here on one 16 px grid with a 1.5 px round stroke (overlay.css
// .ico); `rec`, `play`, `pause` and a pressed star are filled.
const PATHS = {
  wave: 'M2 6.5v3M5 4v8M8 2.5v11M11 5v6M14 7v2',
  note: 'M6 12.5V3.8l7-1.6v8.6M6 12.5a1.6 1.6 0 1 1-3.2 0a1.6 1.6 0 1 1 3.2 0M13 10.8a1.6 1.6 0 1 1-3.2 0a1.6 1.6 0 1 1 3.2 0',
  cam: 'M2 4.5h8.5v7H2zM10.5 7.2 14 5v6l-3.5-2.2',
  left: 'M9.5 3.5 5 8l4.5 4.5',
  right: 'M6.5 3.5 11 8l-4.5 4.5',
  grid: 'M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z',
  star: 'M8 1.9l1.9 3.8 4.2.6-3 3 .7 4.2L8 11.5l-3.8 2 .7-4.2-3-3 4.2-.6z',
  lock: 'M4 7.2h8v6.3H4zM5.6 7.2V5.4a2.4 2.4 0 0 1 4.8 0v1.8',
  sliders: 'M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7M12 4.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0M7 11.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0',
  list: 'M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01',
  midi: 'M14 8A6 6 0 1 1 2 8a6 6 0 1 1 12 0M5 8.2h.01M5.9 5.9h.01M8 5h.01M10.1 5.9h.01M11 8.2h.01M7 11.4h2',
  text: 'M3.5 4.5V3h9v1.5M8 3v10M6 13h4',
  chart: 'M2 13.5h12M4.5 11V8M7.5 11V4M10.5 11V6.5M13.5 11V9',
  layers: 'M8 2.2 14 5.2 8 8.2 2 5.2zM2 8.2l6 3 6-3M2 11l6 3 6-3',
  code: 'M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5M9.2 3 6.8 13',
  rec: 'M12.5 8a4.5 4.5 0 1 1-9 0a4.5 4.5 0 1 1 9 0',
  play: 'M5 3.2v9.6L12.8 8z',
  pause: 'M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z',
  check: 'M3 8.5l3 3 7-7',
  folder: 'M2 4h4.2l1.5 1.5H14v7.5H2z',
  cycle: 'M13.5 8a5.5 5.5 0 1 1-5.5-5.5M6.4.9 8 2.5 6.4 4.1', // the autopilot: three quarters of a turn, clockwise
}

/** An icon, decorative (aria-hidden): its button carries the name. */
export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className={`ico ico-${name}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

/** A bar button and its popover (the Popover API: an outside click or Esc closes it, one is open at a time), anchored
 *  under the button and flipped left at the right edge (CSS anchor positioning, overlay.css .pop). */
export function Pop(p: { id: string; className: string; title?: string; disabled?: boolean; label: ReactNode; onToggle?: ToggleEventHandler<HTMLDivElement>; children: ReactNode }) {
  return (
    <>
      <button className={p.className} title={p.title} disabled={p.disabled} popoverTarget={p.id} style={{ anchorName: `--${p.id}` }}>
        {p.label}
      </button>
      <div id={p.id} popover="auto" className={`pop ${p.id}`} style={{ positionAnchor: `--${p.id}` }} onToggle={p.onToggle}>
        {p.children}
      </div>
    </>
  )
}

// Esc closes the open popover (the browser does) and nothing more: app.ts's Esc (the panel, the preset browser, the
// analysis screen) waits for the next press. On the document, as it bubbles: a field's own Esc (Bpm.tsx, a rename)
// runs first, and app.ts listens on the window.
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && document.querySelector('.pop:popover-open')) e.stopPropagation()
})
