import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import '@xyflow/react/dist/style.css'
import '@xterm/xterm/css/xterm.css'
import '@/index.scss'
import '@/styles/app.scss'
import '@/styles/editor.scss'
import '@/styles/motion.scss'
import '@/styles/search.scss'
import '@/i18n/setup'
import '@/lib/monaco'
import App from '@/App.tsx'
import { queryClient } from '@/app/queryClient'
import { Toaster } from '@/components/ui/sonner'
import { isDesktopRuntime } from '@/runtime/environment'

const isElectronUserAgent = () => {
  return typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron')
}

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(async () => {
      const { ReactQueryDevtools: Devtools } = await import('@tanstack/react-query-devtools')
      return { default: Devtools }
    })
  : null

if (
  import.meta.env.DEV &&
  import.meta.env.VITE_REACT_SCAN === 'true' &&
  !isDesktopRuntime() &&
  !isElectronUserAgent()
) {
  void import('react-scan')
    .then(({ scan }) => scan({ enabled: true }))
    .catch((error) => {
      console.warn('React Scan failed to initialize', error)
    })
}

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
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster richColors closeButton />
      {ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  </StrictMode>,
)
