import { loader } from '@monaco-editor/react'
import type * as Monaco from '@/lib/monacoRuntime'
import { loadMonacoWorker } from '@/lib/monacoWorkers'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'

type MonacoApi = typeof Monaco
type MonacoGlobal = typeof globalThis & {
  MonacoEnvironment?: typeof self.MonacoEnvironment
  monaco?: MonacoApi
}

let monacoLoader: Promise<MonacoApi> | null = null

const loadLocalMonaco = async () => {
  const monaco = await import('@/lib/monacoRuntime')

  const monacoGlobal = globalThis as MonacoGlobal

  monacoGlobal.monaco = monaco
  monacoGlobal.MonacoEnvironment = {
    getWorker: (workerId, label) =>
      loadMonacoWorker(workerId, label).catch((error: unknown) => {
        rendererDiagnostics.error('editor.monaco', 'worker-load-failed', error)
        throw error
      }),
  }

  loader.config({ monaco })

  return monaco
}

export const configureMonaco = () => {
  monacoLoader ??= loadLocalMonaco().catch((error: unknown) => {
    monacoLoader = null
    rendererDiagnostics.error('editor.monaco', 'runtime-load-failed', error)
    throw error
  })

  return monacoLoader
}
