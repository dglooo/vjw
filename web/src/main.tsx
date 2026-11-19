import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app' // engine + audio singletons and the rAF loop
import { Editor } from './editor/Editor'
import { Shader } from './editor/Shader'
import { Overlay } from './ui/Overlay'
import { Panel } from './ui/Panel'

if (location.search.includes('bench')) void import('./bench') // ?bench: the measurement page (plan S2.2)
if (location.search.includes('camprobe')) void import('./camprobe') // ?camprobe: the camera probe page (plan_camera S0.1)

createRoot(document.getElementById('ui')!).render(
  <StrictMode>
    <Overlay />
    <Panel />
    <Editor />
    <Shader />
  </StrictMode>,
)
