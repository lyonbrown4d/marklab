import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { validateWebDavEndpoint } from '@electron/services/sync/webdav/endpoint.js'
import {
  webDavProfileFileSchema,
  webDavProfileInputSchema,
  type StoredWebDavProfile,
  type WebDavProfileFile,
} from '@electron/services/sync/webdav/profileSchemas.js'
import type {
  WebDavProfile,
  WebDavProfileInput,
  WebDavProfileStoreContract,
  WebDavProfileStoreOptions,
  WebDavSafeStorage,
} from '@electron/services/sync/webdav/types.js'

export class WebDavProfileStore implements WebDavProfileStoreContract {
  private readonly filePath: string
  private readonly sessionPasswords = new Map<string, string>()
  private readonly platform: NodeJS.Platform
  private tail: Promise<void> = Promise.resolve()

  constructor(
    userDataPath: string,
    private readonly safeStorage: WebDavSafeStorage,
    options: WebDavProfileStoreOptions = {},
  ) {
    if (!path.isAbsolute(userDataPath)) {
      throw new Error('WebDAV profile storage path must be absolute')
    }
    this.filePath = path.join(path.resolve(userDataPath), 'sync', 'webdav-profiles.json')
    this.platform = options.platform ?? process.platform
  }

  list(): Promise<WebDavProfile[]> {
    return this.serialized(async () =>
      (await this.readFile()).profiles.map((profile) => this.toPublic(profile)),
    )
  }

  get(id: string): Promise<WebDavProfile | null> {
    return this.serialized(async () => {
      const profile = (await this.readFile()).profiles.find((candidate) => candidate.id === id)
      return profile ? this.toPublic(profile) : null
    })
  }

  update(input: WebDavProfileInput): Promise<WebDavProfile> {
    return this.serialized(async () => {
      const parsed = webDavProfileInputSchema.parse(input)
      const allowInsecureLocal = parsed.allowInsecureLocal ?? false
      const sessionOnly = parsed.sessionOnly ?? false
      const location = validateWebDavEndpoint(parsed.endpoint, allowInsecureLocal, parsed.basePath)
      const data = await this.readFile()
      const current = data.profiles.find((profile) => profile.id === parsed.id)
      const encryptedPassword = await this.updatedPassword(
        parsed.id,
        parsed.password,
        sessionOnly,
        current,
      )
      const now = new Date().toISOString()
      const next: StoredWebDavProfile = {
        id: parsed.id,
        label: parsed.label,
        endpoint: location.endpoint,
        basePath: location.basePath,
        username: parsed.username,
        allowInsecureLocal,
        sessionOnly,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        ...(encryptedPassword ? { encryptedPassword } : {}),
      }
      data.profiles = [...data.profiles.filter((profile) => profile.id !== next.id), next].sort(
        compareProfiles,
      )
      await this.writeFile(data)
      return this.toPublic(next)
    })
  }

  delete(id: string): Promise<{ ok: true }> {
    return this.serialized(async () => {
      const data = await this.readFile()
      data.profiles = data.profiles.filter((profile) => profile.id !== id)
      this.sessionPasswords.delete(id)
      await this.writeFile(data)
      return { ok: true }
    })
  }

  resolvePassword(id: string): Promise<string | null> {
    return this.serialized(async () => {
      const profile = (await this.readFile()).profiles.find((candidate) => candidate.id === id)
      if (!profile) return null
      if (profile.sessionOnly) return this.sessionPasswords.get(id) ?? null
      if (!profile.encryptedPassword) return null
      return this.decrypt(profile)
    })
  }

  private async updatedPassword(
    id: string,
    password: string | null | undefined,
    sessionOnly: boolean,
    current: StoredWebDavProfile | undefined,
  ): Promise<string | undefined> {
    if (password === null) {
      this.sessionPasswords.delete(id)
      return undefined
    }
    if (password !== undefined) {
      if (sessionOnly) {
        this.sessionPasswords.set(id, password)
        return undefined
      }
      this.sessionPasswords.delete(id)
      return this.encrypt(password)
    }
    if (!current) return undefined
    if (sessionOnly) {
      if (!current.sessionOnly && current.encryptedPassword) {
        this.sessionPasswords.set(id, await this.decrypt(current))
      }
      return undefined
    }
    if (current.sessionOnly) {
      const memoryPassword = this.sessionPasswords.get(id)
      this.sessionPasswords.delete(id)
      return memoryPassword ? this.encrypt(memoryPassword) : undefined
    }
    return current.encryptedPassword
  }

  private async encrypt(password: string): Promise<string> {
    await this.assertPersistentEncryption()
    try {
      return (await this.safeStorage.encryptStringAsync(password)).toString('base64')
    } catch {
      throw new Error('WebDAV credential could not be encrypted')
    }
  }

  private async decrypt(profile: StoredWebDavProfile): Promise<string> {
    await this.assertPersistentEncryption()
    try {
      const decrypted = await this.safeStorage.decryptStringAsync(
        Buffer.from(profile.encryptedPassword!, 'base64'),
      )
      if (decrypted.shouldReEncrypt) {
        profile.encryptedPassword = await this.encrypt(decrypted.result)
        const data = await this.readFile()
        data.profiles = data.profiles.map((candidate) =>
          candidate.id === profile.id ? profile : candidate,
        )
        await this.writeFile(data)
      }
      return decrypted.result
    } catch {
      throw new Error('Stored WebDAV credential could not be decrypted')
    }
  }

  private async assertPersistentEncryption(): Promise<void> {
    if (
      this.platform === 'linux' &&
      this.safeStorage.getSelectedStorageBackend?.() === 'basic_text'
    ) {
      throw new Error(
        'WebDAV credential encryption uses Linux basic_text; choose session-only storage or configure a system keyring.',
      )
    }
    if (!(await this.safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error(
        'OS credential encryption is unavailable; choose session-only WebDAV credential storage.',
      )
    }
  }

  private toPublic(profile: StoredWebDavProfile): WebDavProfile {
    return {
      id: profile.id,
      label: profile.label,
      endpoint: profile.endpoint,
      basePath: profile.basePath,
      username: profile.username,
      allowInsecureLocal: profile.allowInsecureLocal,
      sessionOnly: profile.sessionOnly,
      hasPassword: profile.sessionOnly
        ? this.sessionPasswords.has(profile.id)
        : Boolean(profile.encryptedPassword),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    }
  }

  private async readFile(): Promise<WebDavProfileFile> {
    let contents: string
    try {
      contents = await fs.readFile(this.filePath, 'utf8')
    } catch (error) {
      if (isMissing(error)) return { version: 1, profiles: [] }
      throw new Error('WebDAV profile configuration could not be read', {
        cause: error,
      })
    }
    try {
      const data = webDavProfileFileSchema.parse(JSON.parse(contents))
      for (const profile of data.profiles) {
        const location = validateWebDavEndpoint(
          profile.endpoint,
          profile.allowInsecureLocal,
          profile.basePath,
        )
        if (location.endpoint !== profile.endpoint || location.basePath !== profile.basePath) {
          throw new Error('Stored WebDAV endpoint is not canonical')
        }
      }
      return data
    } catch {
      throw new Error('WebDAV profile configuration could not be read')
    }
  }

  private async writeFile(data: WebDavProfileFile): Promise<void> {
    const directory = path.dirname(this.filePath)
    await fs.mkdir(directory, { recursive: true })
    const temporary = `${this.filePath}.tmp-${randomUUID()}`
    try {
      await fs.writeFile(temporary, JSON.stringify(data, null, 2), {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      })
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

const compareProfiles = (left: StoredWebDavProfile, right: StoredWebDavProfile): number =>
  left.label.localeCompare(right.label) || left.id.localeCompare(right.id)

const isMissing = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
