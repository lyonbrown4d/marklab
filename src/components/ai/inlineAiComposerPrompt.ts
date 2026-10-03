import type { AiQuickAction } from '@/components/ai/AiInlineComposer'

export type InlineAiComposerMessages = {
  defaultProviderUnavailable: string
  noProvider: string
  quickActionInstructions: Record<AiQuickAction, string>
  staleSelection: string
}

export const buildAiReplacementPrompt = (instruction: string, sourceText: string) =>
  `Instruction:\n${instruction}\n\nSource text:\n${sourceText}`
