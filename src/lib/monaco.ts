import { loader } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'

type MonacoApi = typeof Monaco
type MonacoWorkerModule = {
  default: new () => Worker
}

type MonacoGlobal = typeof globalThis & {
  MonacoEnvironment?: typeof self.MonacoEnvironment
  monaco?: MonacoApi
}

let monacoLoader: Promise<MonacoApi> | null = null

const loadLocalMonaco = async () => {
  const [monaco, editorWorker, cssWorker, htmlWorker, jsonWorker, tsWorker] = (await Promise.all([
    import('monaco-editor'),
    import('monaco-editor/esm/vs/editor/editor.worker?worker'),
    import('monaco-editor/esm/vs/language/css/css.worker?worker'),
    import('monaco-editor/esm/vs/language/html/html.worker?worker'),
    import('monaco-editor/esm/vs/language/json/json.worker?worker'),
    import('monaco-editor/esm/vs/language/typescript/ts.worker?worker'),
  ])) as [
    MonacoApi,
    MonacoWorkerModule,
    MonacoWorkerModule,
    MonacoWorkerModule,
    MonacoWorkerModule,
    MonacoWorkerModule,
  ]

  const monacoGlobal = globalThis as MonacoGlobal

  monacoGlobal.monaco = monaco
  monacoGlobal.MonacoEnvironment = {
    getWorker: (_workerId, label) => {
      if (label === 'json') return new jsonWorker.default()
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker.default()
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new htmlWorker.default()
      }
      if (label === 'typescript' || label === 'javascript') return new tsWorker.default()
      return new editorWorker.default()
    },
  }

  loader.config({ monaco })

  return monaco
}

export const configureMonaco = () => {
  monacoLoader ??= loadLocalMonaco().catch((error: unknown) => {
    monacoLoader = null
    throw error
  })

  return monacoLoader
}
