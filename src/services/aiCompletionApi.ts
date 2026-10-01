import { aiApi } from '@/services/aiApi'
import {
  aiInlineCompletionRequestSchema,
  aiInlineCompletionStartResultSchema,
  type AiInlineCompletionRequest,
  type AiInlineCompletionStartResult,
} from '@/types/aiCompletion'
import { aiGenerationEventSchema } from '@/services/aiApi'
import { getElectronRuntime } from '@/runtime/electron'

export const aiCompletionApi = {
  async startInlineCompletion(
    input: AiInlineCompletionRequest,
  ): Promise<AiInlineCompletionStartResult> {
    const parsed = aiInlineCompletionRequestSchema.parse(input)
    return aiInlineCompletionStartResultSchema.parse(
      await getElectronRuntime().aiCompletion.start(parsed),
    )
  },
  async cancelGeneration(requestId: string): Promise<void> {
    const result = await getElectronRuntime().aiCompletion.cancel(requestId)
    if (!result.ok) throw new Error('Unable to cancel AI inline completion')
  },
  onGenerationEvent(handler: Parameters<typeof aiApi.onGenerationEvent>[0]) {
    return getElectronRuntime().aiCompletion.onEvent((event) => {
      handler(aiGenerationEventSchema.parse(event))
    })
  },
}
