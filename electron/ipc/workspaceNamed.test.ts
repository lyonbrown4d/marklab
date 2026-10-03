import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels.js'
import { registerWorkspaceNamedIpc } from '@electron/ipc/workspaceNamed.js'

describe('named workspace IPC', () => {
  it('routes each request through the workspace owned by the sender', async () => {
    const first = createWorkspace('C:/first')
    const second = createWorkspace('D:/second')
    const dependencies = createDependencies([first, second])
    const handlers = register(dependencies)

    await handlers.get(nativeIpcChannels.assetsIssueCapability)?.(event(11), {
      path: 'images/one.png',
    })
    await handlers.get(nativeIpcChannels.assetsIssueCapability)?.(event(22), {
      path: 'images/two.png',
    })

    expect(dependencies.workspaceRegistry.serviceForWebContents).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 11 }),
    )
    expect(dependencies.workspaceRegistry.serviceForWebContents).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 22 }),
    )
    expect(first.issueAssetCapability).toHaveBeenCalledWith({ path: 'images/one.png' })
    expect(second.issueAssetCapability).toHaveBeenCalledWith({ path: 'images/two.png' })
  })

  it('resolves reveal and copy paths inside the sender workspace', async () => {
    const workspace = createWorkspace('C:/notes')
    const dependencies = createDependencies([workspace, workspace])
    const handlers = register(dependencies)

    await handlers.get(nativeIpcChannels.workspaceRevealPathInSystem)?.(event(1), {
      path: 'daily/today.md',
    })
    await handlers.get(nativeIpcChannels.workspaceCopyAbsolutePath)?.(event(1), {
      path: 'daily/today.md',
    })

    const absolutePath = path.resolve('C:/notes', 'daily/today.md')
    expect(dependencies.shell.showItemInFolder).toHaveBeenCalledWith(absolutePath)
    expect(dependencies.clipboard.writeText).toHaveBeenCalledWith(absolutePath)
  })

  it('keeps open-path validation in the sender workspace service', async () => {
    const workspace = createWorkspace('C:/notes')
    const dependencies = createDependencies([workspace])
    const handlers = register(dependencies)

    await handlers.get(nativeIpcChannels.workspaceOpenPathInSystem)?.(event(1), {
      path: '../secret.md',
    })

    expect(workspace.openPathInSystem).toHaveBeenCalledWith({ path: '../secret.md' })
  })

  it('routes bounded text previews through the sender workspace', async () => {
    const workspace = createWorkspace('C:/notes')
    const dependencies = createDependencies([workspace])
    const handlers = register(dependencies)
    const request = { limit_bytes: 16_384, path: 'src/example.ts' }

    await expect(
      handlers.get(nativeIpcChannels.workspaceReadTextPreview)?.(event(1), request),
    ).resolves.toEqual({ content: 'preview', truncated: false })
    expect(workspace.readTextPreview).toHaveBeenCalledWith(request)
  })
})

type Handler = (event: { sender: { id: number } }, payload: unknown) => unknown

const register = (dependencies: ReturnType<typeof createDependencies>) => {
  const handlers = new Map<string, Handler>()
  registerWorkspaceNamedIpc(
    { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as never,
    dependencies as never,
  )
  return handlers
}

const event = (id: number) => ({ sender: { id } })

const createWorkspace = (root: string) => ({
  issueAssetCapability: vi.fn(async () => ({
    url: 'asset://token/file.png',
    expires_at_ms: Date.now() + 1_000,
  })),
  openPathInSystem: vi.fn(async () => undefined),
  readAssetBytes: vi.fn(async () => ({ bytes: new ArrayBuffer(1), size_bytes: 1 })),
  readTextPreview: vi.fn(async () => ({ content: 'preview', truncated: false })),
  resolveCoordinatorPath: vi.fn((relativePath: string) => path.resolve(root, relativePath)),
})

const createDependencies = (workspaces: Array<ReturnType<typeof createWorkspace>>) => ({
  clipboard: { writeText: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
  workspaceRegistry: {
    serviceForWebContents: vi
      .fn()
      .mockImplementationOnce(() => workspaces[0])
      .mockImplementationOnce(() => workspaces[1] ?? workspaces[0]),
  },
})
