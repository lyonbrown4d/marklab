import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { AiProviderStore } from '@electron/services/ai/providerStore.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('AiProviderStore', () => {
  it('encrypts API keys and atomically persists provider metadata', async () => {
    const root = await createRoot()
    const store = new AiProviderStore(root, createSafeStorage())
    const apiKey = 'sk-super-secret-value'

    await store.update({
      id: 'openai-main',
      label: 'OpenAI',
      kind: 'openai',
      model: 'gpt-5-mini',
      apiKey,
    })

    const persisted = await fs.readFile(path.join(root, 'ai', 'providers.json'), 'utf8')
    expect(persisted).not.toContain(apiKey)
    expect(persisted).toContain(Buffer.from(`encrypted:${apiKey}`).toString('base64'))
    expect((await fs.readdir(path.join(root, 'ai'))).some((name) => name.includes('.tmp-'))).toBe(
      false,
    )
    await expect(store.resolveApiKey('openai-main')).resolves.toBe(apiKey)
  })

  it('prefers Electron 44 asynchronous safeStorage APIs', async () => {
    const root = await createRoot()
    const safeStorage = {
      isAsyncEncryptionAvailable: vi.fn(async () => true),
      encryptStringAsync: vi.fn(async (value: string) => Buffer.from(`async:${value}`)),
      decryptStringAsync: vi.fn(async (value: Buffer) => ({
        result: value.toString('utf8').replace(/^async:/, ''),
        shouldReEncrypt: false,
      })),
      isEncryptionAvailable: vi.fn(() => {
        throw new Error('sync availability must not be used')
      }),
      encryptString: vi.fn(() => {
        throw new Error('sync encryption must not be used')
      }),
      decryptString: vi.fn(() => {
        throw new Error('sync decryption must not be used')
      }),
    }
    const store = new AiProviderStore(root, safeStorage)

    await store.update({
      id: 'openai-async',
      label: 'OpenAI async',
      kind: 'openai',
      model: 'gpt-5-mini',
      apiKey: 'async-secret',
    })

    await expect(store.resolveApiKey('openai-async')).resolves.toBe('async-secret')
    expect(safeStorage.encryptStringAsync).toHaveBeenCalledWith('async-secret')
    expect(safeStorage.decryptStringAsync).toHaveBeenCalledOnce()
  })

  it('preserves, clears, and deletes credentials without ever returning plaintext in records', async () => {
    const root = await createRoot()
    const store = new AiProviderStore(root, createSafeStorage())
    const input = {
      id: 'anthropic-main',
      label: 'Claude',
      kind: 'anthropic' as const,
      model: 'claude-sonnet-4-6',
      apiKey: 'anthropic-secret',
    }
    await store.update(input)

    const updated = await store.update({ ...input, label: 'Claude primary', apiKey: undefined })
    expect(updated).not.toHaveProperty('apiKey')
    await expect(store.resolveApiKey(input.id)).resolves.toBe(input.apiKey)

    await store.update({ ...input, apiKey: null })
    await expect(store.resolveApiKey(input.id)).resolves.toBeNull()
    await expect(store.delete(input.id)).resolves.toEqual({ ok: true })
    await expect(store.get(input.id)).resolves.toBeNull()
  })

  it('refuses to persist a secret when OS encryption is unavailable', async () => {
    const root = await createRoot()
    const safeStorage = createSafeStorage()
    safeStorage.isEncryptionAvailable = () => false
    const store = new AiProviderStore(root, safeStorage)

    await expect(
      store.update({
        id: 'google-main',
        label: 'Gemini',
        kind: 'google',
        model: 'gemini-3-flash-preview',
        apiKey: 'secret',
      }),
    ).rejects.toThrow(/encryption/i)
  })

  it('rejects tampered compatible-provider records without a base URL', async () => {
    const root = await createRoot()
    const directory = path.join(root, 'ai')
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(
      path.join(directory, 'providers.json'),
      JSON.stringify({
        version: 1,
        providers: [
          {
            id: 'compatible',
            label: 'Compatible',
            kind: 'openai-compatible',
            model: 'custom-model',
            createdAt: '2026-09-30T00:00:00.000Z',
            updatedAt: '2026-09-30T00:00:00.000Z',
          },
        ],
      }),
    )

    await expect(new AiProviderStore(root, createSafeStorage()).list()).rejects.toThrow(
      'AI provider configuration could not be read',
    )
  })
})

const createRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'marklab-ai-store-'))
  roots.push(root)
  return root
}

const createSafeStorage = () => ({
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
  decryptString: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/, ''),
})
