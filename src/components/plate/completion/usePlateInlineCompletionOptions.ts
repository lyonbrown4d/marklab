import { useEffect, useMemo, useRef, useState } from 'react'
import { useLatest } from 'ahooks'
import {
  buildPlateInlineCompletionRequest,
  plateInlineCompletionDebounceMs,
} from '@/components/plate/completion/plateInlineCompletionRequest'
import type {
  PlateInlineCompletionControllerOptions,
  UsePlateInlineCompletionOptions,
} from '@/components/plate/completion/types'
import { isLoopbackHttpUrl } from '@/components/settings/aiProviderUtils'
import { DocumentCompletionIndex } from '@/logic/documentCompletionIndex'
import { aiApi } from '@/services/aiApi'
import { requestAiInlineCompletion } from '@/services/aiInlineCompletionRequest'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const INDEX_REBUILD_DELAY_MS = 180
let fallbackSessionId = 0

const createSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  fallbackSessionId += 1
  return `plate-completion-${fallbackSessionId}`
}

const canUseProvider = async (providerId: string, cloudConsent: boolean) => {
  if (providerId === 'marklab-local' || cloudConsent) return true
  const provider = await aiApi.getProvider(providerId)
  return provider.kind === 'openai-compatible' && isLoopbackHttpUrl(provider.baseUrl)
}

export const usePlateInlineCompletionOptions = ({
  activePath,
  readOnly,
  value,
}: Omit<UsePlateInlineCompletionOptions, 'editor'>) => {
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
  const revisionRef = useRef(0)
  const sessionIdRef = useRef(createSessionId())
  const [indexRevision, setIndexRevision] = useState(0)

  useEffect(() => {
    indexVersionRef.current += 1
    const version = indexVersionRef.current
    if (indexPathRef.current !== activePath) {
      indexPathRef.current = activePath
      indexRef.current.destroy()
      indexRef.current = new DocumentCompletionIndex()
    }
    const timer = window.setTimeout(() => {
      indexRef.current.rebuild(value, version)
      setIndexRevision((current) => current + 1)
    }, INDEX_REBUILD_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [activePath, value])

  useEffect(
    () => () => {
      indexRef.current.destroy()
    },
    [],
  )

  const options = useMemo<PlateInlineCompletionControllerOptions>(
    () => ({
      canComplete: (context) => context.before.trim().length >= 2,
      debounceMs: () => plateInlineCompletionDebounceMs(configurationRef.current.triggerMode),
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
    [configurationRef],
  )

  return {
    indexRevision,
    options,
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
