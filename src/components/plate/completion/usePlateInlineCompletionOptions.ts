import { useMemo, useRef } from 'react'
import { useLatest } from 'ahooks'
import {
  buildPlateInlineCompletionRequest,
  plateInlineCompletionDebounceMs,
} from '@/components/plate/completion/plateInlineCompletionRequest'
import type {
  PlateInlineCompletionControllerOptions,
  UsePlateInlineCompletionOptions,
} from '@/components/plate/completion/types'
import { usePlateDocumentCompletionIndex } from '@/components/plate/completion/usePlateDocumentCompletionIndex'
import { plateWorkspaceLinkQuery } from '@/components/plate/workspaceLink/plateWorkspaceLinkCompletion'
import { aiApi } from '@/services/aiApi'
import { requestAiInlineCompletion } from '@/services/aiInlineCompletionRequest'
import { usePreferencesStore } from '@/store/usePreferencesStore'

let fallbackSessionId = 0

const createSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  fallbackSessionId += 1
  return `plate-completion-${fallbackSessionId}`
}

const canUseProvider = async (providerId: string, cloudConsent: boolean) => {
  if (cloudConsent) return true
  const provider = await aiApi.getProvider(providerId)
  return provider.available && provider.locality === 'local'
}

export const usePlateInlineCompletionOptions = ({
  activePath,
  editor,
  readOnly,
  value,
}: UsePlateInlineCompletionOptions) => {
  const documentEnabled = usePreferencesStore((state) => state.documentCompletionEnabled)
  const aiEnabled = usePreferencesStore((state) => state.aiCompletionEnabled)
  const dedicatedProviderId = usePreferencesStore((state) => state.aiCompletionProviderId)
  const defaultProviderId = usePreferencesStore((state) => state.aiDefaultProviderId)
  const triggerMode = usePreferencesStore((state) => state.aiCompletionTriggerMode)
  const length = usePreferencesStore((state) => state.aiCompletionLength)
  const nearbyContext = usePreferencesStore((state) => state.aiCompletionNearbyContextEnabled)
  const cloudConsent = usePreferencesStore((state) => state.aiCompletionCloudContextConsent)
  const configurationRef = useLatest({
    activePath,
    aiEnabled,
    cloudConsent,
    documentEnabled,
    length,
    nearbyContext,
    providerId: dedicatedProviderId ?? defaultProviderId,
    readOnly,
    triggerMode,
  })
  const revisionRef = useRef(0)
  const sessionIdRef = useRef(createSessionId())
  const {
    getDocumentCompletions,
    revision: indexRevision,
    syncEditorChanges: syncDocumentIndex,
  } = usePlateDocumentCompletionIndex({
    activePath,
    editor,
    enabled: documentEnabled,
    value,
  })

  const options = useMemo<PlateInlineCompletionControllerOptions>(
    () => ({
      canComplete: (context) =>
        plateWorkspaceLinkQuery(context) == null && context.before.trim().length >= 2,
      debounceMs: () => plateInlineCompletionDebounceMs(configurationRef.current.triggerMode),
      enabled: () => {
        const config = configurationRef.current
        return !config.readOnly && (config.documentEnabled || config.aiEnabled)
      },
      getDocumentCompletions: (context) =>
        configurationRef.current.documentEnabled ? getDocumentCompletions(context) : [],
      getDocumentKey: () => configurationRef.current.activePath,
      requestCompletion: async (context, excluded, signal) => {
        const config = configurationRef.current
        if (!config.aiEnabled || !config.providerId || config.readOnly) return null
        if (!(await canUseProvider(config.providerId, config.cloudConsent)) || signal.aborted) {
          return null
        }
        revisionRef.current += 1
        const request = buildPlateInlineCompletionRequest({
          completionSessionId: sessionIdRef.current,
          context,
          excluded,
          includeNearbyContext: config.nearbyContext,
          length: config.length,
          providerId: config.providerId,
          revision: revisionRef.current,
        })
        const text = await requestAiInlineCompletion(request, signal)
        return text ? { source: 'ai' as const, text } : null
      },
    }),
    [configurationRef, getDocumentCompletions],
  )

  return {
    indexRevision,
    options,
    syncDocumentIndex,
    syncKey: [
      activePath,
      aiEnabled,
      cloudConsent,
      dedicatedProviderId,
      defaultProviderId,
      documentEnabled,
      length,
      nearbyContext,
      readOnly,
      triggerMode,
    ].join('|'),
  }
}
