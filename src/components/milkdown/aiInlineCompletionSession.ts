import type { EditorState } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import {
  buildAiInlineCompletionContext,
  buildAiInlineCompletionLocalContext,
  type AiInlineCompletionContext,
} from '@/components/milkdown/aiInlineCompletionContext'
import {
  aiInlineCompletionPluginKey,
  normalizeAiInlineCompletionCandidates,
} from '@/components/milkdown/aiInlineCompletionState'
import type {
  AiInlineCompletionCandidate,
  AiInlineCompletionMeta,
  AiInlineCompletionOptions,
} from '@/components/milkdown/aiInlineCompletionTypes'

const DEFAULT_DEBOUNCE_MS = 350
const DEFAULT_MAX_CANDIDATES = 3

export type AiInlineCompletionSession = {
  cancel: (clear: boolean) => void
  destroy: () => void
  requestNext: () => void
  update: (previousState: EditorState) => void
}

const completionContext = (
  view: EditorView,
  options: AiInlineCompletionOptions,
  nearby: boolean,
): AiInlineCompletionContext | null => {
  if (!options.enabled() || !view.editable || view.composing) return null
  const buildContext = nearby ? buildAiInlineCompletionContext : buildAiInlineCompletionLocalContext
  const context = buildContext(view.state, {
    characterBudget: options.characterBudget,
  })
  return context && options.canComplete(context) ? context : null
}

export const createAiInlineCompletionSession = (
  view: EditorView,
  options: AiInlineCompletionOptions,
  removeRuntime: () => void,
): AiInlineCompletionSession => {
  let abortController: AbortController | null = null
  let destroyed = false
  let requestVersion = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const dispatch = (meta: AiInlineCompletionMeta) => {
    if (!destroyed) view.dispatch(view.state.tr.setMeta(aiInlineCompletionPluginKey, meta))
  }

  const cancel = (clear: boolean) => {
    if (timer) clearTimeout(timer)
    timer = null
    abortController?.abort()
    abortController = null
    requestVersion += 1
    if (clear && aiInlineCompletionPluginKey.getState(view.state)) dispatch({ type: 'clear' })
  }

  const documentCandidates = (context: AiInlineCompletionContext) => {
    const maximum = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES
    const documentMaximum = Math.max(0, maximum - 1)
    if (documentMaximum === 0 || !options.getDocumentCompletions) return []
    return normalizeAiInlineCompletionCandidates(
      options.getDocumentCompletions(context),
      [],
      documentMaximum,
      'document',
    )
  }

  const runRequest = async (excluded: readonly string[], append: boolean, selectNew: boolean) => {
    const maximum = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES
    const capacity = maximum - excluded.length
    if (capacity <= 0) return
    const context = completionContext(view, options, true)
    if (!context) return
    abortController?.abort()
    const controller = new AbortController()
    const version = ++requestVersion
    abortController = controller
    const snapshot = view.state
    const documentKey = options.getDocumentKey?.() ?? null
    try {
      const result = await options.requestCompletion(context, excluded, controller.signal)
      if (
        controller.signal.aborted ||
        destroyed ||
        version !== requestVersion ||
        view.state.doc !== snapshot.doc ||
        !view.state.selection.eq(snapshot.selection) ||
        (options.getDocumentKey?.() ?? null) !== documentKey ||
        !completionContext(view, options, false)
      ) {
        return
      }
      const additions = normalizeAiInlineCompletionCandidates(result, excluded, capacity, 'ai')
      if (additions.length === 0) return
      const current = aiInlineCompletionPluginKey.getState(view.state)
      const retained: readonly AiInlineCompletionCandidate[] = append
        ? (current?.candidates ?? [])
        : []
      const candidates = [...retained, ...additions].slice(0, maximum)
      dispatch({
        type: 'set',
        value: {
          anchor: current?.anchor ?? view.state.selection.from,
          candidates,
          index: selectNew ? retained.length : (current?.index ?? 0),
        },
      })
    } catch (error) {
      if (!controller.signal.aborted) console.warn('AI inline completion request failed', error)
    } finally {
      if (abortController === controller) abortController = null
    }
  }

  const schedule = () => {
    if (timer) clearTimeout(timer)
    const context = completionContext(view, options, false)
    if (!context) return
    const snapshot = view.state
    const version = requestVersion
    const localCandidates = documentCandidates(context)
    if (!aiInlineCompletionPluginKey.getState(view.state) && localCandidates.length) {
      queueMicrotask(() => {
        if (
          !destroyed &&
          version === requestVersion &&
          view.state === snapshot &&
          completionContext(view, options, false) &&
          !aiInlineCompletionPluginKey.getState(view.state)
        ) {
          dispatch({
            type: 'set',
            value: { anchor: view.state.selection.from, candidates: localCandidates, index: 0 },
          })
        }
      })
    }
    timer = setTimeout(() => {
      timer = null
      const excluded =
        aiInlineCompletionPluginKey.getState(view.state)?.candidates.map(({ text }) => text) ?? []
      void runRequest(excluded, excluded.length > 0, false)
    }, options.debounceMs ?? DEFAULT_DEBOUNCE_MS)
  }

  const requestNext = () => {
    const completion = aiInlineCompletionPluginKey.getState(view.state)
    if (!completion) return
    const maximum = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES
    if (completion.candidates.length >= maximum) {
      dispatch({
        type: 'set',
        value: { ...completion, index: (completion.index + 1) % completion.candidates.length },
      })
      return
    }
    if (timer) clearTimeout(timer)
    timer = null
    void runRequest(
      completion.candidates.map(({ text }) => text),
      true,
      true,
    )
  }

  const handleCompositionStart = () => cancel(true)
  const handleCompositionEnd = () => schedule()
  const handleDocumentChange = () => {
    cancel(true)
    schedule()
  }
  const unsubscribeDocumentKey = options.subscribeDocumentKey?.(handleDocumentChange) ?? null
  const unsubscribeEnabled = options.subscribeEnabled?.(handleDocumentChange) ?? null
  view.dom.addEventListener('compositionstart', handleCompositionStart)
  view.dom.addEventListener('compositionend', handleCompositionEnd)
  schedule()

  return {
    cancel,
    requestNext,
    update: (previousState) => {
      if (!completionContext(view, options, false)) {
        cancel(true)
        return
      }
      if (
        view.state.doc === previousState.doc &&
        view.state.selection.eq(previousState.selection)
      ) {
        return
      }
      cancel(false)
      if (!aiInlineCompletionPluginKey.getState(view.state)) schedule()
    },
    destroy: () => {
      destroyed = true
      cancel(false)
      unsubscribeDocumentKey?.()
      unsubscribeEnabled?.()
      view.dom.removeEventListener('compositionstart', handleCompositionStart)
      view.dom.removeEventListener('compositionend', handleCompositionEnd)
      removeRuntime()
    },
  }
}
