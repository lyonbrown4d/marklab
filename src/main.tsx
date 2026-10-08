import { lazy, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/index.scss'
import { initializeReactScan } from '@/dev/reactScan'
import { installRendererDiagnostics, reportReactError } from '@/services/rendererDiagnostics'
import RendererBootstrap from '@/app/RendererBootstrap'
import {
  initializeRendererLifecycle,
  isStandbyRenderer,
  onRendererInteractive,
} from '@/runtime/rendererLifecycle'

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

if (import.meta.env.DEV && import.meta.env.VITE_REACT_DEVTOOLS === 'true') {
  const loadReactDevTools = () => {
    const script = document.createElement('script')
    script.src = 'http://localhost:8097'
    script.async = true
    script.onload = () => {
      console.log('React DevTools loaded')
    }
    script.onerror = () => {
      console.warn('React DevTools not available. Start the standalone DevTools first.')
    }

    // 延迟加载，确保 React 已初始化
    setTimeout(() => {
      document.head.appendChild(script)
    }, 1000)
  }

  loadReactDevTools()
}
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
