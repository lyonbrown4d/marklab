import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FsBufferSnapshot } from '@/services/fsApi'
import {
  changed,
  deferred,
  files,
  listeners,
  native,
  openWorkspace,
  pendingNewEditorChange,
  root,
  revision,
  staleEditorChange,
  tree,
} from '@/app/useProjectRename.testSupport'

describe('renaming the initial empty-workspace document', () => {
  it('cancels the old read and keeps rename navigation despite watcher refreshes', async () => {
    const read = deferred<FsBufferSnapshot>()
    const rename = deferred<void>()
    native.openBufferSnapshot.mockImplementationOnce(() => read.promise)
    native.renamePath.mockImplementationOnce(async () => {
      files.delete('Untitled.md')
      files.set('renamed.md', '')
      changed()
      await rename.promise
    })
    openWorkspace()
    await waitFor(() => expect(native.openBufferSnapshot).toHaveBeenCalledWith('Untitled.md'))
    fireEvent.click(screen.getByText('rename'))
    await waitFor(() => expect(native.renamePath).toHaveBeenCalled())
    expect(screen.getByText('edit')).toBeDisabled()
    await act(async () => read.reject(new Error('No such file or directory (os error 2)')))
    expect(screen.getByTestId('error')).toBeEmptyDOMElement()
    expect(native.openBufferSnapshot).toHaveBeenCalledTimes(1)
    // A later invalidation must not increment the request epoch and cancel the
    // authoritative projection that follows the committed rename.
    const projection = deferred<Awaited<ReturnType<typeof tree.listChildren>>>()
    const page = {
      root,
      generation: 1,
      revision,
      nextCursor: null,
      entries: [{ kind: 'file', path: 'renamed.md', hasChildren: false }],
    }
    tree.listChildren.mockImplementationOnce(() => projection.promise)
    await act(async () => rename.resolve())
    await waitFor(() => expect(tree.listChildren).toHaveReturnedWith(projection.promise))
    act(() => {
      for (const listener of listeners)
        listener({
          root,
          generation: 1,
          revision,
          previousRevision: revision - 1,
          kind: 'invalidated',
        })
    })
    await act(async () => projection.resolve(page))
    await waitFor(() =>
      expect(screen.getByTestId('route')).toHaveTextContent('/files/edit/renamed.md'),
    )
    expect(screen.getByTestId('tabs')).toHaveTextContent('file:edit:renamed.md')
    expect(screen.getByTestId('tabs')).not.toHaveTextContent('Untitled.md')
    expect(screen.getByTestId('error')).toBeEmptyDOMElement()
    expect(native.createFile).toHaveBeenCalledExactlyOnceWith('Untitled.md')
    expect([...files.keys()]).toEqual(['renamed.md'])
  })

  it('drains unsaved edits before moving and rejects delayed old-editor writes', async () => {
    const update = deferred<void>()
    const applyUpdate = native.applyBufferUpdate.getMockImplementation()!
    native.applyBufferUpdate.mockImplementationOnce(async (request) => {
      await update.promise
      return applyUpdate(request)
    })
    openWorkspace()
    await waitFor(() =>
      expect(screen.getByTestId('route')).toHaveTextContent('/files/edit/Untitled.md'),
    )
    await waitFor(() => expect(native.openBufferSnapshot).toHaveBeenCalledWith('Untitled.md'))
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    const renamedRead = deferred<FsBufferSnapshot>()
    native.openBufferSnapshot.mockImplementationOnce(() => renamedRead.promise)
    fireEvent.click(screen.getByText('edit'))
    fireEvent.click(screen.getByText('rename'))
    await waitFor(() => expect(native.applyBufferUpdate).toHaveBeenCalled())
    expect(native.renamePath).not.toHaveBeenCalled()
    await act(async () => update.resolve())
    await waitFor(() =>
      expect(screen.getByTestId('route')).toHaveTextContent('/files/edit/renamed.md'),
    )
    expect(screen.getByTestId('value')).toHaveTextContent('unsaved text')
    expect(files.get('renamed.md')).toBe('unsaved text')
    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.getByText('edit')).toBeDisabled()
    const writes = native.applyBufferUpdate.mock.calls.length
    await act(async () => staleEditorChange?.('disposed editor snapshot'))
    expect(native.applyBufferUpdate).toHaveBeenCalledTimes(writes)
    expect(files.has('Untitled.md')).toBe(false)
    expect(screen.getByTestId('value')).toHaveTextContent('unsaved text')
    await act(async () =>
      renamedRead.resolve({
        path: 'renamed.md',
        content: 'unsaved text',
        revision: 1,
        dirty: false,
        session_generation: 1,
      }),
    )
    expect(screen.getByText('edit')).toBeEnabled()
  })

  it('restores the original load after rename failure and keeps genuine errors visible', async () => {
    const firstRead = deferred<FsBufferSnapshot>()
    native.openBufferSnapshot.mockImplementationOnce(() => firstRead.promise)
    native.renamePath.mockRejectedValueOnce(new Error('Permission denied'))
    openWorkspace()
    await waitFor(() => expect(native.openBufferSnapshot).toHaveBeenCalledWith('Untitled.md'))
    fireEvent.click(screen.getByText('rename'))
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('Permission denied'))
    expect(screen.getByTestId('route')).toHaveTextContent('/files/edit/Untitled.md')
    await waitFor(() => expect(native.openBufferSnapshot).toHaveBeenCalledTimes(2))
    expect(files.has('Untitled.md')).toBe(true)
    await act(async () => firstRead.reject(new Error('cancelled old read')))
    expect(screen.getByTestId('error')).not.toHaveTextContent('cancelled old read')
  })

  it('keeps the committed route and tabs editable when the subsequent tree refresh fails', async () => {
    openWorkspace()
    await waitFor(() => expect(screen.getByText('edit')).toBeEnabled())
    tree.listChildren.mockRejectedValueOnce(new Error('Tree refresh failed'))
    fireEvent.click(screen.getByText('rename'))
    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('Tree refresh failed'),
    )
    expect(screen.getByTestId('route')).toHaveTextContent('/files/edit/renamed.md')
    expect(screen.getByTestId('tabs')).toHaveTextContent('file:edit:renamed.md')
    expect(screen.getByTestId('tabs')).not.toHaveTextContent('Untitled.md')
    await waitFor(() => expect(screen.getByText('edit')).toBeEnabled())
    fireEvent.click(screen.getByText('edit'))
    await waitFor(() => expect(files.get('renamed.md')).toBe('unsaved text'))
    expect(files.has('Untitled.md')).toBe(false)
  })

  it('shows an error without an editable cache when the new-path snapshot fails, and permits retry', async () => {
    openWorkspace()
    await waitFor(() => expect(screen.getByText('edit')).toBeEnabled())
    fireEvent.click(screen.getByText('edit'))
    const newRead = deferred<FsBufferSnapshot>()
    native.openBufferSnapshot.mockImplementationOnce(() => newRead.promise)
    fireEvent.click(screen.getByText('rename'))
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('true'))
    await act(async () => newRead.reject(new Error('New snapshot unavailable')))
    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('New snapshot unavailable'),
    )
    expect(screen.getByTestId('route')).toHaveTextContent('/files/edit/renamed.md')
    expect(screen.getByTestId('load-state')).toHaveTextContent('error')
    expect(screen.getByTestId('value')).toBeEmptyDOMElement()
    expect(screen.getByText('edit')).toBeDisabled()
    expect(files.get('renamed.md')).toBe('unsaved text')
    expect(files.has('Untitled.md')).toBe(false)
    const writes = native.applyBufferUpdate.mock.calls.length
    await act(async () => pendingNewEditorChange?.('delayed normalization from unversioned cache'))
    expect(screen.getByTestId('load-state')).toHaveTextContent('error')
    expect(screen.getByTestId('value')).toBeEmptyDOMElement()
    expect(native.applyBufferUpdate).toHaveBeenCalledTimes(writes)
    act(() => changed())
    await waitFor(() => expect(screen.getByTestId('load-state')).toHaveTextContent('ready'))
    expect(screen.getByTestId('value')).toHaveTextContent('unsaved text')
    expect(screen.getByText('edit')).toBeEnabled()
  })

  it('reports a missing file when the read was not cancelled by a path mutation', async () => {
    native.openBufferSnapshot.mockRejectedValueOnce(
      new Error('No such file or directory (os error 2)'),
    )
    openWorkspace()
    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('No such file or directory'),
    )
  })
})
