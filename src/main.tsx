import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import '@/index.scss'
import '@/styles/app.scss'
import '@/styles/editor.scss'
import '@/styles/editor-controls.scss'
import '@/styles/motion.scss'
import '@/styles/search.scss'
import '@/i18n/setup'
import App from '@/App.tsx'
import { queryClient } from '@/app/queryClient'
import { Toaster } from '@/components/ui/sonner'

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(async () => {
      const { ReactQueryDevtools: Devtools } = await import('@tanstack/react-query-devtools')
      return { default: Devtools }
    })
  : null

if (import.meta.env.DEV) {
  void import('react-scan')
    .then(({ scan }) => {
      void scan({ enabled: true })
    })
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
