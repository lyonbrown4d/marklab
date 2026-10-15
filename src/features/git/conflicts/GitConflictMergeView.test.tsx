import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  conflictApi,
  conflictSnapshot,
  markedResult,
  monacoState,
  renderConflict,
  resetConflictMocks,
} from '@/features/git/conflicts/conflictTestFixtures'
import { GitConflictMergeView } from '@/components/git/GitConflictMergeView'
import { executeFocusedCodeEditorCommand } from '@/lib/focusedCodeEditor'

beforeEach(resetConflictMocks)
const show = async () => {
  const onClose = vi.fn()
  const rendered = renderConflict(
    <GitConflictMergeView
      rootPath="/repo"
      request={{ path: 'example.ts', section: 'conflicts' }}
      onClose={onClose}
    />,
  )
  await screen.findByRole('textbox', { name: 'Editable merge result' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
  return { ...rendered, onClose, user: userEvent.setup() }
}

describe('GitConflictMergeView editing and choices', () => {
  it('opens editable source comparisons for code, blocks staging unresolved markers and never autosaves typing', async () => {
    const { user } = await show()
    expect(screen.getByTestId('conflict-monaco')).toHaveAttribute('data-language', 'typescript')
    expect(screen.getByRole('textbox')).not.toHaveAttribute('readonly')
    expect(monacoState.lastOptions).toMatchObject({
      readOnly: false,
      originalEditable: false,
      useInlineViewWhenSpaceIsLimited: true,
    })
    expect(screen.getByRole('button', { name: 'Save and stage' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: 'Incoming' }))
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      screen.getByRole('tab', { name: 'Incoming' }).id,
    )
    expect(screen.getByLabelText('Read-only comparison')).toHaveTextContent('incoming();')
    await user.click(screen.getByRole('tab', { name: 'Base' }))
    expect(screen.getByLabelText('Read-only comparison')).toHaveTextContent('previous();')
    await user.type(screen.getByRole('textbox'), '// manual')
    expect(conflictApi.saveConflict).not.toHaveBeenCalled()
    expect(screen.getByText('Unsaved resolution')).toBeInTheDocument()
  })

  it.each([
    ['Keep current: conflict 1', 'current();'],
    ['Keep incoming: conflict 1', 'incoming();'],
    ['Keep both: conflict 1', 'current();\nincoming();'],
  ] as const)(
    'resolves a block with %s while retaining outside context and undo',
    async (label, result) => {
      const { user } = await show()
      await user.click(screen.getByRole('button', { name: label }))
      expect(screen.getByRole('textbox')).toHaveValue(`start\n${result}\nend\n`)
      expect(monacoState.executeEdits).toHaveBeenCalledWith(
        'git-conflict-resolution',
        expect.any(Array),
      )
      expect(monacoState.pushUndoStop).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('button', { name: 'Save and stage' })).toBeEnabled()
      await user.keyboard('{Control>}z{/Control}')
      expect(screen.getByRole('textbox')).toHaveValue(markedResult)
      expect(screen.getByRole('button', { name: 'Save and stage' })).toBeDisabled()
    },
  )

  it('routes native Undo to the result and clears focused-editor ownership on unmount', async () => {
    const { user, unmount } = await show()
    await user.click(screen.getByRole('button', { name: 'Keep incoming: conflict 1' }))
    act(() => expect(executeFocusedCodeEditorCommand('edit.undo')).toBe(true))
    expect(screen.getByRole('textbox')).toHaveValue(markedResult)
    unmount()
    expect(executeFocusedCodeEditorCommand('edit.undo')).toBe(false)
  })

  it('routes native Copy and Select All to the focused comparison or result pane', async () => {
    const { user, unmount } = await show()
    await user.click(screen.getByLabelText('Read-only comparison'))
    for (const [action, command] of [
      ['edit.copy', 'editor.action.clipboardCopyAction'],
      ['edit.select_all', 'editor.action.selectAll'],
    ]) {
      act(() => expect(executeFocusedCodeEditorCommand(action)).toBe(true))
      expect(monacoState.originalTrigger).toHaveBeenLastCalledWith(
        'marklab.editMenu',
        command,
        null,
      )
    }
    expect(monacoState.modifiedTrigger).not.toHaveBeenCalled()
    await user.click(screen.getByRole('textbox'))
    act(() => expect(executeFocusedCodeEditorCommand('edit.copy')).toBe(true))
    expect(monacoState.modifiedTrigger).toHaveBeenCalledWith(
      'marklab.editMenu',
      'editor.action.clipboardCopyAction',
      null,
    )
    expect(monacoState.originalTrigger).toHaveBeenCalledTimes(2)
    await user.click(screen.getByLabelText('Read-only comparison'))
    unmount()
    expect(executeFocusedCodeEditorCommand('edit.copy')).toBe(false)
  })

  it('saves manually edited result without staging and uses the returned revision for the next write', async () => {
    const { user, client } = await show()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'resolved();')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText('Saved result')).toBeInTheDocument())
    expect(conflictApi.saveConflict).toHaveBeenCalledWith({
      path: 'example.ts',
      content: 'resolved();',
      revision: 'a'.repeat(64),
      stage: false,
      deleteFile: false,
    })
    for (const name of [
      'git-status',
      'git-remote',
      'git-history',
      'git-branches',
      'git-stashes',
      'git-operation',
      'git-conflict',
    ])
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [name, '/repo'] })
    await user.type(screen.getByRole('textbox'), 'again();')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(conflictApi.saveConflict.mock.calls[1]?.[0]).toMatchObject({
      revision: 'b'.repeat(64),
      stage: false,
    })
  })

  it('saves and stages resolved content and returns to Source Control', async () => {
    conflictApi.saveConflict.mockResolvedValue({
      revision: 'b'.repeat(64),
      status: {},
      staged: true,
    })
    const { user, onClose } = await show()
    await user.click(screen.getByRole('button', { name: 'Use incoming file' }))
    expect(screen.getByRole('textbox')).toHaveValue('incoming();\n')
    await user.click(screen.getByRole('button', { name: 'Save and stage' }))
    expect(conflictApi.saveConflict).toHaveBeenCalledWith({
      path: 'example.ts',
      content: 'incoming();\n',
      revision: 'a'.repeat(64),
      stage: true,
      deleteFile: false,
    })
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('keeps manual result and the original expected revision when a save is stale', async () => {
    const { user, client } = await show()
    conflictApi.getConflict.mockResolvedValue({
      ...conflictSnapshot,
      result: 'external();',
      revision: 'c'.repeat(64),
    })
    conflictApi.saveConflict.mockRejectedValue(new Error('File changed; reload before saving'))
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'my draft();')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(
        screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('File changed')),
      ).toBe(true),
    )
    expect(screen.getByRole('textbox')).toHaveValue('my draft();')
    expect(client.getQueryData(['git-conflict', '/repo', 'example.ts'])).toMatchObject({
      revision: 'c'.repeat(64),
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(conflictApi.saveConflict.mock.calls[1]?.[0]).toMatchObject({
      revision: 'a'.repeat(64),
      content: 'my draft();',
    })
  })

  it('guards repeated saves and makes result read-only while any repository action is pending', async () => {
    let finish: ((value: unknown) => void) | undefined
    conflictApi.saveConflict.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const { user } = await show()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(conflictApi.saveConflict).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    await act(async () => finish?.({ status: {}, revision: 'b'.repeat(64), staged: false }))
    await waitFor(() => expect(screen.getByRole('textbox')).not.toHaveAttribute('readonly'))
  })

  it('supports ordinary keyboard Save independently from staging', async () => {
    const { user } = await show()
    screen.getByRole('textbox').focus()
    await user.keyboard('{Control>}s{/Control}')
    expect(conflictApi.saveConflict).toHaveBeenCalledWith(expect.objectContaining({ stage: false }))
  })
})
