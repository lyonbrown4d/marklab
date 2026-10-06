import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { AiProviderRepository } from '@electron/database/repositories/aiProviderRepository'
import { LocalAiStateRepository } from '@electron/database/repositories/localAiStateRepository'
import { LocalDatabaseService } from '@electron/database/service'

const roots: string[] = []
const services: LocalDatabaseService[] = []

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()))
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('AI repositories', () => {
  it('owns ai_providers CRUD behind typed Kysely queries', async () => {
    const service = await createService()
    const repository = new AiProviderRepository(service.database)
    const provider = {
      baseUrl: null,
      createdAt: '2026-10-06T00:00:00.000Z',
      encryptedApiKey: Buffer.from('secret'),
      id: 'provider-1',
      kind: 'openai' as const,
      label: 'Provider',
      model: 'gpt-5-mini',
      updatedAt: '2026-10-06T00:00:00.000Z',
    }

    await repository.upsert(provider)
    await expect(repository.findById(provider.id)).resolves.toMatchObject(provider)
    await expect(repository.list()).resolves.toHaveLength(1)

    await repository.updateEncryptedApiKey(provider.id, null, '2026-10-06T01:00:00.000Z')
    await expect(repository.findById(provider.id)).resolves.toMatchObject({
      encryptedApiKey: null,
    })

    await repository.deleteById(provider.id)
    await expect(repository.findById(provider.id)).resolves.toBeUndefined()
  })

  it('owns synchronous local_ai_state persistence using compiled Kysely queries', async () => {
    const service = await createService()
    const repository = new LocalAiStateRepository(service.database, service.sqlite)

    repository.upsertDirectoryConfig({
      deviceId: '42',
      enabled: true,
      path: 'C:/models',
      updatedAt: '2026-10-06T00:00:00.000Z',
    })
    repository.upsertMigrationJson('{"state":"copying"}', '2026-10-06T01:00:00.000Z')

    expect(repository.find()).toMatchObject({
      migrationJson: '{"state":"copying"}',
      modelDirectoryDeviceId: '42',
      modelDirectoryEnabled: true,
      modelDirectoryPath: 'C:/models',
    })
  })
})

const createService = async (): Promise<LocalDatabaseService> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-ai-repository-'))
  roots.push(root)
  const service = new LocalDatabaseService({ userDataPath: root })
  await service.initialize()
  services.push(service)
  return service
}
