import { lazy, Suspense } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import '@xyflow/react/dist/base.css'

import App from '@/App'
import AppToaster from '@/app/AppToaster'
import { ApplicationFocusCycle } from '@/app/ApplicationFocusCycle'
import { queryClient } from '@/app/queryClient'
import { PlateDndProvider } from '@/components/plate/PlateDndProvider'
import '@/i18n/setup'
import '@/styles/app.scss'
import '@/styles/motion.scss'
import '@/styles/plate-editor.scss'
import '@/styles/search.scss'
import '@/styles/source-editor.scss'

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(async () => {
      const { ReactQueryDevtools: Devtools } = await import('@tanstack/react-query-devtools')
      return { default: Devtools }
    })
  : null

const RendererApplication = () => (
  <PlateDndProvider>
    <QueryClientProvider client={queryClient}>
      <App />
      <ApplicationFocusCycle />
      <AppToaster />
      {ReactQueryDevtools ? (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  </PlateDndProvider>
)

export default RendererApplication
