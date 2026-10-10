import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { CompletionItemKind } from 'vscode-languageserver-types'
import { describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'
import { getPlateWorkspaceLinkTrigger } from '@/components/plate/workspaceLink/plateWorkspaceLinkCompletion'

const languageApi = vi.hoisted(() => ({
  openDocument: vi.fn(async (request) => ({ ok: true, version: request.version })),
  changeDocument: vi.fn(async (request) => ({ ok: true, version: request.version })),
  closeDocument: vi.fn(async () => ({ ok: true })),
  completion: vi.fn(async (request) => ({
    isIncomplete: false,
    items: [
      {
        label: 'Target',
        detail: 'notes/Target.md',
        kind: CompletionItemKind.File,
        textEdit: {
          newText: 'Target',
          range: {
            start: { line: request.position.line, character: 2 },
            end: request.position,
          },
        },
      },
    ],
  })),
  diagnostics: vi.fn(async () => []),
}))

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/languageIntelligenceApi', () => ({ languageIntelligenceApi: languageApi }))
vi.mock('@/services/markdownLanguageApi', () => ({
  markdownLanguageApi: { getCodeActions: vi.fn(async () => []) },
}))

describe('PlateEditorSurface workspace-link completion', () => {
  it('completes a typed wiki-link target and closes the link', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/current.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value="See x"
      />,
    )
    const editor = ref.current?.getEditor()
    expect(editor).toBeDefined()

    act(() => {
      editor?.tf.select({ path: [0, 0], offset: 4 })
      editor?.tf.insertText('[[tar')
    })

    expect(editor && getPlateWorkspaceLinkTrigger(editor)?.query).toBe('tar')
    await waitFor(() => expect(languageApi.completion).toHaveBeenCalled())
    const option = await screen.findByRole('option', { name: /Target/ })
    fireEvent.mouseDown(option)

    await waitFor(() => expect(editor?.api.string([])).toBe('See [[Target]]x'))
    expect(languageApi.completion).toHaveBeenCalled()
  })
})
