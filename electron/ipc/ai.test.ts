import { describe, expect, it, vi } from 'vitest'

import { createAiCommandHandlers, registerAiIpc } from '@electron/ipc/ai.js'
import type { AiServiceContract } from '@electron/services/ai/types.js'

describe('AI IPC commands', () => {
  it('forwards provider CRUD and generation payloads without widening the contract', async () => {
    const service = {
      listProviders: vi.fn(async () => []),
      getProvider: vi.fn(async () => ({ id: 'provider' })),
      updateProvider: vi.fn(async () => ({ id: 'provider' })),
      deleteProvider: vi.fn(async () => ({ ok: true as const })),
      testProvider: vi.fn(async () => ({ ok: true as const })),
      generateText: vi.fn(async () => ({ text: 'ok' })),
    } as unknown as AiServiceContract
    const handlers = createAiCommandHandlers(service)
    const event = {} as Parameters<(typeof handlers)['ai_list_providers']>[1]

    await handlers.ai_list_providers(undefined, event)
    await handlers.ai_get_provider({ id: 'provider' }, event)
    await handlers.ai_update_provider({ id: 'provider', apiKey: 'secret' }, event)
    await handlers.ai_delete_provider({ id: 'provider' }, event)
    await handlers.ai_test_provider({ id: 'provider' }, event)
    await handlers.ai_generate_text({ providerId: 'provider', prompt: 'Hi' }, event)

    expect(service.listProviders).toHaveBeenCalledOnce()
    expect(service.getProvider).toHaveBeenCalledWith('provider')
    expect(service.updateProvider).toHaveBeenCalledWith({ id: 'provider', apiKey: 'secret' })
    expect(service.deleteProvider).toHaveBeenCalledWith('provider')
    expect(service.testProvider).toHaveBeenCalledWith('provider')
    expect(service.generateText).toHaveBeenCalledWith({ providerId: 'provider', prompt: 'Hi' })
  })

  it('rejects missing provider identifiers at the IPC boundary', async () => {
    const service = { getProvider: vi.fn() } as unknown as AiServiceContract
    const handlers = createAiCommandHandlers(service)
    const event = {} as Parameters<(typeof handlers)['ai_get_provider']>[1]

    await expect(handlers.ai_get_provider({}, event)).rejects.toThrow(/id/i)
    expect(service.getProvider).not.toHaveBeenCalled()
  })

  it('registers an injected application-scoped service without constructing dependencies', () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = {
      handle: vi.fn((command: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(command, handler)
      }),
    }
    const service = {
      listProviders: vi.fn(async () => []),
    } as unknown as AiServiceContract
    const logger = { info: vi.fn() }

    const bridge = registerAiIpc(ipcMain as never, service, logger as never)

    expect(bridge.service).toBe(service)
    expect(handlers.has('ai_list_providers')).toBe(true)
  })
})
