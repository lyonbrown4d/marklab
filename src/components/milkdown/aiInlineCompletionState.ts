import { PluginKey, type EditorState, type Transaction } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view'
import type {
  AiInlineCompletionCandidate,
  AiInlineCompletionMeta,
  AiInlineCompletionResult,
  AiInlineCompletionState,
} from '@/components/milkdown/aiInlineCompletionTypes'

export const aiInlineCompletionPluginKey = new PluginKey<AiInlineCompletionState | null>(
  'marklab-ai-inline-completion',
)

export const normalizeAiInlineCompletionCandidates = (
  result: AiInlineCompletionResult,
  excluded: readonly string[],
  maximum: number,
  fallbackSource: AiInlineCompletionCandidate['source'],
) => {
  const values = Array.isArray(result) ? result : result == null ? [] : [result]
  const seen = new Set(excluded)
  const candidates: AiInlineCompletionCandidate[] = []
  for (const value of values) {
    const candidate = typeof value === 'string' ? { source: fallbackSource, text: value } : value
    if (!candidate.text || seen.has(candidate.text) || candidates.length >= maximum) continue
    seen.add(candidate.text)
    candidates.push(candidate)
  }
  return candidates
}

const insertedTextAtAnchor = (transaction: Transaction, anchor: number) => {
  if (transaction.steps.length !== 1) return null
  let from = -1
  let to = -1
  transaction.steps[0]!.getMap().forEach((oldFrom, oldTo, newFrom, newTo) => {
    if (oldFrom === anchor && oldTo === anchor && newTo > newFrom) {
      from = newFrom
      to = newTo
    }
  })
  if (from < 0 || to < 0) return null
  return { anchor: to, text: transaction.doc.textBetween(from, to) }
}

export const applyAiInlineCompletionState = (
  transaction: Transaction,
  value: AiInlineCompletionState | null,
  oldState: EditorState,
) => {
  const meta = transaction.getMeta(aiInlineCompletionPluginKey) as
    AiInlineCompletionMeta | undefined
  if (meta?.type === 'clear') return null
  if (meta?.type === 'set') return meta.value
  if (!value) return null
  if (!transaction.docChanged) {
    return transaction.selection.eq(oldState.selection) ? value : null
  }

  const insertion = insertedTextAtAnchor(transaction, value.anchor)
  const candidate = value.candidates[value.index]
  if (!insertion || !candidate?.text.startsWith(insertion.text)) return null
  const remainder = candidate.text.slice(insertion.text.length)
  if (!remainder) return null
  return {
    anchor: insertion.anchor,
    candidates: [{ ...candidate, text: remainder }],
    index: 0,
  }
}

const createGhostText = (candidate: AiInlineCompletionCandidate) => {
  const ghost = document.createElement('span')
  ghost.className = 'marklab-ai-ghost-text'
  ghost.textContent = candidate.text
  ghost.contentEditable = 'false'
  ghost.setAttribute('aria-hidden', 'true')
  ghost.dataset.source = candidate.source
  return ghost
}

export const buildAiInlineCompletionDecorations = (state: EditorState) => {
  const completion = aiInlineCompletionPluginKey.getState(state)
  const candidate = completion?.candidates[completion.index]
  if (!completion || !candidate) return null
  return DecorationSet.create(state.doc, [
    Decoration.widget(completion.anchor, () => createGhostText(candidate), {
      key: `marklab-ai-ghost-${completion.anchor}-${completion.index}-${candidate.text}`,
      side: 1,
    }),
  ])
}

const nextWordPrefix = (text: string) => {
  if (!text) return ''
  if (typeof Intl.Segmenter === 'function') {
    const segments = new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)
    for (const segment of segments) {
      if (segment.isWordLike) return text.slice(0, segment.index + segment.segment.length)
    }
  }
  return text.match(/^\s*(?:[\p{L}\p{N}_]+|.)/u)?.[0] ?? text[0] ?? ''
}

const acceptText = (view: EditorView, completion: AiInlineCompletionState, text: string) => {
  const candidate = completion.candidates[completion.index]
  if (!candidate || !text) return false
  const remainder = candidate.text.slice(text.length)
  const meta: AiInlineCompletionMeta = remainder
    ? {
        type: 'set',
        value: {
          anchor: completion.anchor + text.length,
          candidates: [{ ...candidate, text: remainder }],
          index: 0,
        },
      }
    : { type: 'clear' }
  view.dispatch(
    view.state.tr.insertText(text, completion.anchor).setMeta(aiInlineCompletionPluginKey, meta),
  )
  return true
}

export const handleAiInlineCompletionKey = (
  view: EditorView,
  event: KeyboardEvent,
  requestNext: () => void,
  cancel: () => void,
) => {
  const completion = aiInlineCompletionPluginKey.getState(view.state)
  const candidate = completion?.candidates[completion.index]
  if (event.key === 'Escape') {
    cancel()
    return Boolean(completion && candidate)
  }
  if (!view.editable || view.composing || !completion || !candidate) return false
  if (event.altKey && (event.key === '[' || event.key === ']')) {
    if (event.key === '[' || completion.index + 1 < completion.candidates.length) {
      const offset = event.key === '[' ? -1 : 1
      const index =
        (completion.index + offset + completion.candidates.length) % completion.candidates.length
      view.dispatch(
        view.state.tr.setMeta(aiInlineCompletionPluginKey, {
          type: 'set',
          value: { ...completion, index },
        }),
      )
    } else {
      requestNext()
    }
    return true
  }
  if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    return acceptText(view, completion, candidate.text)
  }
  if (event.key === 'ArrowRight' && (event.ctrlKey || event.metaKey)) {
    return acceptText(view, completion, nextWordPrefix(candidate.text))
  }
  return false
}
