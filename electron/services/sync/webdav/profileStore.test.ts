import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { WebDavProfileStore } from '@electron/services/sync/webdav/profileStore.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('WebDavProfileStore', () => {
  it('encrypts credentials and never returns secrets from list or get', async () => {
    const root = await createRoot()
    const storage = createSafeStorage()
    const store = new WebDavProfileStore(root, storage)
    await store.update(input({ password: 'app-password' }))

    const persisted = await readProfiles(root)
    expect(persisted).not.toContain('app-password')
    expect(persisted).toContain(Buffer.from('encrypted:app-password').toString('base64'))
    expect(await store.list()).toEqual([
      expect.not.objectContaining({ password: expect.anything() }),
    ])
    expect(await store.get('primary')).not.toHaveProperty('encryptedPassword')
    await expect(store.resolvePassword('primary')).resolves.toBe('app-password')
  })

  it('preserves, clears, and deletes a password explicitly', async () => {
    const root = await createRoot()
    const store = new WebDavProfileStore(root, createSafeStorage())
    await store.update(input({ password: 'first' }))

    await store.update(input({ label: 'Updated', password: undefined }))
    await expect(store.resolvePassword('primary')).resolves.toBe('first')
    await store.update(input({ password: null }))
    await expect(store.resolvePassword('primary')).resolves.toBeNull()
    await store.delete('primary')
    await expect(store.get('primary')).resolves.toBeNull()
  })

  it('keeps session-only secrets in memory when encryption is unavailable', async () => {
    const root = await createRoot()
    const storage = createSafeStorage({ available: false })
    const store = new WebDavProfileStore(root, storage)

    await expect(store.update(input({ password: 'secret' }))).rejects.toThrow(/encryption/i)
    await store.update(input({ password: 'memory-secret', sessionOnly: true }))

    expect(await readProfiles(root)).not.toContain('memory-secret')
    await expect(store.resolvePassword('primary')).resolves.toBe('memory-secret')
    await expect(
      new WebDavProfileStore(root, storage).resolvePassword('primary'),
    ).resolves.toBeNull()
  })

  it('rejects Linux basic_text storage for persistent secrets', async () => {
    const root = await createRoot()
    const store = new WebDavProfileStore(root, createSafeStorage({ backend: 'basic_text' }), {
      platform: 'linux',
    })

    await expect(store.update(input({ password: 'secret' }))).rejects.toThrow(/basic_text/i)
  })

  it('fails safely when persisted data is corrupted', async () => {
    const root = await createRoot()
    const directory = path.join(root, 'sync')
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, 'webdav-profiles.json'), '{"password":"secret"')

    await expect(new WebDavProfileStore(root, createSafeStorage()).list()).rejects.toThrow(
      'WebDAV profile configuration could not be read',
    )
  })

  it('rejects a persisted endpoint with embedded user information', async () => {
    const root = await createRoot()
    const store = new WebDavProfileStore(root, createSafeStorage())
    await store.update(input())
    const file = path.join(root, 'sync', 'webdav-profiles.json')
    const data = JSON.parse(await fs.readFile(file, 'utf8')) as {
      profiles: Array<{ endpoint: string }>
    }
    data.profiles[0]!.endpoint = 'https://alice:secret@dav.example.com'
    await fs.writeFile(file, JSON.stringify(data))

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

const createRoot = async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'marklab-webdav-'))
  roots.push(root)
  return root
}

const readProfiles = (root: string) =>
  fs.readFile(path.join(root, 'sync', 'webdav-profiles.json'), 'utf8')

const createSafeStorage = ({ available = true, backend = 'kwallet6' } = {}) => ({
  isAsyncEncryptionAvailable: vi.fn(async () => available),
  encryptStringAsync: vi.fn(async (value: string) => Buffer.from(`encrypted:${value}`)),
  decryptStringAsync: vi.fn(async (value: Buffer) => ({
    result: value.toString('utf8').replace(/^encrypted:/, ''),
    shouldReEncrypt: false,
  })),
  getSelectedStorageBackend: vi.fn(() => backend),
})
