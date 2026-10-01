import type { editor as MonacoEditor, Position } from 'monaco-editor'
import type { MarkdownSourceInlineCompletionContext } from '@/components/markdownSourceInlineCompletionContext'
import type { PreferencesState } from '@/store/usePreferencesStore'
import type { AiInlineCompletionRequest } from '@/types/aiCompletion'

export type MonacoModule = typeof import('monaco-editor')
export type SourceProviderLocality = 'local' | 'remote' | 'unavailable'

export type SourceCompletionSnapshot = {
  context: MarkdownSourceInlineCompletionContext
  documentKey: string
  key: string
  model: MonacoEditor.ITextModel
  position: Position
  preferenceKey: string
  providerId: string
  revision: number
}

export type SourceCompletionRequest = {
  controller: AbortController
  generation: number
  key: string
  timer: ReturnType<typeof setTimeout>
  tokenSubscription: { dispose: () => void }
}

export type InlineCompletionPreferences = Pick<
  PreferencesState,
  | 'aiCompletionCloudContextConsent'
  | 'aiCompletionEnabled'
  | 'aiCompletionLength'
  | 'aiCompletionNearbyContextEnabled'
  | 'aiCompletionProviderId'
  | 'aiCompletionTriggerMode'
  | 'aiDefaultProviderId'
  | 'documentCompletionEnabled'
>

export type MarkdownSourceInlineCompletionOptions = {
  editor: MonacoEditor.IStandaloneCodeEditor
  getDocumentKey: () => string | null
  getPreferences: () => InlineCompletionPreferences
  monaco: MonacoModule
  requestCompletion?: (
    input: AiInlineCompletionRequest,
    signal: AbortSignal,
  ) => Promise<string | null>
  resolveProviderLocality?: (providerId: string) => Promise<SourceProviderLocality>
  subscribePreferences?: (listener: () => void) => () => void
}

export const completionPreferenceKey = (preferences: InlineCompletionPreferences) =>
  [
    preferences.aiCompletionCloudContextConsent,
    preferences.aiCompletionEnabled,
    preferences.aiCompletionLength,
    preferences.aiCompletionNearbyContextEnabled,
    preferences.aiCompletionProviderId,
    preferences.aiCompletionTriggerMode,
    preferences.aiDefaultProviderId,
    preferences.documentCompletionEnabled,
  ].join(':')
