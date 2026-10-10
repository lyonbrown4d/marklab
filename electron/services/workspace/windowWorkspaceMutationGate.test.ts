import { describe, expect, it, vi } from 'vitest'

import type { FsRootInfo, WorkspaceRootSwitchOptions } from '@electron/services/workspace/types'
import { installWindowWorkspaceMutationGate } from '@electron/services/workspace/windowWorkspaceMutationGate'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService'
import { WorkspaceMutationGate } from '@electron/services/workspace/workspaceShutdownBarrier'

const runWorkspacePathMutation = vi.hoisted(() =>
  vi.fn(<T>(options: { work: () => Promise<T> }) => options.work()),
)

vi.mock('@electron/services/workspace/workspaceWriteCoordinator', () => ({
  runWorkspacePathMutation,
}))

type RootSetter = (value: unknown, options?: WorkspaceRootSwitchOptions) => Promise<FsRootInfo>

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

const createService = (setRoot: RootSetter, setSingleFile: RootSetter): WorkspaceService =>
  ({
    createDir: vi.fn(async () => undefined),
    createFile: vi.fn(async () => undefined),
    deletePath: vi.fn(async () => undefined),
    flushBuffers: vi.fn(async () => undefined),
    importMarkdownAsset: vi.fn(async () => undefined),
    importMarkdownAssetBytes: vi.fn(async () => undefined),
    movePath: vi.fn(async () => undefined),
    readFile: vi.fn(async () => ''),
    renamePath: vi.fn(async () => undefined),
    resolveCoordinatorPath: vi.fn((value: string) => value),
    setRoot,
    setSingleFile,
    updateBuffer: vi.fn(),
    writeCoordinatorOwnerId: vi.fn(() => 'test-owner'),
    writeFile: vi.fn(),
  }) as unknown as WorkspaceService

describe('installWindowWorkspaceMutationGate root cancellation', () => {
  it('coordinates the complete workspace mutation surface', async () => {
    const setRoot = vi.fn<RootSetter>(async () => ({ kind: 'external', path: 'D:\\wiki' }))
    const setSingleFile = vi.fn<RootSetter>(async () => ({
      kind: 'single',
      path: 'D:\\wiki\\README.md',
    }))
    const service = createService(setRoot, setSingleFile)
    const onRootChanged = vi.fn()
    const flushForShutdown = installWindowWorkspaceMutationGate(
      service,
      new WorkspaceMutationGate(),
      onRootChanged,
    )

    await expect(service.setRoot({ path: 'D:\\wiki' })).resolves.toEqual({
      kind: 'external',
      path: 'D:\\wiki',
    })
    await expect(service.setSingleFile({ path: 'D:\\wiki\\README.md' })).resolves.toEqual({
      kind: 'single',
      path: 'D:\\wiki\\README.md',
    })
    await expect(service.readFile({ path: 'README.md' })).resolves.toBe('')
    expect(service.updateBuffer({ path: 'README.md', content: '# Updated' })).toBeUndefined()
    expect(service.writeFile({ path: 'README.md', content: '# Written' })).toBeUndefined()
    await expect(service.flushBuffers()).resolves.toBeUndefined()
    await expect(service.createFile({ path: 'new.md' })).resolves.toBeUndefined()
    await expect(service.createDir({ path: 'docs' })).resolves.toBeUndefined()
    await expect(service.renamePath({ from: 'old.md', to: 'new.md' })).resolves.toBeUndefined()
    await expect(service.movePath({ from: 'new.md', to: 'docs/new.md' })).resolves.toBeUndefined()
    await expect(service.deletePath({ path: 'docs' })).resolves.toBeUndefined()
    await expect(service.importMarkdownAsset({ path: 'image.png' })).resolves.toBeUndefined()
    await expect(service.importMarkdownAssetBytes({ path: 'image.png' })).resolves.toBeUndefined()
    await expect(flushForShutdown()).resolves.toBeUndefined()

    expect(onRootChanged).toHaveBeenCalledTimes(2)
    expect(runWorkspacePathMutation).toHaveBeenCalledTimes(5)
    await expect(service.createFile({})).rejects.toThrow('requires a string "path" path')
  })

  it('forwards setRoot signal and skips onRootChanged after abort', async () => {
    const switched = deferred<FsRootInfo>()
    const setRoot = vi.fn<RootSetter>(() => switched.promise)
    const service = createService(setRoot, vi.fn())
    const onRootChanged = vi.fn()
    const controller = new AbortController()
    installWindowWorkspaceMutationGate(service, new WorkspaceMutationGate(), onRootChanged)

    const switching = service.setRoot({ path: 'D:\\wiki' }, { signal: controller.signal })
    expect(setRoot).toHaveBeenCalledWith({ path: 'D:\\wiki' }, { signal: controller.signal })
    controller.abort()
    switched.resolve({ kind: 'external', path: 'D:\\wiki' })

    await expect(switching).rejects.toMatchObject({ name: 'AbortError' })
    expect(onRootChanged).not.toHaveBeenCalled()
  })

  it('forwards setSingleFile signal and skips onRootChanged after abort', async () => {
    const switched = deferred<FsRootInfo>()
    const setSingleFile = vi.fn<RootSetter>(() => switched.promise)
    const service = createService(vi.fn(), setSingleFile)
    const onRootChanged = vi.fn()
    const controller = new AbortController()
    installWindowWorkspaceMutationGate(service, new WorkspaceMutationGate(), onRootChanged)

    const switching = service.setSingleFile(
      { path: 'D:\\wiki\\README.md' },
      { signal: controller.signal },
    )
    expect(setSingleFile).toHaveBeenCalledWith(
      { path: 'D:\\wiki\\README.md' },
      { signal: controller.signal },
    )
    controller.abort()
    switched.resolve({ kind: 'single', path: 'D:\\wiki\\README.md' })

    await expect(switching).rejects.toMatchObject({ name: 'AbortError' })
    expect(onRootChanged).not.toHaveBeenCalled()
  })
})
