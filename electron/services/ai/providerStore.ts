import { z } from 'zod'

import {
  AiProviderRepository,
  type AiProviderRecord,
} from '@electron/database/repositories/aiProviderRepository'
import type { LocalDatabaseService } from '@electron/database/service'
import { getProviderBaseUrlIssue } from '@electron/services/ai/providerCatalog'
import { providerMetadataSchema, providerUpdateSchema } from '@electron/services/ai/schemas'
import type {
  AiProviderStoreContract,
  AiSafeStorage,
  StoredAiProvider,
} from '@electron/services/ai/types'

const storedProviderSchema = providerMetadataSchema
  .extend({
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    encryptedApiKey: z.string().min(1).optional(),
  })
  .superRefine((value, context) => {
    const issue = getProviderBaseUrlIssue(value.kind, value.baseUrl)
    if (issue) {
      context.addIssue({
        code: 'custom',
        path: ['baseUrl'],
        message: issue,
      })
    }
  })
export class AiProviderStore implements AiProviderStoreContract {
  private readonly providers: AiProviderRepository

  constructor(
    localDatabase: LocalDatabaseService,
    private readonly safeStorage: AiSafeStorage,
  ) {
    this.providers = new AiProviderRepository(localDatabase.database)
  }

  async list(): Promise<StoredAiProvider[]> {
    try {
      const rows = await this.providers.list()
      return rows.map(toStoredProvider).sort(compareProviders)
    } catch (error) {
      throw new Error('AI provider configuration could not be read', { cause: error })
    }
  }

  async get(id: string): Promise<StoredAiProvider | null> {
    try {
      const row = await this.providers.findById(id)
      return row ? toStoredProvider(row) : null
    } catch (error) {
      throw new Error('AI provider configuration could not be read', { cause: error })
    }
  }

  async update(input: Parameters<AiProviderStoreContract['update']>[0]): Promise<StoredAiProvider> {
    const parsed = providerUpdateSchema.parse(input)
    const currentRow = await this.providers.findById(parsed.id)
    const current = currentRow ? toStoredProvider(currentRow) : null
    const now = new Date().toISOString()
    const encryptedApiKey = await this.updatedEncryptedApiKey(
      parsed.apiKey,
      current?.encryptedApiKey,
    )
    const next = storedProviderSchema.parse({
      id: parsed.id,
      label: parsed.label,
      kind: parsed.kind,
      model: parsed.model,
      ...(parsed.baseUrl ? { baseUrl: parsed.baseUrl } : {}),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      ...(encryptedApiKey ? { encryptedApiKey } : {}),
    })
    await this.providers.upsert({
      baseUrl: next.baseUrl ?? null,
      encryptedApiKey: encryptedApiKey ? Buffer.from(encryptedApiKey, 'base64') : null,
      id: next.id,
      kind: next.kind,
      label: next.label,
      model: next.model,
      createdAt: next.createdAt,
      updatedAt: next.updatedAt,
    })
    return next
  }

  async delete(id: string): Promise<{ ok: true }> {
    await this.providers.deleteById(id)
    return { ok: true }
  }

  async resolveApiKey(id: string): Promise<string | null> {
    const provider = await this.providers.findById(id)
    if (!provider?.encryptedApiKey) return null
    try {
      const asyncSafeStorage = asAsyncSafeStorage(this.safeStorage)
      if (asyncSafeStorage) {
        if (!(await asyncSafeStorage.isAsyncEncryptionAvailable())) {
          throw new Error('OS credential encryption is unavailable')
        }
        const decrypted = await asyncSafeStorage.decryptStringAsync(provider.encryptedApiKey)
        if (decrypted.shouldReEncrypt) {
          const encrypted = await asyncSafeStorage.encryptStringAsync(decrypted.result)
          await this.providers.updateEncryptedApiKey(id, encrypted, new Date().toISOString())
        }
        return decrypted.result
      }
      if (!this.safeStorage.isEncryptionAvailable()) {
        throw new Error('OS credential encryption is unavailable')
      }
      return this.safeStorage.decryptString(provider.encryptedApiKey)
    } catch {
      throw new Error('Stored AI credential could not be decrypted')
    }
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
}

const toStoredProvider = (row: AiProviderRecord): StoredAiProvider =>
  storedProviderSchema.parse({
    id: row.id,
    label: row.label,
    kind: row.kind,
    model: row.model,
    ...(row.baseUrl ? { baseUrl: row.baseUrl } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.encryptedApiKey ? { encryptedApiKey: row.encryptedApiKey.toString('base64') } : {}),
  })

const compareProviders = (left: StoredAiProvider, right: StoredAiProvider): number =>
  left.label.localeCompare(right.label) || left.id.localeCompare(right.id)

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
