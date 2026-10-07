import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import watcher from '@parcel/watcher'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FsBufferStatus } from '@electron/services/workspace/types'
import {
  cleanupWorkspaceFileServiceFixtures,
  createKnowledgeServiceMock,
  createWorkspace,
  prepareBufferForSave,
  settleWatcherTasks,
} from '@electron/services/workspace/workspaceFileServiceTestUtils'

vi.mock('@parcel/watcher', () => ({
  default: {
    subscribe: vi.fn(async () => ({
      unsubscribe: vi.fn(async () => undefined),
    })),
  },
}))

afterEach(async () => {
  await cleanupWorkspaceFileServiceFixtures()
})

describe('WorkspaceFileService sidecar mutations', () => {
  it('routes structural mutations to the knowledge sidecar when available', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)

    await workspace.createDir({ path: 'notes' })
    await workspace.createFile({ path: 'notes/a.md' })
    await workspace.renamePath({ from: 'notes/a.md', to: 'notes/b.md' })
    await workspace.deletePath({ path: 'notes/b.md' })

    expect(service.createWorkspaceDirectory).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes',
    )
    expect(service.createWorkspaceFile).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes/a.md',
    )
    expect(service.renameWorkspacePath).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes/a.md',
      'notes/b.md',
    )
    expect(service.deleteWorkspacePath).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes/b.md',
    )
    expect(fsSync.existsSync(path.join(root, 'notes'))).toBe(false)

    workspace.dispose()
  })

  it('creates files with initial content through the knowledge sidecar', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)

    await workspace.createFile({ path: 'notes/a.md', content: '# A\n' })

    expect(service.createWorkspaceFile).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes/a.md',
    )
    expect(service.writeWorkspaceFile).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes/a.md',
      '# A\n',
    )
    expect(workspace.getBufferStatus({ path: 'notes/a.md' })).toMatchObject({ dirty: false })

    workspace.dispose()
  })

  it('routes buffer flush writes to the knowledge sidecar when available', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)
    await prepareBufferForSave(root, workspace, service)
    workspace.updateBuffer({ path: 'notes/a.md', content: '# A' })

    await expect(workspace.flushBuffers()).resolves.toBeUndefined()

    expect(service.writeWorkspaceFile).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      root,
      'notes/a.md',
      '# A',
    )
    expect(await fs.readFile(path.join(root, 'notes', 'a.md'), 'utf8')).toBe('# A')
    expect(workspace.getBufferStatus({ path: 'notes/a.md' })).toMatchObject({ dirty: false })

    workspace.dispose()
  })

  it('propagates sidecar write failures instead of falling back to node filesystem', async () => {
    const service = createKnowledgeServiceMock()
    const error = new Error('sidecar unavailable')
    service.writeWorkspaceFile.mockRejectedValueOnce(error)
    const { logger, root, workspace } = await createWorkspace(service)
    await prepareBufferForSave(root, workspace, service)

    workspace.updateBuffer({ path: 'notes/a.md', content: '# A' })

    await expect(workspace.flushBuffers()).rejects.toMatchObject({ errors: [error] })

    expect(await fs.readFile(path.join(root, 'notes', 'a.md'), 'utf8')).toBe('# Initial')
    expect(workspace.getBufferStatus({ path: 'notes/a.md' })).toMatchObject({ dirty: true })
    expect(logger.error).toHaveBeenCalledWith(
      'workspace vfs write failed',
      expect.objectContaining({ path: 'notes/a.md' }),
    )

    await expect(workspace.flushBuffers()).resolves.toBeUndefined()
    expect(await fs.readFile(path.join(root, 'notes', 'a.md'), 'utf8')).toBe('# A')
    expect(workspace.getBufferStatus({ path: 'notes/a.md' })).toMatchObject({ dirty: false })
    workspace.dispose()
  })

  it('propagates sidecar mutation failures instead of falling back to node filesystem', async () => {
    const service = createKnowledgeServiceMock()
    service.createWorkspaceFile.mockRejectedValueOnce(new Error('sidecar unavailable'))
    const { logger, root, workspace } = await createWorkspace(service)

    await expect(workspace.createFile({ path: 'notes/a.md' })).rejects.toThrow(
      'sidecar unavailable',
    )

    expect(fsSync.existsSync(path.join(root, 'notes', 'a.md'))).toBe(false)
    expect(logger.error).toHaveBeenCalledWith(
      'workspace vfs mutation failed',
      expect.objectContaining({ path: 'notes/a.md' }),
    )

    workspace.dispose()
  })
})

describe('WorkspaceFileService background tasks', () => {
  it('does not emit changed events when reading unchanged task state', async () => {
    const service = createKnowledgeServiceMock()
    const { workspace } = await createWorkspace(service)
    await settleWatcherTasks()
    const listener = vi.fn()

    const dispose = workspace.onBackgroundTasksChanged(listener)
    expect(listener).toHaveBeenCalledTimes(1)

    listener.mockClear()
    workspace.getBackgroundTasks()
    workspace.getBackgroundTasks()

    expect(listener).not.toHaveBeenCalled()

    dispose()
    workspace.dispose()
  })
})

describe('WorkspaceFileService incremental buffers', () => {
  it('applies a patch only when its base revision matches', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)
    await prepareBufferForSave(root, workspace, service)
    const sessionGeneration = workspace.getBufferStatus({ path: 'notes/a.md' })!.session_generation

    expect(
      workspace.applyBufferUpdate({
        path: 'notes/a.md',
        base_revision: 9,
        session_generation: sessionGeneration,
        update: {
          kind: 'patch',
          changes: [{ offset: 2, delete_length: 7, insert_text: 'Changed' }],
        },
      }),
    ).toEqual({
      kind: 'resync_required',
      path: 'notes/a.md',
      revision: 0,
      session_generation: sessionGeneration,
    })
    expect(await workspace.readFile({ path: 'notes/a.md' })).toBe('# Initial')

    expect(
      workspace.applyBufferUpdate({
        path: 'notes/a.md',
        base_revision: 0,
        session_generation: sessionGeneration,
        update: {
          kind: 'patch',
          changes: [{ offset: 2, delete_length: 7, insert_text: 'Changed' }],
        },
      }),
    ).toEqual({
      kind: 'applied',
      path: 'notes/a.md',
      revision: 1,
      dirty: true,
      session_generation: sessionGeneration,
    })
    expect(await workspace.readFile({ path: 'notes/a.md' })).toBe('# Changed')

    await workspace.flushBuffers()
    workspace.dispose()
  })
})

describe('WorkspaceFileService root switching', () => {
  it('keeps the old root and generation when flushing buffers fails', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)
    await prepareBufferForSave(root, workspace, service)
    const status = workspace.getBufferStatus({ path: 'notes/a.md' })!
    workspace.updateBuffer({ path: 'notes/a.md', content: '# Unsaved' })
    service.writeWorkspaceFile.mockRejectedValueOnce(new Error('disk full'))
    const nextRoot = path.join(path.dirname(root), 'failed-next-workspace')
    await fs.mkdir(nextRoot)

    await expect(workspace.setRoot({ path: nextRoot })).rejects.toThrow(
      'Failed to save 1 workspace buffer(s)',
    )

    expect(workspace.rootInfo()).toEqual({ kind: 'external', path: root })
    expect(workspace.getBufferStatus({ path: 'notes/a.md' })).toMatchObject({
      dirty: true,
      session_generation: status.session_generation,
    })
    expect(await fs.readFile(path.join(root, 'notes/a.md'), 'utf8')).toBe('# Initial')

    await workspace.flushBuffers()
    workspace.dispose()
  })

  it('rejects buffer updates from an earlier workspace generation', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)
    await prepareBufferForSave(root, workspace, service)
    const status = workspace.getBufferStatus({ path: 'notes/a.md' }) as FsBufferStatus & {
      session_generation: number
    }
    const nextRoot = path.join(path.dirname(root), 'next-workspace')
    await fs.mkdir(nextRoot)
    await fs.writeFile(path.join(nextRoot, 'notes.md'), '# New workspace')

    await workspace.setRoot({ path: nextRoot })
    expect(
      workspace.applyBufferUpdate({
        path: 'notes/a.md',
        base_revision: status.revision,
        session_generation: status.session_generation,
        update: { kind: 'snapshot', content: '# Stale edit' },
      }),
    ).toEqual(
      expect.objectContaining({
        kind: 'session_mismatch',
        session_generation: expect.any(Number),
      }),
    )
    expect(await fs.readFile(path.join(nextRoot, 'notes.md'), 'utf8')).toBe('# New workspace')

    workspace.dispose()
  })

  it('rejects invalid selections without changing the current root', async () => {
    const { root, workspace } = await createWorkspace(createKnowledgeServiceMock())
    const file = path.join(root, 'note.md')
    await fs.writeFile(file, '# Note')
    await expect(workspace.setRoot({ path: file })).rejects.toThrow('not a directory')
    await expect(workspace.setSingleFile({ path: root })).rejects.toThrow('not a file')
    expect(workspace.rootInfo()).toEqual({ kind: 'external', path: root })
    await expect(workspace.setSingleFile({ path: file })).resolves.toEqual({
      kind: 'single',
      path: file,
    })
    workspace.dispose()
  })

  it('does not restart the watcher when setting the same external root', async () => {
    const service = createKnowledgeServiceMock()
    const { logger, root, workspace } = await createWorkspace(service)
    await settleWatcherTasks()
    const subscribe = vi.mocked(watcher.subscribe)
    const subscribeCalls = subscribe.mock.calls.length
    logger.info.mockClear()

    await expect(workspace.setRoot({ path: root })).resolves.toEqual({
      kind: 'external',
      path: root,
    })

    expect(subscribe).toHaveBeenCalledTimes(subscribeCalls)
    expect(logger.info).not.toHaveBeenCalledWith('workspace root changed', expect.anything())

    workspace.dispose()
  })
})
