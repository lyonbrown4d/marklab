import { describe, expect, it, vi } from 'vitest'

import { registerWorkspaceCommandsIpc } from '@electron/ipc/workspaceCommands'

describe('workspace analysis query IPC', () => {
  it('routes bounded projections through the sender-owned workspace', async () => {
    const workspace = createWorkspace()
    const handlers = registerHandlers(workspace)

    await handlers.get('fs_query_workspace_pages')?.(event, {
      query: 'architecture',
      offset: 20,
      limit: 50,
    })
    await handlers.get('fs_query_workspace_navigation')?.(event, {
      active_path: 'docs/current.md',
      query: 'arch',
      scope: 'headings',
      limit: 20,
    })
    await handlers.get('fs_get_workspace_document_insights')?.(event, {
      path: 'docs/current.md',
      asset_limit: 40,
    })
    await handlers.get('fs_get_workspace_knowledge_summary')?.(event, undefined)

    expect(workspace.workspacePageQuery).toHaveBeenCalledWith({
      query: 'architecture',
      offset: 20,
      limit: 50,
    })
    expect(workspace.workspaceNavigationQuery).toHaveBeenCalledWith({
      active_path: 'docs/current.md',
      query: 'arch',
      scope: 'headings',
      limit: 20,
    })
    expect(workspace.workspaceDocumentInsights).toHaveBeenCalledWith('docs/current.md', 40)
    expect(workspace.workspaceKnowledgeSummary).toHaveBeenCalledOnce()
  })

  it('rejects invalid projection payloads at the IPC boundary', async () => {
    const handlers = registerHandlers(createWorkspace())

    expect(() =>
      handlers.get('fs_get_workspace_document_insights')?.(event, {
        path: '',
        asset_limit: 20_000,
      }),
    ).toThrow()
    expect(() =>
      handlers.get('fs_query_workspace_navigation')?.(event, { scope: 'everything' }),
    ).toThrow()
  })
})

type TestEvent = { sender: { id: number } }
type Handler = (event: TestEvent, payload: unknown) => unknown
const event = { sender: { id: 1 } }

const createWorkspace = () => ({
  workspacePageQuery: vi.fn(async () => ({ items: [] })),
  workspaceNavigationQuery: vi.fn(async () => ({ files: [], headings: [] })),
  workspaceDocumentInsights: vi.fn(async () => ({ found: false })),
  workspaceKnowledgeSummary: vi.fn(async () => ({ file_count: 0 })),
})

const registerHandlers = (workspace: ReturnType<typeof createWorkspace>) => {
  const handlers = new Map<string, Handler>()
  registerWorkspaceCommandsIpc(
    { handle: (command: string, handler: Handler) => handlers.set(command, handler) } as never,
    {
      exportService: {} as never,
      graphLayoutStore: {} as never,
      localHistoryService: {} as never,
      logger: { info: vi.fn() } as never,
      workspaceRegistry: { serviceForWebContents: vi.fn(() => workspace) } as never,
    },
  )
  return handlers
}
