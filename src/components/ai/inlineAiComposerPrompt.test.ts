import { describe, expect, it } from 'vitest'
import {
  buildAiReplacementPrompt,
  getAiComposerSystemPrompt,
  getAiQuickActionOutputKind,
  isAiReplacementOutput,
} from '@/components/ai/inlineAiComposerPrompt'

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

describe('inline AI output semantics', () => {
  it('keeps rewrite actions in replacement mode', () => {
    expect(getAiQuickActionOutputKind('rewrite')).toBe('replacement')
    expect(getAiQuickActionOutputKind('concise')).toBe('replacement')
    expect(isAiReplacementOutput('replacement')).toBe(true)
    expect(getAiComposerSystemPrompt('replacement')).toContain('replacement text')
  })

  it('treats Explain as a non-destructive explanation', () => {
    expect(getAiQuickActionOutputKind('explain')).toBe('explanation')
    expect(isAiReplacementOutput('explanation')).toBe(false)
    expect(getAiComposerSystemPrompt('explanation')).toContain('without rewriting it')
  })
})
