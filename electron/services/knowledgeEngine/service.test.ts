import { describe, expect, it, vi } from 'vitest'
import type { App } from 'electron'

import { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import type { Logger } from '@electron/services/logger.js'

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
})
