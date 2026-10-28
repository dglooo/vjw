import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Dynamic imports, so ?probe never loads the engine or the audio singletons.
if (location.search.includes('probe')) import('./probe/probe')
else {
  import('./app') // engine + audio singletons and the rAF loop
  const { Overlay } = await import('./ui/Overlay')
  createRoot(document.getElementById('ui')!).render(
    <StrictMode>
      <Overlay />
    </StrictMode>,
  )
}
