import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { LocalDatabaseService } from '@electron/database/localDatabaseService'
import { WebDavProfileStore } from '@electron/services/sync/webdav/profileStore'

const roots: string[] = []
const databases: LocalDatabaseService[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()))
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('WebDavProfileStore', () => {
  it('encrypts credentials and never returns secrets from list or get', async () => {
    const { database } = await createFixture()
    const storage = createSafeStorage()
    const store = new WebDavProfileStore(database, storage)
    await store.update(input({ password: 'app-password' }))

    const persisted = await database.database
      .selectFrom('webdav_profiles')
      .select('encrypted_password')
      .where('id', '=', 'primary')
      .executeTakeFirstOrThrow()
    expect(persisted.encrypted_password?.toString('utf8')).toBe('encrypted:app-password')
    expect(await store.list()).toEqual([
      expect.not.objectContaining({ password: expect.anything() }),
    ])
    expect(await store.get('primary')).not.toHaveProperty('encryptedPassword')
    await expect(store.resolvePassword('primary')).resolves.toBe('app-password')
  })

  it('preserves, clears, and deletes a password explicitly', async () => {
    const { database } = await createFixture()
    const store = new WebDavProfileStore(database, createSafeStorage())
    await store.update(input({ password: 'first' }))

    await store.update(input({ label: 'Updated', password: undefined }))
    await expect(store.resolvePassword('primary')).resolves.toBe('first')
    await store.update(input({ password: null }))
    await expect(store.resolvePassword('primary')).resolves.toBeNull()
    await store.delete('primary')
    await expect(store.get('primary')).resolves.toBeNull()
  })

  it('keeps session-only secrets in memory when encryption is unavailable', async () => {
    const { database } = await createFixture()
    const storage = createSafeStorage({ available: false })
    const store = new WebDavProfileStore(database, storage)

    await expect(store.update(input({ password: 'secret' }))).rejects.toThrow(/encryption/i)
    await store.update(input({ password: 'memory-secret', sessionOnly: true }))

    const persisted = await database.database
      .selectFrom('webdav_profiles')
      .select('encrypted_password')
      .where('id', '=', 'primary')
      .executeTakeFirstOrThrow()
    expect(persisted.encrypted_password).toBeNull()
    await expect(store.resolvePassword('primary')).resolves.toBe('memory-secret')
    await expect(
      new WebDavProfileStore(database, storage).resolvePassword('primary'),
    ).resolves.toBeNull()
  })

  it('updates session-only passwords only after the profile write succeeds', async () => {
    const { database } = await createFixture()
    const store = new WebDavProfileStore(database, createSafeStorage())
    database.sqlite.exec(`
      CREATE TRIGGER reject_webdav_profile_insert
      BEFORE INSERT ON webdav_profiles
      BEGIN
        SELECT RAISE(ABORT, 'profile write rejected');
      END
    `)

    await expect(
      store.update(input({ password: 'ghost-secret', sessionOnly: true })),
    ).rejects.toThrow()
    database.sqlite.exec('DROP TRIGGER reject_webdav_profile_insert')

    await expect(store.update(input({ sessionOnly: true }))).resolves.toMatchObject({
      hasPassword: false,
    })
    await expect(store.resolvePassword('primary')).resolves.toBeNull()
  })

  it('preserves a session-only password when clearing it fails to persist', async () => {
    const { database } = await createFixture()
    const store = new WebDavProfileStore(database, createSafeStorage())
    await store.update(input({ password: 'memory-secret', sessionOnly: true }))
    database.sqlite.exec(`
      CREATE TRIGGER reject_webdav_profile_update
      BEFORE UPDATE ON webdav_profiles
      BEGIN
        SELECT RAISE(ABORT, 'profile write rejected');
      END
    `)

    await expect(store.update(input({ password: null, sessionOnly: true }))).rejects.toThrow()
    database.sqlite.exec('DROP TRIGGER reject_webdav_profile_update')

    await expect(store.resolvePassword('primary')).resolves.toBe('memory-secret')
  })

  it('rejects Linux basic_text storage for persistent secrets', async () => {
    const { database } = await createFixture()
    const store = new WebDavProfileStore(database, createSafeStorage({ backend: 'basic_text' }), {
      platform: 'linux',
    })

    await expect(store.update(input({ password: 'secret' }))).rejects.toThrow(/basic_text/i)
  })

  it('fails safely when persisted profile data violates its schema', async () => {
    const { database } = await createFixture()
    await database.database
      .insertInto('webdav_profiles')
      .values({
        id: 'invalid',
        label: 'Invalid',
        endpoint: 'not-a-url',
        base_path: '/',
        username: 'alice',
        allow_insecure_local: 0,
        session_only: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .execute()

    await expect(new WebDavProfileStore(database, createSafeStorage()).list()).rejects.toThrow(
      'WebDAV profile configuration could not be read',
    )
  })

  it('rejects a persisted endpoint with embedded user information', async () => {
    const { database } = await createFixture()
    const store = new WebDavProfileStore(database, createSafeStorage())
    await store.update(input())
    await database.database
      .updateTable('webdav_profiles')
      .set({ endpoint: 'https://alice:secret@dav.example.com' })
      .where('id', '=', 'primary')
      .execute()

    await expect(store.list()).rejects.toThrow('WebDAV profile configuration could not be read')
  })
})

const input = (overrides: Record<string, unknown> = {}) => ({
  id: 'primary',
  label: 'Primary WebDAV',
  endpoint: 'https://dav.example.com/remote.php/dav',
  username: 'alice',
  ...overrides,
})

const createFixture = async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'marklab-webdav-'))
  roots.push(root)
  const database = new LocalDatabaseService({ userDataPath: root })
  await database.initialize()
  databases.push(database)
  return { database, root }
}

const createSafeStorage = ({ available = true, backend = 'kwallet6' } = {}) => ({
  isAsyncEncryptionAvailable: vi.fn(async () => available),
  encryptStringAsync: vi.fn(async (value: string) => Buffer.from(`encrypted:${value}`)),
  decryptStringAsync: vi.fn(async (value: Buffer) => ({
    result: value.toString('utf8').replace(/^encrypted:/, ''),
    shouldReEncrypt: false,
  })),
  getSelectedStorageBackend: vi.fn(() => backend),
})
