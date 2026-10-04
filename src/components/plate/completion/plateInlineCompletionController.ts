import { PathApi, PointApi, TextApi, type NodeEntry } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { buildPlateInlineCompletionContext } from '@/components/plate/completion/plateInlineCompletionContext'
import type {
  PlateInlineCompletionCandidate,
  PlateInlineCompletionController,
  PlateInlineCompletionControllerOptions,
  PlateInlineCompletionResult,
  PlateInlineCompletionState,
} from '@/components/plate/completion/types'

const DEFAULT_MAX_CANDIDATES = 3

export const normalizePlateInlineCompletionCandidates = (
  result: PlateInlineCompletionResult,
  excluded: readonly string[],
  maximum: number,
  fallbackSource: PlateInlineCompletionCandidate['source'],
) => {
  const values = Array.isArray(result) ? result : result == null ? [] : [result]
  const seen = new Set(excluded)
  const candidates: PlateInlineCompletionCandidate[] = []
  for (const value of values) {
    const candidate = typeof value === 'string' ? { source: fallbackSource, text: value } : value
    if (!candidate.text || seen.has(candidate.text) || candidates.length >= maximum) continue
    seen.add(candidate.text)
    candidates.push(candidate)
  }
  return candidates
}

const nextWordPrefix = (text: string) => {
  if (!text) return ''
  if (typeof Intl.Segmenter === 'function') {
    for (const segment of new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)) {
      if (segment.isWordLike) return text.slice(0, segment.index + segment.segment.length)
    }
  }
  return text.match(/^\s*(?:[\p{L}\p{N}_]+|.)/u)?.[0] ?? text[0] ?? ''
}

export const createPlateInlineCompletionController = (
  editor: PlateEditor,
  options: PlateInlineCompletionControllerOptions,
): PlateInlineCompletionController => {
  let abortController: AbortController | null = null
  let composing = false
  let destroyed = false
  let generation = 0
  let state: PlateInlineCompletionState | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const listeners = new Set<() => void>()

  const setState = (next: PlateInlineCompletionState | null) => {
    if (state === next) return
    state = next
    listeners.forEach((listener) => listener())
  }
  const cancel = (clear: boolean) => {
    if (timer) clearTimeout(timer)
    timer = null
    abortController?.abort()
    abortController = null
    generation += 1
    if (clear) setState(null)
  }
  const context = (nearby: boolean) => {
    if (destroyed || composing || !options.enabled()) return null
    const completionContext = buildPlateInlineCompletionContext(editor, {
      characterBudget: options.characterBudget,
      nearbyBlockLimit: nearby ? undefined : 0,
    })
    return completionContext && options.canComplete(completionContext) ? completionContext : null
  }
  const isCurrent = (
    requestGeneration: number,
    children: PlateEditor['children'],
    documentKey: string | null,
    anchor: PlateInlineCompletionState['anchor'],
  ) =>
    !destroyed &&
    !composing &&
    generation === requestGeneration &&
    editor.children === children &&
    (options.getDocumentKey?.() ?? null) === documentKey &&
    Boolean(editor.selection && PointApi.equals(anchor, editor.selection.focus)) &&
    Boolean(context(false))

  const runAiRequest = async () => {
    const completionContext = context(true)
    if (!completionContext) return
    const maximum = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES
    const excluded = state?.candidates.map(({ text }) => text) ?? []
    const capacity = maximum - excluded.length
    if (capacity <= 0) return
    const controller = new AbortController()
    abortController?.abort()
    abortController = controller
    const requestGeneration = generation
    const children = editor.children
    const documentKey = options.getDocumentKey?.() ?? null
    const anchor = editor.selection ? { ...editor.selection.focus } : null
    if (!anchor) return
    try {
      const result = await options.requestCompletion(completionContext, excluded, controller.signal)
      if (controller.signal.aborted || !isCurrent(requestGeneration, children, documentKey, anchor))
        return
      const additions = normalizePlateInlineCompletionCandidates(result, excluded, capacity, 'ai')
      if (!additions.length) return
      const retained = state?.candidates ?? []
      const candidates = [...retained, ...additions]
      const index = Math.min(state?.index ?? 0, candidates.length - 1)
      setState({ anchor, candidates, index })
    } catch (error) {
      if (!controller.signal.aborted) console.warn('Plate inline completion request failed', error)
    } finally {
      if (abortController === controller) abortController = null
    }
  }

  const sync = () => {
    cancel(true)
    const localContext = context(false)
    if (!localContext || !editor.selection) return
    const requestGeneration = generation
    const anchor = { ...editor.selection.focus }
    const children = editor.children
    const documentKey = options.getDocumentKey?.() ?? null
    const maximum = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES
    const local = normalizePlateInlineCompletionCandidates(
      options.getDocumentCompletions?.(localContext),
      [],
      Math.max(0, maximum - 1),
      'document',
    )
    queueMicrotask(() => {
      if (
        destroyed ||
        composing ||
        generation !== requestGeneration ||
        editor.children !== children ||
        !editor.selection ||
        !PointApi.equals(anchor, editor.selection.focus) ||
        (options.getDocumentKey?.() ?? null) !== documentKey
      ) {
        return
      }
      if (local.length) setState({ anchor, candidates: local, index: 0 })
    })
    timer = setTimeout(
      () => {
        timer = null
        void runAiRequest()
      },
      Math.max(0, options.debounceMs()),
    )
  }

  const accept = (text: string) => {
    if (
      !text ||
      !state ||
      !editor.selection ||
      !PointApi.equals(state.anchor, editor.selection.focus)
    ) {
      return false
    }
    cancel(true)
    editor.tf.insertText(text)
    return true
  }
  const acceptAt = (index: number) => {
    const candidate = state?.candidates[index]
    return candidate ? accept(candidate.text) : false
  }

  return {
    activate: () => {
      destroyed = false
    },
    compositionEnd: () => {
      composing = false
      sync()
    },
    compositionStart: () => {
      composing = true
      cancel(true)
    },
    decorate: ([node, path]: NodeEntry) => {
      const candidate = state?.candidates[state.index]
      if (
        !state ||
        !candidate ||
        !TextApi.isText(node) ||
        !PathApi.equals(path, state.anchor.path)
      ) {
        return []
      }
      return [
        {
          anchor: state.anchor,
          focus: state.anchor,
          plateInlineCompletion: candidate.text,
          plateInlineCompletionAccept: acceptAt,
          plateInlineCompletionCandidates: state.candidates,
          plateInlineCompletionIndex: state.index,
          plateInlineCompletionSource: candidate.source,
        },
      ]
    },
    destroy: () => {
      destroyed = true
      cancel(true)
      listeners.clear()
    },
    getSnapshot: () => state,
    keyDown: (event) => {
      const candidate = state?.candidates[state.index]
      if (event.key === 'Escape' && candidate) {
        event.preventDefault()
        cancel(true)
        return true
      }
      if (!candidate || composing || !options.enabled()) return false
      if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        return accept(candidate.text)
      }
      if (event.key === 'ArrowRight' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        return accept(nextWordPrefix(candidate.text))
      }
      if (
        (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
      ) {
        event.preventDefault()
        const offset = event.key === 'ArrowUp' ? -1 : 1
        const index = (state!.index + offset + state!.candidates.length) % state!.candidates.length
        setState({ ...state!, index })
        return true
      }
      if (event.altKey && (event.key === '[' || event.key === ']')) {
        event.preventDefault()
        const offset = event.key === '[' ? -1 : 1
        const index = (state!.index + offset + state!.candidates.length) % state!.candidates.length
        setState({ ...state!, index })
        return true
      }
      return false
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    sync,
  }
}
