import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app' // engine + audio singletons and the rAF loop
import { Overlay } from './ui/Overlay'

createRoot(document.getElementById('ui')!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
)
