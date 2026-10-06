import {
  WebDavProfileRepository,
  type WebDavProfileRow,
} from '@electron/database/repositories/webDavProfileRepository'
import type { LocalDatabaseService } from '@electron/database/localDatabaseService'
import { validateWebDavEndpoint } from '@electron/services/sync/webdav/endpoint'
import {
  storedWebDavProfileSchema,
  webDavProfileInputSchema,
  type StoredWebDavProfile,
} from '@electron/services/sync/webdav/profileSchemas'
import type {
  WebDavProfile,
  WebDavProfileInput,
  WebDavProfileStoreContract,
  WebDavProfileStoreOptions,
  WebDavSafeStorage,
} from '@electron/services/sync/webdav/types'

export class WebDavProfileStore implements WebDavProfileStoreContract {
  private readonly profiles: WebDavProfileRepository
  private readonly sessionPasswords = new Map<string, string>()
  private readonly platform: NodeJS.Platform

  constructor(
    private readonly localDatabase: LocalDatabaseService,
    private readonly safeStorage: WebDavSafeStorage,
    options: WebDavProfileStoreOptions = {},
  ) {
    this.platform = options.platform ?? process.platform
    this.profiles = new WebDavProfileRepository()
  }

  async list(): Promise<WebDavProfile[]> {
    const profiles = await this.readProfiles()
    return profiles.map((profile) => this.toPublic(profile))
  }

  async get(id: string): Promise<WebDavProfile | null> {
    const profile = await this.readProfile(id)
    return profile ? this.toPublic(profile) : null
  }

  async update(input: WebDavProfileInput): Promise<WebDavProfile> {
    const parsed = webDavProfileInputSchema.parse(input)
    const allowInsecureLocal = parsed.allowInsecureLocal ?? false
    const sessionOnly = parsed.sessionOnly ?? false
    const location = validateWebDavEndpoint(parsed.endpoint, allowInsecureLocal, parsed.basePath)
    await this.localDatabase.initialize()
    const currentRow = await this.profiles.get(this.localDatabase.database, parsed.id)
    const current = currentRow ? parseStoredProfile(currentRow) : undefined
    const passwordUpdate = await this.preparePasswordUpdate(
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
      ...(passwordUpdate.encryptedPassword
        ? { encryptedPassword: passwordUpdate.encryptedPassword }
        : {}),
    }
    await this.profiles.upsert(this.localDatabase.database, profileValues(next))
    this.applySessionPasswordUpdate(parsed.id, passwordUpdate.sessionPassword)
    return this.toPublic(next)
  }

  async delete(id: string): Promise<{ ok: true }> {
    await this.localDatabase.initialize()
    await this.profiles.remove(this.localDatabase.database, id)
    this.sessionPasswords.delete(id)
    return { ok: true }
  }

  async resolvePassword(id: string): Promise<string | null> {
    const profile = await this.readProfile(id)
    if (!profile) return null
    if (profile.sessionOnly) return this.sessionPasswords.get(id) ?? null
    if (!profile.encryptedPassword) return null
    return this.decrypt(profile)
  }

  private async readProfiles(): Promise<StoredWebDavProfile[]> {
    await this.localDatabase.initialize()
    try {
      const rows = await this.profiles.list(this.localDatabase.database)
      return rows.map(parseStoredProfile)
    } catch (error) {
      throw new Error('WebDAV profile configuration could not be read', { cause: error })
    }
  }

  private async readProfile(id: string): Promise<StoredWebDavProfile | null> {
    await this.localDatabase.initialize()
    try {
      const row = await this.profiles.get(this.localDatabase.database, id)
      return row ? parseStoredProfile(row) : null
    } catch (error) {
      throw new Error('WebDAV profile configuration could not be read', { cause: error })
    }
  }

  private async preparePasswordUpdate(
    id: string,
    password: string | null | undefined,
    sessionOnly: boolean,
    current: StoredWebDavProfile | undefined,
  ): Promise<PreparedPasswordUpdate> {
    if (password === null) {
      return { sessionPassword: { kind: 'delete' } }
    }
    if (password !== undefined) {
      if (sessionOnly) {
        return { sessionPassword: { kind: 'set', value: password } }
      }
      return {
        encryptedPassword: await this.encrypt(password),
        sessionPassword: { kind: 'delete' },
      }
    }
    if (!current) return { sessionPassword: { kind: 'delete' } }
    if (sessionOnly) {
      if (!current.sessionOnly && current.encryptedPassword) {
        return {
          sessionPassword: {
            kind: 'set',
            value: await this.decryptValue(current.encryptedPassword),
          },
        }
      }
      return { sessionPassword: { kind: 'preserve' } }
    }
    if (current.sessionOnly) {
      const memoryPassword = this.sessionPasswords.get(id)
      return {
        ...(memoryPassword ? { encryptedPassword: await this.encrypt(memoryPassword) } : {}),
        sessionPassword: { kind: 'delete' },
      }
    }
    return {
      ...(current.encryptedPassword ? { encryptedPassword: current.encryptedPassword } : {}),
      sessionPassword: { kind: 'delete' },
    }
  }

  private applySessionPasswordUpdate(id: string, update: SessionPasswordUpdate): void {
    if (update.kind === 'set') this.sessionPasswords.set(id, update.value)
    if (update.kind === 'delete') this.sessionPasswords.delete(id)
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
    const decrypted = await this.decryptStored(profile.encryptedPassword!)
    if (decrypted.shouldReEncrypt) {
      const encryptedPassword = await this.encrypt(decrypted.result)
      await this.profiles.update(this.localDatabase.database, profile.id, {
        encrypted_password: encryptedBuffer(encryptedPassword),
      })
    }
    return decrypted.result
  }

  private async decryptValue(encryptedPassword: string): Promise<string> {
    return (await this.decryptStored(encryptedPassword)).result
  }

  private async decryptStored(encryptedPassword: string) {
    await this.assertPersistentEncryption()
    try {
      return await this.safeStorage.decryptStringAsync(Buffer.from(encryptedPassword, 'base64'))
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
}

type SessionPasswordUpdate =
  { kind: 'delete' } | { kind: 'preserve' } | { kind: 'set'; value: string }

type PreparedPasswordUpdate = {
  encryptedPassword?: string
  sessionPassword: SessionPasswordUpdate
}

const profileValues = (profile: StoredWebDavProfile) => ({
  id: profile.id,
  label: profile.label,
  endpoint: profile.endpoint,
  base_path: profile.basePath,
  username: profile.username,
  encrypted_password: encryptedBuffer(profile.encryptedPassword),
  allow_insecure_local: booleanInteger(profile.allowInsecureLocal),
  session_only: booleanInteger(profile.sessionOnly),
  created_at: profile.createdAt,
  updated_at: profile.updatedAt,
})

const parseStoredProfile = (row: WebDavProfileRow): StoredWebDavProfile => {
  const profile = storedWebDavProfileSchema.parse({
    id: row.id,
    label: row.label,
    endpoint: row.endpoint,
    basePath: row.base_path,
    username: row.username,
    allowInsecureLocal: Boolean(row.allow_insecure_local),
    sessionOnly: Boolean(row.session_only),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.encrypted_password
      ? { encryptedPassword: row.encrypted_password.toString('base64') }
      : {}),
  })
  const location = validateWebDavEndpoint(
    profile.endpoint,
    profile.allowInsecureLocal,
    profile.basePath,
  )
  if (location.endpoint !== profile.endpoint || location.basePath !== profile.basePath) {
    throw new Error('Stored WebDAV endpoint is not canonical')
  }
  return profile
}

const encryptedBuffer = (value: string | undefined): Buffer | null =>
  value ? Buffer.from(value, 'base64') : null

const booleanInteger = (value: boolean): 0 | 1 => (value ? 1 : 0)
