import { describe, expect, it } from 'vitest'
import { buildAiReplacementPrompt } from '@/components/ai/inlineAiComposerPrompt'

describe('buildAiReplacementPrompt', () => {
  it('keeps the instruction and selected source text in separate prompt sections', () => {
    expect(buildAiReplacementPrompt('Make this concise', 'A long paragraph.')).toBe(
      'Instruction:\nMake this concise\n\nSource text:\nA long paragraph.',
    )
  })

  it('preserves multiline and empty source text without inventing content', () => {
    expect(buildAiReplacementPrompt('Translate to Chinese\nKeep links', '')).toBe(
      'Instruction:\nTranslate to Chinese\nKeep links\n\nSource text:\n',
    )
  })
})
