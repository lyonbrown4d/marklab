import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { editorViewCtx } from '@milkdown/kit/core'
import type { Crepe } from '@milkdown/crepe'
import { useMarkdownEditorAccess } from '@/components/milkdown/useMarkdownEditorAccess'

describe('useMarkdownEditorAccess', () => {
  it('exposes narrow focus, markdown, and EditorView accessors', () => {
    const focus = vi.fn()
    const view = { focus }
    const editor = {
      action: vi.fn((action) =>
        action({ get: (token: unknown) => (token === editorViewCtx ? view : null) }),
      ),
    }
    const crepe = { editor, getMarkdown: () => 'current markdown' } as unknown as Crepe

    const { result } = renderHook(() =>
      useMarkdownEditorAccess({
        crepeRef: { current: crepe },
        latestValueRef: { current: 'fallback markdown' },
      }),
    )

    result.current.focusEditor()
    expect(focus).toHaveBeenCalledOnce()
    expect(result.current.getMarkdown()).toBe('current markdown')
    expect(result.current.getEditorView()).toBe(view)
  })
})
