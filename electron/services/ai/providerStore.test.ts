import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { LocalDatabaseService } from '@electron/database/service'
import { SettingsRepository } from '@electron/database/repositories/settingsRepository'
import { AiProviderStore } from '@electron/services/ai/providerStore'

const roots: string[] = []
const databases: LocalDatabaseService[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()))
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('AiProviderStore', () => {
  it('encrypts API keys and persists provider metadata in SQLite', async () => {
    const root = await createRoot()
    const database = await createDatabase(root)
    const store = new AiProviderStore(database, createSafeStorage())
    const apiKey = 'sk-super-secret-value'

    await store.update({
      id: 'openai-main',
      label: 'OpenAI',
      kind: 'openai',
      model: 'gpt-5-mini',
      apiKey,
    })

    const persisted = database.sqlite
      .prepare<[string], { encrypted_api_key: Buffer }>(
        'select encrypted_api_key from ai_providers where id = ?',
      )
      .get('openai-main')
    expect(persisted?.encrypted_api_key).toEqual(Buffer.from(`encrypted:${apiKey}`))
    await expect(fs.stat(path.join(root, 'ai', 'providers.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
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
    const database = await createDatabase(root)
    const store = new AiProviderStore(database, safeStorage)

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
    const database = await createDatabase(root)
    const store = new AiProviderStore(database, createSafeStorage())
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
    const database = await createDatabase(root)
    const safeStorage = createSafeStorage()
    safeStorage.isEncryptionAvailable = () => false
    const store = new AiProviderStore(database, safeStorage)

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

  it('returns validation failures as promise rejections', async () => {
    const root = await createRoot()
    const database = await createDatabase(root)
    const store = new AiProviderStore(database, createSafeStorage())

    await expect(
      store.update({
        id: 'invalid-provider',
        kind: 'openai',
        label: '',
        model: 'gpt-5-mini',
      }),
    ).rejects.toThrow()
  })

  it('does not enlist unrelated synchronous settings writes in a failed encryption request', async () => {
    const root = await createRoot()
    const database = await createDatabase(root)
    let rejectEncryption: (error: Error) => void = () => undefined
    let resolveEncryptionStarted: () => void = () => undefined
    const encryptionStarted = new Promise<void>((resolve) => {
      resolveEncryptionStarted = resolve
    })
    const store = new AiProviderStore(database, {
      ...createSafeStorage(),
      isAsyncEncryptionAvailable: async () => true,
      encryptStringAsync: async () => {
        resolveEncryptionStarted()
        return new Promise<Buffer>((_resolve, reject) => {
          rejectEncryption = reject
        })
      },
      decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
    })

    const update = store.update({
      apiKey: 'secret',
      id: 'failing-provider',
      kind: 'openai',
      label: 'Failing provider',
      model: 'gpt-5-mini',
    })
    await encryptionStarted
    new SettingsRepository(database).upsert('concurrent-setting', '"preserved"', null)
    rejectEncryption(new Error('encryption failed'))

    await expect(update).rejects.toThrow(/encrypted|encryption/i)
    expect(new SettingsRepository(database).get('concurrent-setting')?.value_json).toBe(
      '"preserved"',
    )
  })

  it('rejects tampered compatible-provider records without a base URL', async () => {
    const root = await createRoot()
    const database = await createDatabase(root)
    await database.database
      .insertInto('ai_providers')
      .values({
        base_url: null,
        created_at: '2026-09-30T00:00:00.000Z',
        encrypted_api_key: null,
        id: 'compatible',
        kind: 'openai-compatible',
        label: 'Compatible',
        model: 'custom-model',
        updated_at: '2026-09-30T00:00:00.000Z',
      })
      .execute()

    await expect(new AiProviderStore(database, createSafeStorage()).list()).rejects.toThrow(
      'AI provider configuration could not be read',
    )
  })

  it.each(['openai', 'anthropic', 'google'] as const)(
    'rejects tampered built-in %s records with a custom base URL',
    async (kind) => {
      const root = await createRoot()
      const database = await createDatabase(root)
      await database.database
        .insertInto('ai_providers')
        .values({
          base_url: 'https://attacker.example/v1',
          created_at: '2026-09-30T00:00:00.000Z',
          encrypted_api_key: Buffer.from('encrypted-secret'),
          id: `${kind}-tampered`,
          kind,
          label: 'Tampered provider',
          model: 'model',
          updated_at: '2026-09-30T00:00:00.000Z',
        })
        .execute()

      await expect(new AiProviderStore(database, createSafeStorage()).list()).rejects.toThrow(
        'AI provider configuration could not be read',
      )
    },
  )
})

const createRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'marklab-ai-store-'))
  roots.push(root)
  return root
}

const createDatabase = async (root: string): Promise<LocalDatabaseService> => {
  const database = new LocalDatabaseService({ userDataPath: root })
  await database.initialize()
  databases.push(database)
  return database
}

const createSafeStorage = () => ({
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
  decryptString: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/, ''),
})
