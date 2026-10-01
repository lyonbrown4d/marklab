import type { AiInlineCompletionContext } from '@/components/milkdown/aiInlineCompletionContext'
import type { AiCompletionLength, AiCompletionTriggerMode } from '@/store/aiCompletionPreferences'
import type { AiInlineCompletionRequest } from '@/types/aiCompletion'

const PREFIX_LIMIT = 8_192
const SUFFIX_LIMIT = 4_096

const debounceByMode: Record<AiCompletionTriggerMode, number> = {
  fast: 180,
  balanced: 350,
  'battery-saver': 700,
}

export const inlineCompletionDebounceMs = (mode: AiCompletionTriggerMode) => debounceByMode[mode]

type BuildMarkdownInlineCompletionRequestOptions = {
  completionSessionId: string
  context: AiInlineCompletionContext
  excluded: readonly string[]
  includeNearbyContext: boolean
  length: AiCompletionLength
  providerId: string
  revision: number
}

export const buildMarkdownInlineCompletionRequest = ({
  completionSessionId,
  context,
  excluded,
  includeNearbyContext,
  length,
  providerId,
  revision,
}: BuildMarkdownInlineCompletionRequestOptions): AiInlineCompletionRequest => {
  const prefixParts = includeNearbyContext
    ? [...context.precedingBlocks, context.before]
    : [context.before]
  const suffixParts = includeNearbyContext
    ? [context.after, ...context.followingBlocks]
    : [context.after]
  return {
    completionSessionId,
    excludedSuggestions: excluded.slice(0, 2),
    ...(context.heading ? { heading: context.heading.slice(-512) } : {}),
    language: 'auto',
    length,
    prefix: prefixParts.join('\n').slice(-PREFIX_LIMIT),
    providerId,
    revision,
    suffix: suffixParts.join('\n').slice(0, SUFFIX_LIMIT),
  }
}
