import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  conflictApi,
  conflictSnapshot,
  configure,
  renderConflict,
  resetConflictMocks,
} from '@/features/git/conflicts/conflictTestFixtures'
import { GitConflictMergeView } from '@/components/git/GitConflictMergeView'
import {
  hasGitConflictDraft,
  requestGitConflictClose,
  saveMountedGitConflictDraft,
} from '@/features/git/conflicts/conflictDraftStore'
import { flushEditorChangesForClose } from '@/app/editorCloseLifecycle'

beforeEach(resetConflictMocks)
const view = (onClose = vi.fn(), rootPath = '/repo', path = 'example.ts') => (
  <GitConflictMergeView
    rootPath={rootPath}
    request={{ path, section: 'conflicts' }}
    onClose={onClose}
  />
)
const show = async () => {
  const onClose = vi.fn()
  const rendered = renderConflict(view(onClose))
  await screen.findByRole('textbox', { name: 'Editable merge result' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
  return { ...rendered, onClose, user: userEvent.setup() }
}

describe('Git conflict draft lifecycle', () => {
  it('requires Save, Discard or Cancel before closing a dirty resolution', async () => {
    const { user, onClose } = await show()
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'manual();')
    expect(hasGitConflictDraft('/repo', 'example.ts')).toBe(true)
    await expect(flushEditorChangesForClose()).rejects.toThrow('Save or discard')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    const dialog = screen.getByRole('dialog', { name: 'Unsaved conflict resolution' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('manual();')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(conflictApi.saveConflict).not.toHaveBeenCalled()
    expect(hasGitConflictDraft('/repo', 'example.ts')).toBe(false)
    await expect(flushEditorChangesForClose()).resolves.toBeUndefined()
  })

  it('saves from the close dialog without staging before approving the queued native tab close', async () => {
    const { user, onClose } = await show()
    await user.type(screen.getByRole('textbox'), '// draft')
    const approve = vi.fn()
    act(() => expect(requestGitConflictClose('/repo', 'example.ts', approve)).toBe(true))
    const dialog = screen.getByRole('dialog', { name: 'Unsaved conflict resolution' })
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(approve).toHaveBeenCalledOnce())
    expect(onClose).not.toHaveBeenCalled()
    expect(conflictApi.saveConflict).toHaveBeenCalledWith(expect.objectContaining({ stage: false }))
  })

  it('retains dirty drafts across unmount and restores them with the original revision after an external change', async () => {
    const { user, unmount } = await show()
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'preserve();')
    unmount()
    await expect(flushEditorChangesForClose()).rejects.toThrow('Save or discard')
    conflictApi.getConflict.mockResolvedValue({
      ...conflictSnapshot,
      revision: 'c'.repeat(64),
      result: 'external();',
    })
    const approve = vi.fn()
    expect(requestGitConflictClose('/repo', 'example.ts', approve)).toBe(true)
    renderConflict(view())
    const dialog = await screen.findByRole('dialog', { name: 'Unsaved conflict resolution' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByRole('textbox')).toHaveValue('preserve();')
    expect(screen.getByText(/The file or conflict index changed/)).toBeInTheDocument()
    await act(async () => {
      await saveMountedGitConflictDraft('/repo', 'example.ts')
    })
    expect(conflictApi.saveConflict).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'preserve();', revision: 'a'.repeat(64) }),
    )
    expect(approve).not.toHaveBeenCalled()
  })

  it('recovers a draft for copying after external resolution removed its conflict, without permitting writes', async () => {
    const { user, unmount } = await show()
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'recovery();')
    unmount()
    conflictApi.getConflict.mockRejectedValue(new Error('File has no unresolved conflict'))
    const onClose = vi.fn()
    renderConflict(view(onClose))
    const result = await screen.findByRole('textbox', { name: 'Editable merge result' })
    expect(result).toHaveValue('recovery();')
    expect(screen.getByRole('alert')).toHaveTextContent('File has no unresolved conflict')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save and stage' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Use incoming file' })).toBeDisabled()
    await act(async () =>
      expect(await saveMountedGitConflictDraft('/repo', 'example.ts')).toBe(false),
    )
    expect(conflictApi.saveConflict).not.toHaveBeenCalled()
    await user.clear(result)
    await user.type(result, 'recovery();')
    expect(hasGitConflictDraft('/repo', 'example.ts')).toBe(true)
    await expect(flushEditorChangesForClose()).rejects.toThrow('Save or discard')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    const dialog = screen.getByRole('dialog', { name: 'Unsaved conflict resolution' })
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(hasGitConflictDraft('/repo', 'example.ts')).toBe(false)
    await expect(flushEditorChangesForClose()).resolves.toBeUndefined()
  })

  it('isolates drafts by workspace and file and guards before discarding to reload', async () => {
    const { user, unmount } = await show()
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'draft();')
    await user.click(screen.getByRole('button', { name: 'Reload from disk' }))
    const reload = screen.getByRole('dialog', { name: 'Reload conflict' })
    await user.click(within(reload).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('textbox')).toHaveValue('draft();')
    conflictApi.getConflict.mockResolvedValue({
      ...conflictSnapshot,
      result: 'fresh();',
      revision: 'c'.repeat(64),
    })
    await user.click(screen.getByRole('button', { name: 'Reload from disk' }))
    await user.click(screen.getByRole('button', { name: 'Discard and reload' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('textbox')).toHaveValue('fresh();')
    expect(hasGitConflictDraft('/repo', 'example.ts')).toBe(false)
    unmount()
    conflictApi.getConflict.mockResolvedValue({
      ...conflictSnapshot,
      path: 'other.ts',
      result: 'other();',
    })
    renderConflict(view(vi.fn(), '/other', 'other.ts'))
    expect(await screen.findByRole('textbox')).toHaveValue('other();')
    expect(hasGitConflictDraft('/other', 'other.ts')).toBe(false)
  })

  it('keeps failed close-save content and confirmation open rather than approving tab closure', async () => {
    const { user, onClose } = await show()
    conflictApi.saveConflict.mockRejectedValue(new Error('Stale conflict revision'))
    await user.type(screen.getByRole('textbox'), '// keep draft')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    const dialog = screen.getByRole('dialog', { name: 'Unsaved conflict resolution' })
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Stale conflict revision')
    expect(onClose).not.toHaveBeenCalled()
    expect(hasGitConflictDraft('/repo', 'example.ts')).toBe(true)
  })

  it('shows binary/oversize load errors and supports retry without falling back to rich text', async () => {
    conflictApi.getConflict.mockRejectedValueOnce(new Error('Binary file cannot be previewed'))
    const user = userEvent.setup()
    renderConflict(view())
    expect(await screen.findByRole('alert')).toHaveTextContent('Binary file cannot be previewed')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /WYSIWYG/ })).not.toBeInTheDocument()
  })

  it('reports Monaco loading failure explicitly', async () => {
    configure.mockRejectedValue(new Error('Worker unavailable'))
    renderConflict(view())
    expect(await screen.findByRole('alert')).toHaveTextContent('Worker unavailable')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
