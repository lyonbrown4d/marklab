import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useLatest } from 'ahooks'
import type { AiInlineCompletionOptions } from '@/components/milkdown/aiInlineCompletionPlugin'
import {
  buildMarkdownInlineCompletionRequest,
  inlineCompletionDebounceMs,
} from '@/components/milkdown/markdownInlineCompletionConfig'
import { isLoopbackHttpUrl } from '@/components/settings/aiProviderUtils'
import { DocumentCompletionIndex } from '@/logic/documentCompletionIndex'
import { aiApi } from '@/services/aiApi'
import { requestAiInlineCompletion } from '@/services/aiInlineCompletionRequest'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type UseMarkdownInlineCompletionOptions = {
  activePath: string | null
  readOnly: boolean
  value: string
}

let fallbackSessionId = 0
const createSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  fallbackSessionId += 1
  return `markdown-completion-${fallbackSessionId}`
}

export const useMarkdownInlineCompletionOptions = ({
  activePath,
  readOnly,
  value,
}: UseMarkdownInlineCompletionOptions): AiInlineCompletionOptions => {
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
  const indexRef = useRef(new DocumentCompletionIndex())
  const indexPathRef = useRef<string | null>(null)
  const indexVersionRef = useRef(0)
  const listenersRef = useRef(new Set<() => void>())
  const revisionRef = useRef(0)
  const sessionIdRef = useRef(createSessionId())

  useLayoutEffect(() => {
    indexVersionRef.current += 1
    if (indexPathRef.current !== activePath) {
      indexPathRef.current = activePath
      indexRef.current.rebuild(value, indexVersionRef.current)
      return
    }
    indexRef.current.scheduleRebuild(value, indexVersionRef.current)
  }, [activePath, value])

  useEffect(() => {
    listenersRef.current.forEach((listener) => listener())
  }, [
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
  ])

  useEffect(() => () => indexRef.current.destroy(), [])

  return useMemo<AiInlineCompletionOptions>(() => {
    const canUseProvider = async (providerId: string) => {
      const { cloudConsent: consent } = configurationRef.current
      if (providerId === 'marklab-local' || consent) return true
      const provider = await aiApi.getProvider(providerId)
      return provider.kind === 'openai-compatible' && isLoopbackHttpUrl(provider.baseUrl)
    }
    return {
      canComplete: (context) => context.before.trim().length >= 2,
      get debounceMs() {
        return inlineCompletionDebounceMs(configurationRef.current.triggerMode)
      },
      enabled: () => {
        const config = configurationRef.current
        return !config.readOnly && (config.documentEnabled || config.aiEnabled)
      },
      getDocumentCompletions: (context) =>
        configurationRef.current.documentEnabled ? indexRef.current.query(context.before) : [],
      getDocumentKey: () => configurationRef.current.activePath,
      requestCompletion: async (context, excluded, signal) => {
        const config = configurationRef.current
        if (!config.aiEnabled || !config.providerId || config.readOnly) return null
        if (!(await canUseProvider(config.providerId)) || signal.aborted) return null
        revisionRef.current += 1
        const request = buildMarkdownInlineCompletionRequest({
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
      subscribeDocumentKey: (listener) => {
        listenersRef.current.add(listener)
        return () => listenersRef.current.delete(listener)
      },
      subscribeEnabled: (listener) => {
        listenersRef.current.add(listener)
        return () => listenersRef.current.delete(listener)
      },
    }
  }, [configurationRef])
}
