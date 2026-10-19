import type {
  CancellationToken,
  editor as MonacoEditor,
  languages as MonacoLanguages,
} from 'monaco-editor'
import { buildMarkdownSourceInlineCompletionContext } from '@/components/markdownSourceInlineCompletionContext'
import {
  createSourceCompletionSessionId,
  resolveSourceProviderLocality,
} from '@/components/markdownSourceInlineCompletionPolicy'
import {
  completionPreferenceKey,
  type MarkdownSourceTextCompletionOptions,
  type SourceCompletionSnapshot,
} from '@/components/markdownSourceTextCompletionTypes'
import { DocumentCompletionIndex } from '@/logic/documentCompletionIndex'
import { requestAiInlineCompletion } from '@/services/aiInlineCompletionRequest'
import i18n from '@/i18n/setup'

export type { MarkdownSourceTextCompletionOptions } from '@/components/markdownSourceTextCompletionTypes'

export const SOURCE_AI_COMPLETION_DELAY_MS = {
  fast: 250,
  balanced: 450,
  'battery-saver': 900,
} as const
const INDEX_REBUILD_DELAY_MS = 180
const MAX_DOCUMENT_CANDIDATES = 2

export const registerMarkdownSourceTextCompletion = (
  options: MarkdownSourceTextCompletionOptions,
) => {
  const requestCompletion = options.requestCompletion ?? requestAiInlineCompletion
  const resolveProviderLocality = options.resolveProviderLocality ?? resolveSourceProviderLocality
  const sessionId = createSourceCompletionSessionId()
  let active: AbortController | null = null
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false
  let index = new DocumentCompletionIndex()
  const cancel = () => {
    active?.abort()
    active = null
  }
  const rebuildIndex = (model: MonacoEditor.ITextModel | null) => {
    index.destroy()
    index = new DocumentCompletionIndex()
    if (model && !model.isDisposed()) index.rebuild(model.getValue(), model.getVersionId())
  }
  rebuildIndex(options.editor.getModel())

  const isEligible = (model: MonacoEditor.ITextModel, token: CancellationToken) =>
    !destroyed &&
    !token.isCancellationRequested &&
    !model.isDisposed() &&
    model === options.editor.getModel() &&
    !options.editor.inComposition &&
    options.editor.getRawOptions().readOnly !== true

  const isCurrent = (snapshot: SourceCompletionSnapshot, token: CancellationToken) => {
    const position = options.editor.getPosition()
    return (
      isEligible(snapshot.model, token) &&
      snapshot.model.getVersionId() === snapshot.revision &&
      (options.getDocumentKey() ?? snapshot.model.uri.toString()) === snapshot.documentKey &&
      completionPreferenceKey(options.getPreferences()) === snapshot.preferenceKey &&
      position?.lineNumber === snapshot.position.lineNumber &&
      position.column === snapshot.position.column
    )
  }
  const items = (
    snapshot: SourceCompletionSnapshot,
    texts: readonly string[],
    source: 'ai' | 'document',
  ) => {
    const word = snapshot.model.getWordUntilPosition(snapshot.position)
    const range = new options.monaco.Range(
      snapshot.position.lineNumber,
      word.startColumn,
      snapshot.position.lineNumber,
      snapshot.position.column,
    )
    return texts.map((text): MonacoLanguages.CompletionItem => ({
      label: {
        label: `${word.word}${text}`.replace(/\s+/gu, ' ').trim(),
        description: i18n.t(
          source === 'ai' ? 'editor.completionSourceAi' : 'editor.completionSourceDocument',
        ),
      },
      kind: options.monaco.languages.CompletionItemKind.Text,
      insertText: `${word.word}${text}`,
      filterText: `${word.word}${text}`,
      range,
    }))
  }

  const provider: MonacoLanguages.CompletionItemProvider = {
    provideCompletionItems: async (model, position, _context, token) => {
      // Providers are registered per editor; another editor's request must not cancel ours.
      if (model !== options.editor.getModel()) return { suggestions: [] }
      cancel()
      const preferences = options.getPreferences()
      if (
        !isEligible(model, token) ||
        (!preferences.documentCompletionEnabled && !preferences.aiCompletionEnabled)
      )
        return { suggestions: [] }
      const context = buildMarkdownSourceInlineCompletionContext(
        model,
        position,
        preferences.aiCompletionNearbyContextEnabled,
      )
      if (!context || context.prefix.trim().length < 2) return { suggestions: [] }
      const snapshot: SourceCompletionSnapshot = {
        context,
        documentKey: options.getDocumentKey() ?? model.uri.toString(),
        model,
        position,
        preferenceKey: completionPreferenceKey(preferences),
        providerId: preferences.aiCompletionProviderId ?? preferences.aiDefaultProviderId ?? '',
        revision: model.getVersionId(),
      }
      const documentTexts = () =>
        preferences.documentCompletionEnabled
          ? index
              .query(context.prefix, context.cursorOffset)
              .slice(0, MAX_DOCUMENT_CANDIDATES)
              .map(({ text }) => text)
          : []
      const local = documentTexts()
      if (local.length) return { suggestions: items(snapshot, local, 'document') }
      if (
        !preferences.aiCompletionEnabled ||
        !snapshot.providerId ||
        (preferences.aiCompletionSnoozedUntil !== null &&
          preferences.aiCompletionSnoozedUntil > Date.now())
      )
        return { suggestions: [] }
      const controller = new AbortController()
      active = controller
      const subscription = token.onCancellationRequested(() => controller.abort())
      let timer: ReturnType<typeof setTimeout> | undefined
      let onAbort: () => void = () => undefined
      const cancelled = new Promise<null>((resolve) => {
        onAbort = () => resolve(null)
        controller.signal.addEventListener('abort', onAbort, { once: true })
      })
      try {
        await Promise.race([
          new Promise<void>((resolve) => {
            timer = setTimeout(
              resolve,
              SOURCE_AI_COMPLETION_DELAY_MS[preferences.aiCompletionTriggerMode],
            )
          }),
          cancelled,
        ])
        if (controller.signal.aborted || !isCurrent(snapshot, token)) return { suggestions: [] }
        const rebuiltLocal = documentTexts()
        if (rebuiltLocal.length) return { suggestions: items(snapshot, rebuiltLocal, 'document') }
        const locality = await Promise.race([
          resolveProviderLocality(snapshot.providerId),
          cancelled,
        ])
        if (
          controller.signal.aborted ||
          !isCurrent(snapshot, token) ||
          !locality ||
          locality === 'unavailable' ||
          (locality === 'remote' && !preferences.aiCompletionCloudContextConsent)
        )
          return { suggestions: [] }
        const text = await Promise.race([
          requestCompletion(
            {
              completionSessionId: sessionId,
              excludedSuggestions: [],
              heading: context.heading ?? undefined,
              language: 'auto',
              length: preferences.aiCompletionLength,
              prefix: context.prefix,
              providerId: snapshot.providerId,
              revision: snapshot.revision,
              suffix: context.suffix,
            },
            controller.signal,
          ),
          cancelled,
        ])
        if (!text || controller.signal.aborted || !isCurrent(snapshot, token))
          return { suggestions: [] }
        return { suggestions: items(snapshot, [text], 'ai') }
      } catch (error) {
        if (!controller.signal.aborted) console.warn('Source text suggestion request failed', error)
        return { suggestions: [] }
      } finally {
        clearTimeout(timer)
        controller.signal.removeEventListener('abort', onAbort)
        subscription.dispose()
        if (active === controller) active = null
      }
    },
  }
  const registration = options.monaco.languages.registerCompletionItemProvider('markdown', provider)
  const contentDisposable = options.editor.onDidChangeModelContent(() => {
    cancel()
    if (rebuildTimer) clearTimeout(rebuildTimer)
    const model = options.editor.getModel()
    const revision = model?.getVersionId()
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null
      if (model && revision === model.getVersionId() && model === options.editor.getModel())
        index.rebuild(model.getValue(), revision)
    }, INDEX_REBUILD_DELAY_MS)
  })
  const modelDisposable = options.editor.onDidChangeModel(() => {
    cancel()
    rebuildIndex(options.editor.getModel())
  })
  const blurDisposable = options.editor.onDidBlurEditorText(cancel)
  let currentPreferenceKey = completionPreferenceKey(options.getPreferences())
  const unsubscribePreferences = options.subscribePreferences?.(() => {
    const next = completionPreferenceKey(options.getPreferences())
    if (next === currentPreferenceKey) return
    currentPreferenceKey = next
    cancel()
    options.editor.trigger('marklab', 'hideSuggestWidget', null)
  })
  return {
    dispose: () => {
      destroyed = true
      cancel()
      if (rebuildTimer) clearTimeout(rebuildTimer)
      index.destroy()
      contentDisposable.dispose()
      modelDisposable.dispose()
      blurDisposable.dispose()
      registration.dispose()
      unsubscribePreferences?.()
    },
  }
}
