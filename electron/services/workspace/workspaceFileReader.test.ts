import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import { noopLogger } from '@electron/services/logger'
import { WorkspaceBufferStore } from '@electron/services/workspace/workspaceBuffers'
import { createWorkspaceBufferUpdateHandler } from '@electron/services/workspace/workspaceBufferUpdateHandler'
import { WorkspaceFileReader } from '@electron/services/workspace/workspaceFileReader'

const fixtures: Array<{ root: string; buffers: WorkspaceBufferStore }> = []
const initialContent = '# Original\n'
const createFixture = async (useSidecar = false) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-file-reader-'))
  const file = path.join(root, 'note.md')
  await fs.writeFile(file, initialContent, 'utf8')
  const logger = { ...noopLogger, error: vi.fn() }
  const buffers = new WorkspaceBufferStore({
    errorMessage: (error) => String(error),
    logger,
    markOwnWrite: () => {},
    onBuffersFlushed: () => {},
    resolvePath: (relativePath) => path.join(root, relativePath),
    scheduleSnapshotChanged: () => {},
    setTask: () => {},
    writeFile: ({ writeWithNode }) => writeWithNode(),
  })
  fixtures.push({ root, buffers })
  const readWorkspaceFile = vi.fn<KnowledgeEngineService['readWorkspaceFile']>(
    async (_workspaceId, workspaceRoot, relativePath) =>
      fs.readFile(path.join(workspaceRoot, relativePath), 'utf8'),
  )
  const reader = new WorkspaceFileReader({
    buffers,
    getState: () => ({
      rootKind: 'external',
      rootPath: root,
      internalRoot: root,
      singleFile: null,
    }),
    knowledgeEngineService: useSidecar
      ? ({ readWorkspaceFile } as unknown as KnowledgeEngineService)
      : undefined,
    logger,
    resolvePath: (relativePath) => path.join(root, relativePath),
  })
  return { buffers, file, logger, reader, readWorkspaceFile }
}

afterEach(async () => {
  for (const { buffers } of fixtures) {
    // Tear down unsaved test edits without invoking autosave or leaving write claims behind.
    buffers.delete('note.md')
    buffers.dispose()
  }
  await Promise.all(
    fixtures.splice(0).map(({ root }) => fs.rm(root, { recursive: true, force: true })),
  )
})

describe('WorkspaceFileReader explicit opens', () => {
  it.each([false, true])(
    'refreshes clean content and revisions from persisted storage (sidecar=%s)',
    async (useSidecar) => {
      const { buffers, file, reader, readWorkspaceFile } = await createFixture(useSidecar)
      expect(await reader.open('note.md')).toBe(initialContent)
      const originalRevision = buffers.getStatus('note.md')!.revision
      expect(await reader.open('note.md')).toBe(initialContent)
      expect(buffers.getStatus('note.md')!.revision).toBe(originalRevision)

      await fs.writeFile(file, '# External replacement\n', 'utf8')
      expect(await reader.readForAnalysis('note.md')).toBe(initialContent)
      if (useSidecar) expect(readWorkspaceFile).toHaveBeenCalledTimes(2)
      expect(await reader.open('note.md')).toBe('# External replacement\n')
      expect(buffers.getStatus('note.md')).toEqual({
        path: 'note.md',
        revision: originalRevision + 1,
        dirty: false,
      })
      expect(await reader.open('note.md')).toBe('# External replacement\n')
      expect(buffers.getStatus('note.md')!.revision).toBe(originalRevision + 1)
      expect(await reader.readForAnalysis('note.md')).toBe('# External replacement\n')

      // A later save must compare against the newly read persisted baseline.
      buffers.update('note.md', '# Edited after reopening\n')
      await buffers.flush()
      expect(await fs.readFile(file, 'utf8')).toBe('# Edited after reopening\n')
    },
  )

  it.each([false, true])(
    'keeps unsaved text authoritative without rereading storage (sidecar=%s)',
    async (useSidecar) => {
      const { buffers, file, reader, readWorkspaceFile } = await createFixture(useSidecar)
      await reader.open('note.md')
      const dirtyStatus = buffers.update('note.md', '# Unsaved edit\n')
      await fs.unlink(file)
      expect(await reader.open('note.md')).toBe('# Unsaved edit\n')
      expect(await reader.readForAnalysis('note.md')).toBe('# Unsaved edit\n')
      expect(buffers.getStatus('note.md')).toEqual(dirtyStatus)
      expect(readWorkspaceFile).toHaveBeenCalledTimes(useSidecar ? 1 : 0)
    },
  )

  it.each([false, true])(
    'preserves edits made during an asynchronous persisted read (previously cached=%s)',
    async (cached) => {
      const { buffers, file, reader, readWorkspaceFile } = await createFixture(true)
      if (cached) await reader.open('note.md')
      let release!: () => void
      let started!: () => void
      const entered = new Promise<void>((resolve) => {
        started = resolve
      })
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      readWorkspaceFile.mockImplementationOnce(
        async (_workspaceId, workspaceRoot, relativePath) => {
          const content = await fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
          started()
          await pending
          return content
        },
      )
      const opening = reader.open('note.md')
      await entered
      const dirtyStatus = buffers.update('note.md', '# Typed while opening\n')
      release()
      expect(await opening).toBe('# Typed while opening\n')
      expect(buffers.readCached('note.md')).toBe('# Typed while opening\n')
      expect(buffers.getStatus('note.md')).toEqual(dirtyStatus)
      expect(await fs.readFile(file, 'utf8')).toBe(initialContent)
      await buffers.flush()
      expect(await fs.readFile(file, 'utf8')).toBe('# Typed while opening\n')
    },
  )

  it('keeps a newer completed save when an older read returns', async () => {
    const { buffers, file, reader, readWorkspaceFile } = await createFixture(true)
    await reader.open('note.md')
    let release!: () => void
    let started!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    readWorkspaceFile.mockImplementationOnce(async (_workspaceId, workspaceRoot, relativePath) => {
      const content = await fs.readFile(path.join(workspaceRoot, relativePath), 'utf8')
      started()
      await pending
      return content
    })
    const opening = reader.open('note.md')
    await entered
    buffers.update('note.md', '# Saved during older read\n')
    await buffers.flush()
    const savedStatus = buffers.getStatus('note.md')
    expect(savedStatus?.dirty).toBe(false)
    expect(await fs.readFile(file, 'utf8')).toBe('# Saved during older read\n')
    release()
    expect(await opening).toBe('# Saved during older read\n')
    expect(buffers.readCached('note.md')).toBe('# Saved during older read\n')
    expect(buffers.getStatus('note.md')).toEqual(savedStatus)
    expect(await fs.readFile(file, 'utf8')).toBe('# Saved during older read\n')
  })

  it('reports a deleted persisted file instead of reopening its clean cached text', async () => {
    const { buffers, file, reader } = await createFixture()
    await reader.open('note.md')
    const cachedStatus = buffers.getStatus('note.md')
    await fs.unlink(file)
    await expect(reader.open('note.md')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(buffers.readCached('note.md')).toBe(initialContent)
    expect(buffers.getStatus('note.md')).toEqual(cachedStatus)
  })

  it('propagates sidecar failures instead of returning stale cache or falling back to disk', async () => {
    const { buffers, file, logger, reader, readWorkspaceFile } = await createFixture(true)
    await reader.open('note.md')
    const originalStatus = buffers.getStatus('note.md')
    await fs.writeFile(file, '# Available on disk\n', 'utf8')
    const failure = new Error('sidecar read unavailable')
    readWorkspaceFile.mockRejectedValueOnce(failure)
    await expect(reader.open('note.md')).rejects.toBe(failure)
    expect(buffers.readCached('note.md')).toBe(initialContent)
    expect(buffers.getStatus('note.md')).toEqual(originalStatus)
    expect(logger.error).toHaveBeenCalledWith('workspace vfs read failed', {
      error: failure,
      path: 'note.md',
    })
    expect(await reader.open('note.md')).toBe('# Available on disk\n')
  })

  it('rejects a patch based on a clean revision replaced by an explicit reopen', async () => {
    const { buffers, file, reader } = await createFixture()
    await reader.open('note.md')
    const oldRevision = buffers.getStatus('note.md')!.revision
    await fs.writeFile(file, '# New external text\n', 'utf8')
    await reader.open('note.md')
    const applyUpdate = createWorkspaceBufferUpdateHandler(
      buffers,
      () => {},
      (relativePath, content) => buffers.update(relativePath, content),
      () => 7,
    )
    expect(
      applyUpdate({
        path: 'note.md',
        base_revision: oldRevision,
        session_generation: 7,
        update: {
          kind: 'patch',
          changes: [{ offset: 2, delete_length: 8, insert_text: 'Edited' }],
        },
      }),
    ).toEqual({
      kind: 'resync_required',
      path: 'note.md',
      revision: oldRevision + 1,
      session_generation: 7,
    })
    expect(buffers.readCached('note.md')).toBe('# New external text\n')
    expect(buffers.getStatus('note.md')?.dirty).toBe(false)
    expect(await fs.readFile(file, 'utf8')).toBe('# New external text\n')
    expect(
      applyUpdate({
        path: 'note.md',
        base_revision: oldRevision + 1,
        session_generation: 7,
        update: {
          kind: 'patch',
          changes: [{ offset: 2, delete_length: 3, insert_text: 'Edited' }],
        },
      }),
    ).toMatchObject({ kind: 'applied', revision: oldRevision + 2, dirty: true })
    expect(buffers.readCached('note.md')).toBe('# Edited external text\n')
    await buffers.flush()
    expect(await fs.readFile(file, 'utf8')).toBe('# Edited external text\n')
  })
})
