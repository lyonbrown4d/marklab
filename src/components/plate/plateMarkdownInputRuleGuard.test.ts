import type { AnyInputRule, SelectionInputRuleContext, SlateEditor } from 'platejs'
import { describe, expect, it, vi } from 'vitest'
import {
  setPlateMarkdownInputRulesComposing,
  withPlateMarkdownInputRuleGuard,
} from '@/components/plate/plateMarkdownInputRuleGuard'

const createContext = ({ codeBlock = false }: { codeBlock?: boolean } = {}) => {
  const editor = {
    api: { some: vi.fn(() => codeBlock) },
    getType: vi.fn(() => 'code_block'),
  } as unknown as SlateEditor

  return { context: { editor } as SelectionInputRuleContext, editor }
}

describe('Plate Markdown input rule guard', () => {
  it('fails closed when a new Plate input target has no explicit guard contract', () => {
    const unsupported = { target: 'insertData' } as unknown as AnyInputRule

    expect(() => withPlateMarkdownInputRuleGuard(unsupported)).toThrow(
      'Unsupported Plate Markdown input rule target "insertData". ' +
        'Add an explicit guarded context before enabling this rule.',
    )
  })

  it.each(['insertText', 'insertBreak'] as const)(
    'allows %s outside composition and delegates the original predicate',
    (target) => {
      const originalEnabled = vi.fn((context: SelectionInputRuleContext) => {
        void context
        return false
      })
      const rule = withPlateMarkdownInputRuleGuard({ enabled: originalEnabled, target })
      const { context } = createContext()

      expect(rule.enabled(context as never)).toBe(false)
      expect(originalEnabled).toHaveBeenCalledWith(context)
    },
  )

  it.each(['insertText', 'insertBreak'] as const)(
    'blocks %s during composition and inside code blocks',
    (target) => {
      const composing = createContext()
      const originalEnabled = vi.fn((context: SelectionInputRuleContext) => {
        void context
        return true
      })
      const rule = withPlateMarkdownInputRuleGuard({ enabled: originalEnabled, target })
      setPlateMarkdownInputRulesComposing(composing.editor, true)

      expect(rule.enabled(composing.context as never)).toBe(false)
      expect(originalEnabled).not.toHaveBeenCalled()
      setPlateMarkdownInputRulesComposing(composing.editor, false)

      const codeBlock = createContext({ codeBlock: true })
      expect(rule.enabled(codeBlock.context as never)).toBe(false)
      expect(originalEnabled).not.toHaveBeenCalled()
    },
  )
})
