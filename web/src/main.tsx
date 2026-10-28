import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app' // engine + audio singletons and the rAF loop
import { Overlay } from './ui/Overlay'
import { Panel } from './ui/Panel'

if (location.search.includes('bench')) void import('./bench') // ?bench: the measurement page (plan S2.2)

createRoot(document.getElementById('ui')!).render(
  <StrictMode>
    <Overlay />
    <Panel />
  </StrictMode>,
)
