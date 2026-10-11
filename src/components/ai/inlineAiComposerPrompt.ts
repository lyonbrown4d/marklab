import type { AiQuickAction } from '@/components/ai/AiInlineComposer'

export type AiComposerOutputKind = 'replacement' | 'explanation'

export type InlineAiComposerMessages = {
  defaultProviderUnavailable: string
  noProvider: string
  quickActionInstructions: Record<AiQuickAction, string>
  staleSelection: string
}

export const buildAiReplacementPrompt = (instruction: string, sourceText: string) =>
  `Instruction:\n${instruction}\n\nSource text:\n${sourceText}`

export const getAiQuickActionOutputKind = (action: AiQuickAction): AiComposerOutputKind =>
  action === 'explain' ? 'explanation' : 'replacement'

export const isAiReplacementOutput = (outputKind: AiComposerOutputKind) =>
  outputKind === 'replacement'

export const getAiComposerSystemPrompt = (outputKind: AiComposerOutputKind) =>
  outputKind === 'explanation'
    ? 'Explain the source text without rewriting it. Return only the plain-text explanation.'
    : 'Return only plain replacement text. Do not include HTML or commentary.'
