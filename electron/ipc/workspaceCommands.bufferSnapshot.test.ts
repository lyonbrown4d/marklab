import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { registerWorkspaceCommandsIpc } from '@electron/ipc/workspaceCommands'
import { allowedCommands } from '@electron/preload/allowlists'
import {
  cleanupWorkspaceFileServiceFixtures,
  createKnowledgeServiceMock,
  createWorkspace,
} from '@electron/services/workspace/workspaceFileServiceTestUtils'
import type { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService'
import { fsBufferSnapshotSchema } from '@/services/fsBufferSchemas'

vi.mock('@parcel/watcher', () => ({
  default: { subscribe: vi.fn(async () => ({ unsubscribe: vi.fn(async () => undefined) })) },
}))

type Handler = (event: { sender: { id: number } }, payload: unknown) => unknown
const event = { sender: { id: 1 } }
const register = (workspace: WorkspaceFileService) => {
  const handlers = new Map<string, Handler>()
  const addRecentDocument = vi.fn()
  registerWorkspaceCommandsIpc(
    { handle: (command: string, handler: Handler) => handlers.set(command, handler) } as never,
    {
      app: { addRecentDocument },
      exportService: {} as never,
      graphLayoutStore: {} as never,
      localHistoryService: {} as never,
      logger: { info: vi.fn(), warn: vi.fn() } as never,
      platform: 'win32',
      workspaceRegistry: { serviceForWebContents: () => workspace } as never,
    },
  )
  const invoke = (payload: unknown) => handlers.get('fs_open_buffer_snapshot')!(event, payload)
  return { addRecentDocument, invoke }
}

afterEach(cleanupWorkspaceFileServiceFixtures)

describe('Electron atomic buffer snapshot compatibility', () => {
  it('returns one content/revision pair during a competing CAS edit through the named IPC', async () => {
    const service = createKnowledgeServiceMock()
    service.writeWorkspaceFile.mockImplementation(
      async (_id: string, workspaceRoot: string, relativePath: string, content: string) => {
        await fs.writeFile(path.join(workspaceRoot, relativePath), content)
        return { changed: true, kind: 'file' as const }
      },
    )
    const { root, workspace } = await createWorkspace(service)
    const file = path.join(root, 'note.md')
    await fs.writeFile(file, '# Persisted')
    const { addRecentDocument, invoke } = register(workspace)
    try {
      expect(allowedCommands.has('fs_open_buffer_snapshot')).toBe(true)
      const initial = fsBufferSnapshotSchema.parse(await invoke({ path: 'note.md' }))
      expect(initial).toEqual({
        content: '# Persisted',
        path: 'note.md',
        revision: 0,
        dirty: false,
        session_generation: workspace.getSessionGeneration(),
      })
      expect(addRecentDocument).toHaveBeenCalledExactlyOnceWith(file)
      const update = (base_revision: number, content: string) =>
        workspace.applyBufferUpdate({
          path: 'note.md',
          base_revision,
          session_generation: initial.session_generation,
          update: { kind: 'snapshot', content },
        })
      expect(update(initial.revision, '# First draft')).toMatchObject({
        kind: 'applied',
        revision: 1,
      })

      // The read resumes first; the competing edit runs before its caller's await resumes.
      // Awaiting openFile and then querying status would pair the old text with revision 2.
      const opening = invoke({ path: 'note.md' })
      const competing = Promise.resolve().then(() => update(1, '# Concurrent draft'))
      const [rawSnapshot, applied] = await Promise.all([opening, competing])
      const snapshot = fsBufferSnapshotSchema.parse(rawSnapshot)
      expect(snapshot).toEqual({ ...initial, content: '# First draft', revision: 1, dirty: true })
      expect(applied).toMatchObject({ kind: 'applied', revision: 2, dirty: true })
      expect(update(snapshot.revision, '# Stale overwrite')).toMatchObject({
        kind: 'resync_required',
        revision: 2,
      })
      expect(await workspace.openBufferSnapshot({ path: 'note.md' })).toEqual({
        ...snapshot,
        content: '# Concurrent draft',
        revision: 2,
      })
      expect(await fs.readFile(file, 'utf8')).toBe('# Persisted')
      await workspace.flushBuffers()
      expect(await fs.readFile(file, 'utf8')).toBe('# Concurrent draft')
      await expect(invoke({ path: '../outside.md' })).rejects.toThrow()
      expect(addRecentDocument).toHaveBeenCalledTimes(1)
    } finally {
      await workspace.flushBuffers()
      workspace.dispose()
    }
  })

  it('rejects an old in-flight read without populating the replacement workspace buffer', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)
    await fs.writeFile(path.join(root, 'note.md'), '# Old root')
    const nextRoot = path.join(root, 'next')
    await fs.mkdir(nextRoot)
    await fs.writeFile(path.join(nextRoot, 'note.md'), '# New root')
    let started!: () => void
    let release!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    service.readWorkspaceFile.mockImplementationOnce(async () => {
      const content = await fs.readFile(path.join(root, 'note.md'), 'utf8')
      started()
      await pending
      return content
    })
    try {
      const opening = workspace.openBufferSnapshot({ path: 'note.md' })
      const rejected = expect(opening).rejects.toThrow('Workspace changed')
      await entered
      const previousGeneration = workspace.getSessionGeneration()
      await workspace.setRoot({ path: nextRoot })
      release()
      await rejected
      expect(workspace.getBufferStatus({ path: 'note.md' })).toBeNull()
      expect(await workspace.openBufferSnapshot({ path: 'note.md' })).toEqual({
        content: '# New root',
        path: 'note.md',
        revision: 0,
        dirty: false,
        session_generation: previousGeneration + 1,
      })
    } finally {
      release?.()
      workspace.dispose()
    }
  })
})
