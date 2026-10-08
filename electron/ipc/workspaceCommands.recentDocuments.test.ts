import { describe, expect, it, vi } from 'vitest'

import { registerWorkspaceCommandsIpc } from '@electron/ipc/workspaceCommands'

type TestEvent = { sender: { id: number } }
type Handler = (event: TestEvent, payload: unknown) => unknown

const event = { sender: { id: 1 } }

const registerHandlers = (workspace: object, addRecentDocument: (path: string) => void) => {
  const handlers = new Map<string, Handler>()
  registerWorkspaceCommandsIpc(
    { handle: (command: string, handler: Handler) => handlers.set(command, handler) } as never,
    {
      app: { addRecentDocument },
      exportService: {} as never,
      graphLayoutStore: {} as never,
      localHistoryService: {} as never,
      logger: { info: vi.fn(), warn: vi.fn() } as never,
      platform: 'win32',
      workspaceRegistry: { serviceForWebContents: vi.fn(() => workspace) } as never,
    },
  )
  return handlers
}

describe('workspace recent documents IPC', () => {
  it('registers a Markdown file after a successful user open', async () => {
    const addRecentDocument = vi.fn()
    const workspace = {
      openFile: vi.fn(async () => '# Note'),
      resolveCoordinatorPath: vi.fn(() => 'C:\\workspace\\notes\\a.md'),
      rootInfo: vi.fn(() => ({ kind: 'external', path: 'C:\\workspace' })),
    }
    const handler = registerHandlers(workspace, addRecentDocument).get('fs_open_file')

    await expect(handler?.(event, { path: 'notes/a.md' })).resolves.toBe('# Note')

    expect(addRecentDocument).toHaveBeenCalledWith('C:\\workspace\\notes\\a.md')
  })

  it('does not register a file when opening it fails', async () => {
    const addRecentDocument = vi.fn()
    const workspace = {
      openFile: vi.fn(async () => Promise.reject(new Error('read failed'))),
      resolveCoordinatorPath: vi.fn(),
      rootInfo: vi.fn(),
    }
    const handler = registerHandlers(workspace, addRecentDocument).get('fs_open_file')

    await expect(handler?.(event, { path: 'notes/a.md' })).rejects.toThrow('read failed')
    expect(addRecentDocument).not.toHaveBeenCalled()
  })
})
