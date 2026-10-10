import type { SlateEditor } from 'platejs'
import { describe, expect, it, vi } from 'vitest'
import { plateCodeBlockMarkdownInputRules } from '@/components/plate/plateMarkdownInputRules'

type FenceResolveContext = {
  editor: SlateEditor
  getBlockEntry: () => [{ type: string }, number[]] | undefined
  getBlockStartRange: () => object | undefined
  getBlockStartText: () => string | undefined
  isCollapsed: boolean
}

type FenceRule = {
  resolve: (context: FenceResolveContext) => unknown
}

const createResolveContext = (overrides: Partial<FenceResolveContext> = {}) => {
  const editor = {
    api: { isEnd: vi.fn(() => true) },
    getType: vi.fn(() => 'p'),
    selection: { focus: { offset: 10, path: [0, 0] } },
  } as unknown as SlateEditor

  return {
    editor,
    getBlockEntry: () => [{ type: 'p' }, [0]],
    getBlockStartRange: () => ({}),
    getBlockStartText: () => '```mermaid',
    isCollapsed: true,
    ...overrides,
  } satisfies FenceResolveContext
}

describe('Plate Markdown language fence rule', () => {
  const languageFenceRule = plateCodeBlockMarkdownInputRules[1] as unknown as FenceRule

  it('does not resolve an expanded selection or a non-paragraph block', () => {
    expect(languageFenceRule.resolve(createResolveContext({ isCollapsed: false }))).toBeUndefined()
    expect(
      languageFenceRule.resolve(createResolveContext({ getBlockEntry: () => undefined })),
    ).toBeUndefined()
  })

  it('does not resolve a fence away from the end of its paragraph', () => {
    const context = createResolveContext()
    vi.mocked(context.editor.api.isEnd).mockReturnValue(false)

    expect(languageFenceRule.resolve(context)).toBeUndefined()
  })
})
