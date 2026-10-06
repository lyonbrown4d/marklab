import { describe, expect, it, vi } from 'vitest'
import type { App } from 'electron'

import { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { Logger } from '@electron/services/logger'

describe('KnowledgeEngineService Node runtime', () => {
  it('initializes without resolving or building a native binary', async () => {
    const app = { getPath: vi.fn(() => 'app-data'), isPackaged: false } as unknown as App
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as Logger
    const service = new KnowledgeEngineService({ app, logger })

    expect(service.getStatus()).toEqual({ binaryPath: null, state: 'stopped' })
    await expect(service.initialize()).resolves.toMatchObject({
      ok: true,
      response: { mode: 'node-utility-process' },
      status: { binaryPath: null, state: 'stopped' },
    })
  })

  it('opens the workspace runtime before requesting Markdown diagnostics', async () => {
    const app = { getPath: vi.fn(() => 'app-data'), isPackaged: false } as unknown as App
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as Logger
    const service = new KnowledgeEngineService({ app, logger })
    const sidecars = {
      getMarkdownDiagnostics: vi.fn(async () => []),
      listActive: vi.fn(() => []),
      open: vi.fn(async () => undefined),
    }
    Object.assign(service, { sidecars })

    await expect(
      service.getMarkdownDiagnostics('workspace-a', 'C:/workspace', 'alpha.md', '[A][missing]'),
    ).resolves.toEqual([])
    expect(sidecars.open).toHaveBeenCalledWith('workspace-a', 'C:/workspace', {
      openWorkspace: false,
    })
    expect(sidecars.getMarkdownDiagnostics).toHaveBeenCalledWith(
      'workspace-a',
      'alpha.md',
      '[A][missing]',
    )
  })
})
