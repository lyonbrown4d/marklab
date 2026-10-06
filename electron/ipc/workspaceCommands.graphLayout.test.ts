import { describe, expect, it, vi } from 'vitest'

import { registerWorkspaceCommandsIpc } from '@electron/ipc/workspaceCommands'

describe('workspace graph layout IPC', () => {
  it('derives workspace identity from the sender-owned workspace', async () => {
    const { graphLayoutStore, handlers } = register()
    const payload = request()

    await handlers.get('fs_get_workspace_graph_layout')?.(event(), payload)

    expect(graphLayoutStore.get).toHaveBeenCalledWith('external:c:/notes', payload)
  })

  it('strictly rejects renderer-supplied workspace identity and non-finite geometry', async () => {
    const { graphLayoutStore, handlers } = register()

    await expect(
      handlers.get('fs_get_workspace_graph_layout')?.(event(), {
        ...request(),
        workspaceKey: 'external:D:/other',
      }),
    ).rejects.toThrow()
    await expect(
      handlers.get('fs_save_workspace_graph_layout')?.(event(), {
        ...request(),
        nodes: [{ ...node(), x: Number.POSITIVE_INFINITY }],
        viewport: null,
      }),
    ).rejects.toThrow()
    expect(graphLayoutStore.get).not.toHaveBeenCalled()
    expect(graphLayoutStore.save).not.toHaveBeenCalled()
  })

  it('saves a validated batch against the sender-owned workspace', async () => {
    const { graphLayoutStore, handlers } = register()
    const payload = { ...request(), nodes: [node()], viewport: { x: 1, y: 2, zoom: 1 } }

    await handlers.get('fs_save_workspace_graph_layout')?.(event(), payload)

    expect(graphLayoutStore.save).toHaveBeenCalledWith('external:c:/notes', payload)
  })
})

type Handler = (event: { sender: { id: number } }, payload: unknown) => unknown

const register = () => {
  const handlers = new Map<string, Handler>()
  const graphLayoutStore = { get: vi.fn(async () => null), save: vi.fn(async () => undefined) }
  registerWorkspaceCommandsIpc(
    {
      handle: (command: string, handler: Handler) => handlers.set(command, handler),
    } as never,
    {
      exportService: {} as never,
      graphLayoutStore: graphLayoutStore as never,
      localHistoryService: {} as never,
      logger: { info: vi.fn() } as never,
      workspaceRegistry: {
        serviceForWebContents: vi.fn(() => ({
          rootInfo: () => ({ kind: 'external', path: 'C:\\notes' }),
        })),
      } as never,
    },
  )
  return { graphLayoutStore, handlers }
}

const event = () => ({ sender: { id: 7 } })
const request = () => ({
  engineVersion: 'elk-workspace-map-v1',
  graphRevision: 'revision-a',
  layoutKey: 'workspace-map:overview',
  mode: 'overview',
})
const node = () => ({
  collapsed: false,
  height: 240,
  id: 'file:a.md',
  pinned: false,
  userModified: false,
  width: 360,
  x: 10,
  y: 20,
})
