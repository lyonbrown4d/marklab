import { Plugin } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import {
  createAiInlineCompletionSession,
  type AiInlineCompletionSession,
} from '@/components/milkdown/aiInlineCompletionSession'
import {
  aiInlineCompletionPluginKey,
  applyAiInlineCompletionState,
  buildAiInlineCompletionDecorations,
  handleAiInlineCompletionKey,
} from '@/components/milkdown/aiInlineCompletionState'
import type { AiInlineCompletionOptions } from '@/components/milkdown/aiInlineCompletionTypes'

export type {
  AiInlineCompletionCandidate,
  AiInlineCompletionOptions,
  AiInlineCompletionResult,
} from '@/components/milkdown/aiInlineCompletionTypes'
export { aiInlineCompletionPluginKey } from '@/components/milkdown/aiInlineCompletionState'

const runtimes = new WeakMap<EditorView, AiInlineCompletionSession>()

export const createAiInlineCompletionProsePlugin = (options: AiInlineCompletionOptions) =>
  new Plugin({
    key: aiInlineCompletionPluginKey,
    props: {
      decorations: buildAiInlineCompletionDecorations,
      handleKeyDown: (view, event) =>
        handleAiInlineCompletionKey(
          view,
          event,
          () => runtimes.get(view)?.requestNext(),
          () => runtimes.get(view)?.cancel(true),
        ),
    },
    state: {
      init: () => null,
      apply: applyAiInlineCompletionState,
    },
    view: (view) => {
      const runtime = createAiInlineCompletionSession(view, options, () => runtimes.delete(view))
      runtimes.set(view, runtime)
      return {
        update: (_view, previousState) => runtime.update(previousState),
        destroy: runtime.destroy,
      }
    },
  })

export const cancelAiInlineCompletion = (view: EditorView) => runtimes.get(view)?.cancel(true)

export const aiInlineCompletionPlugin = (options: AiInlineCompletionOptions) =>
  $prose(() => createAiInlineCompletionProsePlugin(options))
