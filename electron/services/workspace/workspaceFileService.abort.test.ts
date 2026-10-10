import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import watcher from '@parcel/watcher'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupWorkspaceFileServiceFixtures,
  createKnowledgeServiceMock,
  createWorkspace,
  prepareBufferForSave,
} from '@electron/services/workspace/workspaceFileServiceTestUtils'

vi.mock('@parcel/watcher', () => ({
  default: {
    subscribe: vi.fn(async () => ({ unsubscribe: vi.fn(async () => undefined) })),
  },
}))

afterEach(async () => {
  vi.restoreAllMocks()
  await cleanupWorkspaceFileServiceFixtures()
})

describe('WorkspaceFileService root switch cancellation', () => {
  it('allows edits immediately after an in-flight root switch is aborted', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)
    await prepareBufferForSave(root, workspace, service)
    const target = path.join(path.dirname(root), 'aborted-edit-unblock')
    await fs.mkdir(target)
    const actualStat = await fs.stat(target)
    let finishSelection!: () => void
    const selection = new Promise<typeof actualStat>((resolve) => {
      finishSelection = () => resolve(actualStat)
    })
    vi.spyOn(fsSync.promises, 'stat').mockReturnValueOnce(selection)
    const controller = new AbortController()

    const switching = workspace.setRoot({ path: target }, { signal: controller.signal })
    controller.abort()

    expect(() =>
      workspace.updateBuffer({ path: 'notes/a.md', content: '# Still editable' }),
    ).not.toThrow()
    expect(workspace.rootInfo()).toEqual({ kind: 'external', path: root })
    finishSelection()
    await expect(switching).rejects.toMatchObject({ name: 'AbortError' })
    expect(workspace.rootInfo()).toEqual({ kind: 'external', path: root })
    expect(workspace.getBufferStatus({ path: 'notes/a.md' })).toMatchObject({ dirty: true })
    await workspace.flushBuffers()
    workspace.dispose()
  })

  it('does not commit workspace state when buffer flush completes after abort', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)
    await prepareBufferForSave(root, workspace, service)
    workspace.updateBuffer({ path: 'notes/a.md', content: '# Pending' })
    let finishWrite!: () => void
    const writeAllowed = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    service.writeWorkspaceFile.mockImplementationOnce(
      async (_id: string, workspaceRoot: string, relativePath: string, content: string) => {
        await writeAllowed
        await fs.writeFile(path.join(workspaceRoot, relativePath), content)
        return { changed: true, kind: 'file' as const }
      },
    )
    const nextRoot = path.join(path.dirname(root), 'aborted-next-workspace')
    await fs.mkdir(nextRoot)
    const controller = new AbortController()
    const subscribeCalls = vi.mocked(watcher.subscribe).mock.calls.length

    const switching = workspace.setRoot({ path: nextRoot }, { signal: controller.signal })
    await vi.waitFor(() => expect(service.writeWorkspaceFile).toHaveBeenCalled())
    controller.abort()
    finishWrite()

    await expect(switching).rejects.toMatchObject({ name: 'AbortError' })
    expect(workspace.rootInfo()).toEqual({ kind: 'external', path: root })
    expect(watcher.subscribe).toHaveBeenCalledTimes(subscribeCalls)
    workspace.dispose()
  })

  it('does not enter single-file mode when file selection completes after abort', async () => {
    const { root, workspace } = await createWorkspace(createKnowledgeServiceMock())
    const file = path.join(path.dirname(root), 'aborted-single-selection.md')
    await fs.writeFile(file, '# Pending single file')
    const actualStat = await fs.stat(file)
    let finishSelection!: () => void
    const selection = new Promise<typeof actualStat>((resolve) => {
      finishSelection = () => resolve(actualStat)
    })
    vi.spyOn(fsSync.promises, 'stat').mockReturnValueOnce(selection)
    const controller = new AbortController()
    const subscribeCalls = vi.mocked(watcher.subscribe).mock.calls.length

    const switching = workspace.setSingleFile({ path: file }, { signal: controller.signal })
    controller.abort()
    finishSelection()

    await expect(switching).rejects.toMatchObject({ name: 'AbortError' })
    expect(workspace.rootInfo()).toEqual({ kind: 'external', path: root })
    expect(watcher.subscribe).toHaveBeenCalledTimes(subscribeCalls)
    workspace.dispose()
  })

  it('does not enter single-file mode when buffer flush completes after abort', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)
    await prepareBufferForSave(root, workspace, service)
    workspace.updateBuffer({ path: 'notes/a.md', content: '# Pending single-file switch' })
    let finishWrite!: () => void
    const writeAllowed = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    service.writeWorkspaceFile.mockImplementationOnce(
      async (_id: string, workspaceRoot: string, relativePath: string, content: string) => {
        await writeAllowed
        await fs.writeFile(path.join(workspaceRoot, relativePath), content)
        return { changed: true, kind: 'file' as const }
      },
    )
    const file = path.join(path.dirname(root), 'aborted-single-flush.md')
    await fs.writeFile(file, '# Pending single file')
    const controller = new AbortController()
    const subscribeCalls = vi.mocked(watcher.subscribe).mock.calls.length

    const switching = workspace.setSingleFile({ path: file }, { signal: controller.signal })
    await vi.waitFor(() => expect(service.writeWorkspaceFile).toHaveBeenCalled())
    controller.abort()
    finishWrite()

    await expect(switching).rejects.toMatchObject({ name: 'AbortError' })
    expect(workspace.rootInfo()).toEqual({ kind: 'external', path: root })
    expect(watcher.subscribe).toHaveBeenCalledTimes(subscribeCalls)
    workspace.dispose()
  })

  it('lets a new switch take ownership while an aborted selection finishes late', async () => {
    const { root, workspace } = await createWorkspace(createKnowledgeServiceMock())
    const parent = path.dirname(root)
    const oldTarget = path.join(parent, 'aborted-selection')
    const newTarget = path.join(parent, 'replacement-selection')
    await Promise.all([fs.mkdir(oldTarget), fs.mkdir(newTarget)])
    const [oldStat, newStat] = await Promise.all([fs.stat(oldTarget), fs.stat(newTarget)])
    let finishOld!: () => void
    let finishNew!: () => void
    const oldSelection = new Promise<typeof oldStat>((resolve) => {
      finishOld = () => resolve(oldStat)
    })
    const newSelection = new Promise<typeof newStat>((resolve) => {
      finishNew = () => resolve(newStat)
    })
    vi.spyOn(fsSync.promises, 'stat').mockImplementation(async (candidate) => {
      if (candidate === oldTarget) return oldSelection
      if (candidate === newTarget) return newSelection
      return oldStat
    })
    const controller = new AbortController()

    const oldSwitch = workspace.setRoot({ path: oldTarget }, { signal: controller.signal })
    controller.abort()
    const newSwitch = workspace.setRoot({ path: newTarget })
    finishOld()
    await expect(oldSwitch).rejects.toMatchObject({ name: 'AbortError' })
    await expect(workspace.setRoot({ path: root })).rejects.toThrow(
      'Another workspace switch is already in progress',
    )

    finishNew()
    await expect(newSwitch).resolves.toEqual({ kind: 'external', path: newTarget })
    expect(workspace.rootInfo()).toEqual({ kind: 'external', path: newTarget })
    workspace.dispose()
  })
})
