import { randomBytes } from 'node:crypto'
import path from 'node:path'

import type { FsAssetCapability, FsStateData } from '@electron/services/workspace/types.js'
import {
  openWorkspaceAsset,
  validateWorkspaceAssetTarget,
  WorkspaceOpenedAsset,
} from '@electron/services/workspace/workspaceOpenedAsset.js'

const ASSET_CAPABILITY_PREFIX = 'marklab-asset://local/v1/'
const ASSET_CAPABILITY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const ASSET_CAPABILITY_URL_PATTERN = /^marklab-asset:\/\/local\/v1\/([A-Za-z0-9_-]{43})$/
const CAPABILITY_IDLE_TTL_MS = 30 * 60 * 1000
const MAX_CAPABILITIES = 1024

type CapabilityEntry = {
  epoch: number
  expiresAtMs: number
  identity: string
  relativePath: string
  reuseKey: string
  token: string
}

type WorkspaceSnapshot = {
  epoch: number
  identity: string
  state: FsStateData
}

export const workspaceAssetNotFoundError = (): Error => new Error('Asset not found')

export const parseWorkspaceAssetCapabilityUrl = (value: string): string | null => {
  const match = ASSET_CAPABILITY_URL_PATTERN.exec(value)
  if (!match) return null

  const token = match[1]
  if (!token) return null
  try {
    const parsed = new URL(value)
    if (
      parsed.protocol !== 'marklab-asset:' ||
      parsed.hostname !== 'local' ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== `/v1/${token}` ||
      parsed.href !== `${ASSET_CAPABILITY_PREFIX}${token}`
    ) {
      return null
    }
    return token
  } catch {
    return null
  }
}

export const workspaceAssetIdentity = (state: FsStateData): string => {
  return [
    state.rootKind,
    path.resolve(state.rootPath),
    state.singleFile ? path.resolve(state.singleFile) : '',
  ].join('\0')
}

export class WorkspaceAssetCapabilities {
  private readonly entries = new Map<string, CapabilityEntry>()
  private readonly openedAssets = new Set<WorkspaceOpenedAsset>()
  private readonly reusableTokens = new Map<string, string>()
  private epoch = 0
  private disposed = false

  constructor(
    private readonly getState: () => FsStateData,
    private readonly now: () => number = Date.now,
  ) {}

  async issue(value: unknown): Promise<FsAssetCapability> {
    const relativePath = exactStringField(value, 'path')
    if (relativePath == null) throw workspaceAssetNotFoundError()

    this.cleanupExpired(this.now())
    const snapshot = this.snapshot()
    const asset = await validateWorkspaceAssetTarget(snapshot.state, relativePath)
    if (!asset || !this.isCurrent(snapshot)) throw workspaceAssetNotFoundError()

    const now = this.now()
    this.cleanupExpired(now)
    if (!this.isCurrent(snapshot)) throw workspaceAssetNotFoundError()

    const reuseKey = this.reuseKey(snapshot, asset.relativePath)
    const reusableToken = this.reusableTokens.get(reuseKey)
    const reusableEntry = reusableToken ? this.entries.get(reusableToken) : undefined
    if (
      reusableEntry &&
      reusableEntry.epoch === snapshot.epoch &&
      reusableEntry.identity === snapshot.identity
    ) {
      this.touch(reusableEntry, now)
      return this.result(reusableEntry)
    }
    if (reusableToken) this.reusableTokens.delete(reuseKey)

    while (this.entries.size >= MAX_CAPABILITIES) this.evictOldest()
    const token = this.createToken()
    const entry: CapabilityEntry = {
      epoch: snapshot.epoch,
      expiresAtMs: now + CAPABILITY_IDLE_TTL_MS,
      identity: snapshot.identity,
      relativePath: asset.relativePath,
      reuseKey,
      token,
    }
    this.entries.set(token, entry)
    this.reusableTokens.set(reuseKey, token)
    return this.result(entry)
  }

  resolveUrl(assetUrl: string): Promise<WorkspaceOpenedAsset | null> {
    const token = parseWorkspaceAssetCapabilityUrl(assetUrl)
    return token ? this.resolveToken(token) : Promise.resolve(null)
  }

  async resolveToken(token: string): Promise<WorkspaceOpenedAsset | null> {
    const startedAt = this.now()
    this.cleanupExpired(startedAt)
    if (!ASSET_CAPABILITY_TOKEN_PATTERN.test(token)) return null

    const entry = this.entries.get(token)
    if (!entry) return null
    const snapshot = this.snapshot()
    if (
      entry.epoch !== snapshot.epoch ||
      entry.identity !== snapshot.identity ||
      !this.isCurrent(snapshot)
    ) {
      this.deleteEntry(entry)
      return null
    }

    const target = await validateWorkspaceAssetTarget(snapshot.state, entry.relativePath)
    const opened = target ? await openWorkspaceAsset(target) : null
    const resolvedAt = this.now()
    if (
      !opened ||
      !this.isCurrent(snapshot) ||
      this.entries.get(token) !== entry ||
      entry.expiresAtMs <= resolvedAt
    ) {
      if (opened) await opened.close().catch(() => undefined)
      this.deleteEntry(entry)
      return null
    }

    this.openedAssets.add(opened)
    opened.onClosed(() => this.openedAssets.delete(opened))
    this.touch(entry, resolvedAt)
    return opened
  }

  reset(): void {
    this.revoke()
  }

  revoke(): void {
    if (this.disposed) return
    this.epoch += 1
    this.clear()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.epoch += 1
    this.clear()
  }

  private snapshot(): WorkspaceSnapshot {
    const state = { ...this.getState() }
    return {
      epoch: this.epoch,
      identity: workspaceAssetIdentity(state),
      state,
    }
  }

  private isCurrent(snapshot: WorkspaceSnapshot): boolean {
    return (
      !this.disposed &&
      snapshot.epoch === this.epoch &&
      snapshot.identity === workspaceAssetIdentity(this.getState())
    )
  }

  private reuseKey(snapshot: WorkspaceSnapshot, relativePath: string): string {
    const comparablePath = process.platform === 'win32' ? relativePath.toLowerCase() : relativePath
    return `${snapshot.epoch}\0${comparablePath}`
  }

  private result(entry: CapabilityEntry): FsAssetCapability {
    return {
      url: `${ASSET_CAPABILITY_PREFIX}${entry.token}`,
      expires_at_ms: entry.expiresAtMs,
    }
  }

  private touch(entry: CapabilityEntry, now: number): void {
    entry.expiresAtMs = now + CAPABILITY_IDLE_TTL_MS
    this.entries.delete(entry.token)
    this.entries.set(entry.token, entry)
  }

  private cleanupExpired(now: number): void {
    for (const entry of this.entries.values()) {
      if (entry.expiresAtMs <= now) this.deleteEntry(entry)
    }
  }

  private evictOldest(): void {
    const entry = this.entries.values().next().value as CapabilityEntry | undefined
    if (entry) this.deleteEntry(entry)
  }

  private deleteEntry(entry: CapabilityEntry): void {
    if (this.entries.get(entry.token) === entry) this.entries.delete(entry.token)
    if (this.reusableTokens.get(entry.reuseKey) === entry.token) {
      this.reusableTokens.delete(entry.reuseKey)
    }
  }

  private clear(): void {
    this.entries.clear()
    this.reusableTokens.clear()
    for (const opened of this.openedAssets) {
      void opened.close().catch(() => undefined)
    }
    this.openedAssets.clear()
  }

  private createToken(): string {
    for (;;) {
      const token = randomBytes(32).toString('base64url')
      if (!this.entries.has(token)) return token
    }
  }
}

const exactStringField = (value: unknown, field: string): string | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 1 || typeof record[field] !== 'string') return null
  return record[field]
}
