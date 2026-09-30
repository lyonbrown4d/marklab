import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import { providerMetadataSchema, providerUpdateSchema } from '@electron/services/ai/schemas.js'
import type {
  AiProviderStoreContract,
  AiSafeStorage,
  StoredAiProvider,
} from '@electron/services/ai/types.js'

const storedProviderSchema = providerMetadataSchema
  .extend({
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    encryptedApiKey: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === 'openai-compatible' && !value.baseUrl) {
      context.addIssue({
        code: 'custom',
        path: ['baseUrl'],
        message: 'baseUrl is required for openai-compatible providers',
      })
    }
  })
const providerFileSchema = z
  .object({
    version: z.literal(1),
    providers: z.array(storedProviderSchema),
  })
  .strict()

export class AiProviderStore implements AiProviderStoreContract {
  private readonly filePath: string
  private tail: Promise<void> = Promise.resolve()

  constructor(
    userDataPath: string,
    private readonly safeStorage: AiSafeStorage,
  ) {
    if (!path.isAbsolute(userDataPath)) throw new Error('AI provider storage path must be absolute')
    this.filePath = path.join(path.resolve(userDataPath), 'ai', 'providers.json')
  }

  list(): Promise<StoredAiProvider[]> {
    return this.serialized(async () => (await this.readFile()).providers.map(cloneProvider))
  }

  get(id: string): Promise<StoredAiProvider | null> {
    return this.serialized(async () => {
      const provider = (await this.readFile()).providers.find((candidate) => candidate.id === id)
      return provider ? cloneProvider(provider) : null
    })
  }

  update(input: Parameters<AiProviderStoreContract['update']>[0]): Promise<StoredAiProvider> {
    return this.serialized(async () => {
      const parsed = providerUpdateSchema.parse(input)
      const data = await this.readFile()
      const current = data.providers.find((provider) => provider.id === parsed.id)
      const now = new Date().toISOString()
      const encryptedApiKey = await this.updatedEncryptedApiKey(
        parsed.apiKey,
        current?.encryptedApiKey,
      )
      const next: StoredAiProvider = {
        id: parsed.id,
        label: parsed.label,
        kind: parsed.kind,
        model: parsed.model,
        ...(parsed.baseUrl ? { baseUrl: parsed.baseUrl } : {}),
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        ...(encryptedApiKey ? { encryptedApiKey } : {}),
      }
      data.providers = [
        ...data.providers.filter((provider) => provider.id !== parsed.id),
        next,
      ].sort(
        (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
      )
      await this.writeFile(data)
      return cloneProvider(next)
    })
  }

  delete(id: string): Promise<{ ok: true }> {
    return this.serialized(async () => {
      const data = await this.readFile()
      data.providers = data.providers.filter((provider) => provider.id !== id)
      await this.writeFile(data)
      return { ok: true }
    })
  }

  resolveApiKey(id: string): Promise<string | null> {
    return this.serialized(async () => {
      const data = await this.readFile()
      const provider = data.providers.find((candidate) => candidate.id === id)
      if (!provider?.encryptedApiKey) return null
      try {
        const encrypted = Buffer.from(provider.encryptedApiKey, 'base64')
        const asyncSafeStorage = asAsyncSafeStorage(this.safeStorage)
        if (asyncSafeStorage) {
          if (!(await asyncSafeStorage.isAsyncEncryptionAvailable())) {
            throw new Error('OS credential encryption is unavailable')
          }
          const decrypted = await asyncSafeStorage.decryptStringAsync(encrypted)
          if (decrypted.shouldReEncrypt) {
            provider.encryptedApiKey = (
              await asyncSafeStorage.encryptStringAsync(decrypted.result)
            ).toString('base64')
            await this.writeFile(data)
          }
          return decrypted.result
        }
        if (!this.safeStorage.isEncryptionAvailable()) {
          throw new Error('OS credential encryption is unavailable')
        }
        return this.safeStorage.decryptString(encrypted)
      } catch {
        throw new Error('Stored AI credential could not be decrypted')
      }
    })
  }

  private async updatedEncryptedApiKey(
    apiKey: string | null | undefined,
    current: string | undefined,
  ): Promise<string | undefined> {
    if (apiKey === undefined) return current
    if (apiKey === null) return undefined
    const asyncSafeStorage = asAsyncSafeStorage(this.safeStorage)
    if (asyncSafeStorage) {
      if (!(await asyncSafeStorage.isAsyncEncryptionAvailable())) {
        throw new Error('OS credential encryption is unavailable')
      }
      return (await asyncSafeStorage.encryptStringAsync(apiKey)).toString('base64')
    }
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('OS credential encryption is unavailable')
    }
    return this.safeStorage.encryptString(apiKey).toString('base64')
  }

  private async readFile(): Promise<{ version: 1; providers: StoredAiProvider[] }> {
    try {
      return providerFileSchema.parse(JSON.parse(await fs.readFile(this.filePath, 'utf8')))
    } catch (error) {
      if (isMissing(error)) return { version: 1, providers: [] }
      throw new Error('AI provider configuration could not be read', { cause: error })
    }
  }

  private async writeFile(data: { version: 1; providers: StoredAiProvider[] }): Promise<void> {
    const directory = path.dirname(this.filePath)
    await fs.mkdir(directory, { recursive: true })
    const temporary = `${this.filePath}.tmp-${randomUUID()}`
    try {
      await fs.writeFile(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx' })
      await fs.rename(temporary, this.filePath)
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined)
    }
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const run = this.tail.then(work, work)
    this.tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

const cloneProvider = (provider: StoredAiProvider): StoredAiProvider => ({ ...provider })

const isMissing = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')

type AsyncSafeStorage = AiSafeStorage &
  Required<
    Pick<AiSafeStorage, 'isAsyncEncryptionAvailable' | 'encryptStringAsync' | 'decryptStringAsync'>
  >

const asAsyncSafeStorage = (safeStorage: AiSafeStorage): AsyncSafeStorage | null => {
  return safeStorage.isAsyncEncryptionAvailable &&
    safeStorage.encryptStringAsync &&
    safeStorage.decryptStringAsync
    ? (safeStorage as AsyncSafeStorage)
    : null
}
