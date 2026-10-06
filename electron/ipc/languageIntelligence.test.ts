import { describe, expect, it, vi } from 'vitest'

import { createLanguageIntelligenceIpcHandlers } from '@electron/ipc/languageIntelligence'
import type { LanguageIntelligenceServiceContract } from '@electron/services/languageIntelligence/service'

const completionRequest = {
  uri: 'marklab:///notes/today.md',
  version: 2,
  position: { line: 0, character: 4 },
}

describe('language intelligence IPC', () => {
  it('routes diagnostics without accepting document content', async () => {
    const service = createService()
    const workspace = {} as never
    const workspaceRegistry = { serviceForWebContents: vi.fn(() => workspace) }
    const handlers = createLanguageIntelligenceIpcHandlers(service, workspaceRegistry as never)
    const event = createEvent(17)
    const request = { uri: 'marklab-embedded://code-block/1.mermaid', version: 2 }

    await handlers.diagnostics(request, event.value)

    expect(service.diagnostics).toHaveBeenCalledWith(17, workspace, request)
    expect(() =>
      handlers.diagnostics({ ...request, content: 'flowchart LR' }, event.value),
    ).toThrow()
  })

  it('routes completion by owner without accepting document content', async () => {
    const service = createService()
    const workspace = {} as never
    const workspaceRegistry = {
      serviceForWebContents: vi.fn(() => workspace),
    }
    const handlers = createLanguageIntelligenceIpcHandlers(service, workspaceRegistry as never)
    const event = createEvent(17)

    await handlers.completion(completionRequest, event.value)

    expect(service.completion).toHaveBeenCalledWith(17, workspace, completionRequest)
    expect(() =>
      handlers.completion({ ...completionRequest, content: '# whole document' }, event.value),
    ).toThrow()
  })

  it('validates incremental changes and cleans owner sessions when the renderer is destroyed', () => {
    const service = createService()
    const handlers = createLanguageIntelligenceIpcHandlers(service, {
      serviceForWebContents: vi.fn(() => ({})),
    } as never)
    const event = createEvent(17)

    handlers.openDocument(
      {
        uri: 'marklab:///notes/today.md',
        languageId: 'markdown',
        path: 'notes/today.md',
        version: 1,
        text: 'Today',
      },
      event.value,
    )
    handlers.changeDocument(
      {
        uri: 'marklab:///notes/today.md',
        version: 2,
        changes: [
          {
            range: {
              start: { line: 0, character: 5 },
              end: { line: 0, character: 5 },
            },
            text: ' plan',
          },
        ],
      },
      event.value,
    )

    expect(service.openDocument).toHaveBeenCalledOnce()
    expect(service.changeDocument).toHaveBeenCalledOnce()
    const destroyed = event.sender.once.mock.calls[0]?.[1]
    destroyed?.()
    expect(service.closeClient).toHaveBeenCalledWith(17)
  })
})

const createService = (): LanguageIntelligenceServiceContract => ({
  changeDocument: vi.fn(() => ({ ok: true as const, version: 2 })),
  closeClient: vi.fn(() => undefined),
  closeDocument: vi.fn(() => ({ ok: true as const })),
  completion: vi.fn(async () => ({ isIncomplete: false, items: [] })),
  diagnostics: vi.fn(async () => []),
  openDocument: vi.fn(() => ({ ok: true as const, version: 1 })),
})

const createEvent = (id: number) => {
  const sender = { id, once: vi.fn() }
  return { sender, value: { sender } as never }
}
