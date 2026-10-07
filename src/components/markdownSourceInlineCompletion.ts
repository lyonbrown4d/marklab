import type {
  CancellationToken,
  editor as MonacoEditor,
  languages as MonacoLanguages,
  Position,
} from 'monaco-editor'
import { buildMarkdownSourceInlineCompletionContext } from '@/components/markdownSourceInlineCompletionContext'
import {
  createSourceCompletionSessionId,
  resolveSourceProviderLocality,
} from '@/components/markdownSourceInlineCompletionPolicy'
import {
  completionPreferenceKey,
  type InlineCompletionPreferences,
  type MarkdownSourceInlineCompletionOptions,
  type SourceCompletionRequest,
  type SourceCompletionSnapshot,
} from '@/components/markdownSourceInlineCompletionTypes'
import { DocumentCompletionIndex } from '@/logic/documentCompletionIndex'
import { requestAiInlineCompletion } from '@/services/aiInlineCompletionRequest'

export type { MarkdownSourceInlineCompletionOptions } from '@/components/markdownSourceInlineCompletionTypes'

export const SOURCE_AI_COMPLETION_DELAY_MS = {
  fast: 250,
  balanced: 450,
  'battery-saver': 900,
} as const

const INDEX_REBUILD_DELAY_MS = 180
const MAX_DOCUMENT_CANDIDATES = 2

const samePosition = (left: Position | null, right: Position) =>
  left?.lineNumber === right.lineNumber && left.column === right.column

export const registerMarkdownSourceInlineCompletion = (
  options: MarkdownSourceInlineCompletionOptions,
) => {
  const requestCompletion = options.requestCompletion ?? requestAiInlineCompletion
  const resolveProviderLocality = options.resolveProviderLocality ?? resolveSourceProviderLocality
  const sessionId = createSourceCompletionSessionId()
  const listeners = new Set<() => void>()
  let activeRequest: SourceCompletionRequest | null = null
  let aiCache: { key: string; text: string } | null = null
  let generation = 0
  let index = new DocumentCompletionIndex()
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  const fireChange = () => listeners.forEach((listener) => listener())
  const cancelActive = () => {
    generation += 1
    if (!activeRequest) return
    clearTimeout(activeRequest.timer)
    activeRequest.controller.abort()
    activeRequest.tokenSubscription.dispose()
    activeRequest = null
  }
  const clearAiState = () => {
    cancelActive()
    aiCache = null
  }
  const rebuildIndex = (model: MonacoEditor.ITextModel | null) => {
    index.destroy()
    index = new DocumentCompletionIndex()
    if (model && !model.isDisposed()) index.rebuild(model.getValue(), model.getVersionId())
  }
  rebuildIndex(options.editor.getModel())

  const isEligible = (model: MonacoEditor.ITextModel, token: CancellationToken) => {
    if (destroyed || token.isCancellationRequested || model.isDisposed()) return false
    if (model !== options.editor.getModel() || options.editor.inComposition) return false
    return options.editor.getRawOptions().readOnly !== true
  }

  const isCurrent = (snapshot: SourceCompletionSnapshot, token: CancellationToken) =>
    isEligible(snapshot.model, token) &&
    snapshot.model.getVersionId() === snapshot.revision &&
    (options.getDocumentKey() ?? snapshot.model.uri.toString()) === snapshot.documentKey &&
    completionPreferenceKey(options.getPreferences()) === snapshot.preferenceKey &&
    samePosition(options.editor.getPosition(), snapshot.position)

  const completionItems = (
    snapshot: SourceCompletionSnapshot,
    documentTexts: readonly string[],
  ): MonacoLanguages.InlineCompletion[] => {
    const range = new options.monaco.Range(
      snapshot.position.lineNumber,
      snapshot.position.column,
      snapshot.position.lineNumber,
      snapshot.position.column,
    )
    return documentTexts.map((insertText) => ({ insertText, range }))
  }

  const scheduleAi = (
    snapshot: SourceCompletionSnapshot,
    documentTexts: readonly string[],
    token: CancellationToken,
    delay: number,
    length: InlineCompletionPreferences['aiCompletionLength'],
  ) => {
    if (aiCache?.key === snapshot.key || activeRequest?.key === snapshot.key) return
    cancelActive()
    const controller = new AbortController()
    const requestGeneration = generation
    const tokenSubscription = token.onCancellationRequested(() => {
      if (activeRequest?.generation === requestGeneration) cancelActive()
    })
    const timer = setTimeout(async () => {
      try {
        if (!isCurrent(snapshot, token) || requestGeneration !== generation) return
        if (
          options.getPreferences().documentCompletionEnabled &&
          index.query(snapshot.context.prefix, snapshot.context.cursorOffset).length > 0
        ) {
          cancelActive()
          fireChange()
          return
        }
        const locality = await resolveProviderLocality(snapshot.providerId)
        if (!isCurrent(snapshot, token) || requestGeneration !== generation) return
        const latestPreferences = options.getPreferences()
        if (
          locality === 'unavailable' ||
          (locality === 'remote' && !latestPreferences.aiCompletionCloudContextConsent)
        ) {
          return
        }
        const text = await requestCompletion(
          {
            completionSessionId: sessionId,
            excludedSuggestions: documentTexts.slice(0, 2),
            heading: snapshot.context.heading ?? undefined,
            language: 'auto',
            length,
            prefix: snapshot.context.prefix,
            providerId: snapshot.providerId,
            revision: snapshot.revision,
            suffix: snapshot.context.suffix,
          },
          controller.signal,
        )
        if (
          !text ||
          controller.signal.aborted ||
          requestGeneration !== generation ||
          !isCurrent(snapshot, token)
        ) {
          return
        }
        aiCache = { key: snapshot.key, text }
        fireChange()
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          console.warn('Source inline completion request failed', error)
        }
      } finally {
        if (activeRequest?.generation === requestGeneration) {
          activeRequest.tokenSubscription.dispose()
          activeRequest = null
        }
      }
    }, delay)
    activeRequest = {
      controller,
      generation: requestGeneration,
      key: snapshot.key,
      timer,
      tokenSubscription,
    }
  }

  const provider: MonacoLanguages.InlineCompletionsProvider = {
    disposeInlineCompletions: () => undefined,
    onDidChangeInlineCompletions: (listener) => {
      listeners.add(listener)
      return { dispose: () => listeners.delete(listener) }
    },
    provideInlineCompletions: (model, position, _context, token) => {
      const preferences = options.getPreferences()
      if (
        !isEligible(model, token) ||
        (!preferences.documentCompletionEnabled && !preferences.aiCompletionEnabled)
      ) {
        clearAiState()
        return { items: [] }
      }
      const completionContext = buildMarkdownSourceInlineCompletionContext(
        model,
        position,
        preferences.aiCompletionNearbyContextEnabled,
      )
      if (!completionContext || completionContext.prefix.trim().length < 2) return { items: [] }
      const providerId = preferences.aiCompletionProviderId ?? preferences.aiDefaultProviderId
      const documentKey = options.getDocumentKey() ?? model.uri.toString()
      const revision = model.getVersionId()
      const preferenceKey = completionPreferenceKey(preferences)
      const key = [
        documentKey,
        model.uri.toString(),
        revision,
        position.lineNumber,
        position.column,
        preferenceKey,
      ].join(':')
      const snapshot: SourceCompletionSnapshot = {
        context: completionContext,
        documentKey,
        key,
        model,
        position,
        preferenceKey,
        providerId: providerId ?? '',
        revision,
      }
      const documentTexts = preferences.documentCompletionEnabled
        ? index
            .query(completionContext.prefix, completionContext.cursorOffset)
            .slice(0, MAX_DOCUMENT_CANDIDATES)
            .map(({ text }) => text)
        : []
      if (documentTexts.length > 0) {
        cancelActive()
        return { items: completionItems(snapshot, documentTexts) }
      }
      if (preferences.aiCompletionEnabled && providerId) {
        scheduleAi(
          snapshot,
          documentTexts,
          token,
          SOURCE_AI_COMPLETION_DELAY_MS[preferences.aiCompletionTriggerMode],
          preferences.aiCompletionLength,
        )
      } else {
        cancelActive()
      }
      return {
        items: completionItems(snapshot, aiCache?.key === snapshot.key ? [aiCache.text] : []),
      }
    },
  }

  const providerDisposable = options.monaco.languages.registerInlineCompletionsProvider(
    'markdown',
    provider,
  )
  const contentDisposable = options.editor.onDidChangeModelContent(() => {
    clearAiState()
    if (rebuildTimer) clearTimeout(rebuildTimer)
    const model = options.editor.getModel()
    const revision = model?.getVersionId()
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null
      if (model && revision === model.getVersionId() && model === options.editor.getModel()) {
        index.rebuild(model.getValue(), revision)
      }
    }, INDEX_REBUILD_DELAY_MS)
  })
  const modelDisposable = options.editor.onDidChangeModel(() => {
    clearAiState()
    rebuildIndex(options.editor.getModel())
  })
  let currentPreferenceKey = completionPreferenceKey(options.getPreferences())
  const unsubscribePreferences = options.subscribePreferences?.(() => {
    const nextPreferenceKey = completionPreferenceKey(options.getPreferences())
    if (nextPreferenceKey === currentPreferenceKey) return
    currentPreferenceKey = nextPreferenceKey
    clearAiState()
    fireChange()
  })
  options.editor.addCommand(
    options.monaco.KeyMod.Alt | options.monaco.KeyCode.BracketLeft,
    () => options.editor.trigger('marklab', 'editor.action.inlineSuggest.showPrevious', null),
    'inlineSuggestionVisible',
  )
  options.editor.addCommand(
    options.monaco.KeyMod.Alt | options.monaco.KeyCode.BracketRight,
    () => options.editor.trigger('marklab', 'editor.action.inlineSuggest.showNext', null),
    'inlineSuggestionVisible',
  )

  return {
    dispose: () => {
      destroyed = true
      clearAiState()
      if (rebuildTimer) clearTimeout(rebuildTimer)
      listeners.clear()
      index.destroy()
      contentDisposable.dispose()
      modelDisposable.dispose()
      providerDisposable.dispose()
      unsubscribePreferences?.()
    },
  }
}
