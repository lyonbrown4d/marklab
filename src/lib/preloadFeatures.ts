import { rendererDiagnostics } from '@/services/rendererDiagnostics'

let sourceEditorPreload: Promise<unknown> | null = null
let wysiwygEditorPreload: Promise<unknown> | null = null
let graphViewPreload: Promise<unknown> | null = null
let allPagesPreload: Promise<unknown> | null = null

const resetOnFailure = <T>(promise: Promise<T>, reset: () => void) => {
  return promise.catch((error: unknown) => {
    reset()
    rendererDiagnostics.warn('app.preload', 'feature-preload-failed', error)
    if (import.meta.env.DEV) {
      console.warn('Feature preload failed', error)
    }
  })
}

export const preloadSourceEditor = () => {
  if (typeof window === 'undefined') return
  sourceEditorPreload ??= resetOnFailure(
    Promise.all([
      import('@/pages/SourceCodePage'),
      import('@/components/MarkdownSourceEditor'),
      import('@/lib/monaco').then(({ configureMonaco }) => configureMonaco()),
    ]),
    () => {
      sourceEditorPreload = null
    },
  )
}

export const preloadWysiwygEditor = () => {
  if (typeof window === 'undefined') return
  wysiwygEditorPreload ??= resetOnFailure(
    Promise.all([import('@/pages/WysiwygEditorPage'), import('@/components/MarkdownEditor')]),
    () => {
      wysiwygEditorPreload = null
    },
  )
}

export const preloadGraphView = () => {
  if (typeof window === 'undefined') return
  graphViewPreload ??= resetOnFailure(
    Promise.all([
      import('@/pages/GraphViewPage'),
      import('@/pages/FileGraphPage'),
      import('@/pages/WorkspaceGraphPage'),
      import('@/logic/graphLayout').then(({ preloadGraphLayout }) => preloadGraphLayout()),
    ]),
    () => {
      graphViewPreload = null
    },
  )
}

export const preloadAllPagesView = () => {
  if (typeof window === 'undefined') return
  allPagesPreload ??= resetOnFailure(import('@/pages/AllPagesPage'), () => {
    allPagesPreload = null
  })
}
