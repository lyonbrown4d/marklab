import { lazy, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.scss'
import { initializeReactScan } from '@/dev/reactScan'
import { installRendererDiagnostics, reportReactError } from '@/services/rendererDiagnostics'
import RendererBootstrap from '@/app/RendererBootstrap'
import { initializeDesktopRuntime } from '@/runtime/tauri'
import {
  initializeRendererLifecycle,
  isStandbyRenderer,
  onRendererInteractive,
} from '@/runtime/rendererLifecycle'

await initializeDesktopRuntime()

const standby = isStandbyRenderer()
const RendererApplication = standby
  ? lazy(() => import('@/app/RendererApplication'))
  : (await import('@/app/RendererApplication')).default

const scheduleEditorRuntimePreload = async (): Promise<void> => {
  const runtime = await import('@/app/scheduleEditorRuntimePreload')
  runtime.scheduleEditorRuntimePreload()
}

initializeReactScan(import.meta.env.DEV, import.meta.env.VITE_REACT_SCAN)
installRendererDiagnostics()
await initializeRendererLifecycle()

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, info) => reportReactError('caught-error', error, info.componentStack),
  onRecoverableError: (error, info) =>
    reportReactError('recoverable-error', error, info.componentStack),
  onUncaughtError: (error, info) => reportReactError('uncaught-error', error, info.componentStack),
}).render(
  <StrictMode>
    <RendererBootstrap application={<RendererApplication />} />
  </StrictMode>,
)

if (standby) {
  let stopListening: () => void = () => undefined
  stopListening = onRendererInteractive(() => {
    stopListening()
    void scheduleEditorRuntimePreload()
  })
} else {
  void scheduleEditorRuntimePreload()
}
