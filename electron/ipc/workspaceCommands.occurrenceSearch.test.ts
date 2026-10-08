import { describe, expect, it, vi } from 'vitest'

import { registerWorkspaceCommandsIpc } from '@electron/ipc/workspaceCommands'

describe('workspace occurrence search IPC isolation', () => {
  it('routes identical request ids through the sender-owned workspace', async () => {
    const first = createWorkspace()
    const second = createWorkspace()
    const handlers = new Map<string, Handler>()
    registerWorkspaceCommandsIpc(
      { handle: (command: string, handler: Handler) => handlers.set(command, handler) } as never,
      {
        app: { addRecentDocument: vi.fn() },
        exportService: {} as never,
        graphLayoutStore: {} as never,
        localHistoryService: {} as never,
        logger: { info: vi.fn() } as never,
        workspaceRegistry: {
          serviceForWebContents: vi.fn((sender: { id: number }) =>
            sender.id === 1 ? first : second,
          ),
        } as never,
      },
    )
    const request = {
      requestId: 'shared-request-id',
      query: 'needle',
      options: { caseSensitive: false, wholeWord: false, useRegex: false },
    }

    await handlers.get('fs_search_workspace_occurrences')?.(event(1), request)
    await handlers.get('fs_search_workspace_occurrences')?.(event(2), request)
    await handlers.get('fs_cancel_workspace_occurrence_search')?.(event(1), {
      requestId: request.requestId,
    })

    expect(first.searchWorkspaceOccurrences).toHaveBeenCalledWith(request)
    expect(second.searchWorkspaceOccurrences).toHaveBeenCalledWith(request)
    expect(first.cancelWorkspaceOccurrenceSearch).toHaveBeenCalledOnce()
    expect(second.cancelWorkspaceOccurrenceSearch).not.toHaveBeenCalled()
  })
})

type Handler = (event: { sender: { id: number } }, payload: unknown) => unknown

const event = (id: number) => ({ sender: { id } })

const createWorkspace = () => ({
  cancelWorkspaceOccurrenceSearch: vi.fn(async (value) => ({
    cancelled: true,
    requestId: (value as { requestId: string }).requestId,
  })),
  searchWorkspaceOccurrences: vi.fn(async (value) => ({
    requestId: (value as { requestId: string }).requestId,
    results: [],
    scannedDocuments: 0,
    totalHits: 0,
    truncated: false,
  })),
})
