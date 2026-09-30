import { describe, expect, it, vi } from 'vitest'

import { registerWorkspaceCommandsIpc } from '@electron/ipc/workspaceCommands.js'

describe('workspace local history IPC', () => {
  it('uses the injected application-scoped local history service', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
    const ipcMain = {
      handle: vi.fn((command: string, handler: (event: unknown, payload: unknown) => unknown) => {
        handlers.set(command, handler)
      }),
    }
    const root = { kind: 'external' as const, path: 'C:\\workspace' }
    const workspace = { rootInfo: vi.fn(() => root) }
    const localHistoryService = {
      list: vi.fn(async () => []),
    }
    const workspaceRegistry = {
      serviceForWebContents: vi.fn(() => workspace),
    }
    const logger = { info: vi.fn() }

    registerWorkspaceCommandsIpc(ipcMain as never, {
      exportService: {} as never,
      localHistoryService: localHistoryService as never,
      logger: logger as never,
      workspaceRegistry: workspaceRegistry as never,
    })

    const handler = handlers.get('local_history_list')
    await handler?.({ sender: { id: 7 } }, { path: 'notes/a.md' })

    expect(localHistoryService.list).toHaveBeenCalledWith(root, 'notes/a.md')
  })
})
