import { aiApi } from '@/services/aiApi'
import {
  aiInlineCompletionRequestSchema,
  aiInlineCompletionStartResultSchema,
  type AiInlineCompletionRequest,
  type AiInlineCompletionStartResult,
} from '@/types/aiCompletion'
import { aiGenerationEventSchema } from '@/services/aiApi'
import { getDesktopRuntime } from '@/runtime/desktop'

export const aiCompletionApi = {
  async startInlineCompletion(
    input: AiInlineCompletionRequest,
  ): Promise<AiInlineCompletionStartResult> {
    const parsed = aiInlineCompletionRequestSchema.parse(input)
    return aiInlineCompletionStartResultSchema.parse(
      await getDesktopRuntime().aiCompletion.start(parsed),
    )
  },
  async cancelGeneration(requestId: string): Promise<void> {
    const result = await getDesktopRuntime().aiCompletion.cancel(requestId)
    if (!result.ok) throw new Error('Unable to cancel AI inline completion')
  },
  onGenerationEvent(handler: Parameters<typeof aiApi.onGenerationEvent>[0]) {
    return getDesktopRuntime().aiCompletion.onEvent((event) => {
      handler(aiGenerationEventSchema.parse(event))
    })
  },
}
