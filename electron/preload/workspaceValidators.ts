import type {
  AssetBytes,
  AssetCapability,
  WorkspaceBufferStatus,
  WorkspaceDescriptor,
  WorkspaceFlushBuffersAck,
  WorkspaceLifecycleMessage,
  WorkspaceReadFileResponse,
  WorkspaceSessionIdentity,
  WorkspaceSessionSeedEvent,
  WorkspaceSnapshot,
  WorkspaceSnapshotChangedEvent,
  WorkspaceSwitchToken,
} from '@electron/types.js'
import type { WorkspacePathActionAck } from '@/types/workspaceSession'

type RecordValue = Record<string, unknown>
export type Validator<T> = (value: unknown) => value is T

const hasOwn = (value: RecordValue, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)
export const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
export const hasExactKeys = (value: unknown, keys: readonly string[]): value is RecordValue =>
  isRecord(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => hasOwn(value, key))
const hasAllowedKeys = (
  value: unknown,
  required: readonly string[],
  allowed: readonly string[],
): value is RecordValue =>
  isRecord(value) &&
  required.every((key) => hasOwn(value, key)) &&
  Object.keys(value).every((key) => allowed.includes(key))
const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

export const isSessionIdentity = (value: unknown): value is WorkspaceSessionIdentity =>
  hasExactKeys(value, ['session_id', 'generation']) &&
  isNonEmptyString(value.session_id) &&
  isNonNegativeInteger(value.generation)
const isWorkspaceRoot = (value: unknown): value is WorkspaceDescriptor['root'] =>
  hasExactKeys(value, ['kind', 'path']) &&
  (value.kind === 'internal' || value.kind === 'external' || value.kind === 'single') &&
  typeof value.path === 'string'
export const isWorkspaceDescriptor = (value: unknown): value is WorkspaceDescriptor =>
  hasExactKeys(value, ['session', 'root']) &&
  isSessionIdentity(value.session) &&
  isWorkspaceRoot(value.root)
export const isReadFileResponse = (value: unknown): value is WorkspaceReadFileResponse =>
  hasExactKeys(value, ['session', 'path', 'content']) &&
  isSessionIdentity(value.session) &&
  typeof value.path === 'string' &&
  typeof value.content === 'string'
export const isBufferStatus = (value: unknown): value is WorkspaceBufferStatus =>
  hasExactKeys(value, ['session', 'client_update_seq', 'path', 'revision', 'dirty']) &&
  isSessionIdentity(value.session) &&
  isNonNegativeInteger(value.client_update_seq) &&
  typeof value.path === 'string' &&
  isNonNegativeInteger(value.revision) &&
  typeof value.dirty === 'boolean'
export const isFlushAck = (value: unknown): value is WorkspaceFlushBuffersAck =>
  hasExactKeys(value, ['session', 'through_client_update_seq']) &&
  isSessionIdentity(value.session) &&
  isNonNegativeInteger(value.through_client_update_seq)
export const isSwitchToken = (value: unknown): value is WorkspaceSwitchToken =>
  hasExactKeys(value, ['token']) && isNonEmptyString(value.token)
export const isPathActionAck = (value: unknown): value is WorkspacePathActionAck =>
  hasExactKeys(value, ['ok']) && value.ok === true

export const isSnapshot = (value: unknown): value is WorkspaceSnapshot =>
  hasExactKeys(value, ['root', 'entries']) &&
  isWorkspaceRoot(value.root) &&
  Array.isArray(value.entries) &&
  value.entries.every(
    (entry) =>
      hasExactKeys(entry, ['path', 'name', 'kind']) &&
      typeof entry.path === 'string' &&
      typeof entry.name === 'string' &&
      (entry.kind === 'file' || entry.kind === 'folder'),
  )
export const isSnapshotChanged = (value: unknown): value is WorkspaceSnapshotChangedEvent =>
  hasExactKeys(value, ['session', 'snapshot']) &&
  isSessionIdentity(value.session) &&
  isSnapshot(value.snapshot)
export const isSessionSeed = (value: unknown): value is WorkspaceSessionSeedEvent =>
  hasAllowedKeys(value, ['session', 'root'], ['session', 'root', 'state', 'version']) &&
  isSessionIdentity(value.session) &&
  isWorkspaceRoot(value.root) &&
  (value.state === undefined || isRecord(value.state)) &&
  (value.version === undefined || isNonNegativeInteger(value.version))
export const isLifecycleMessage = (value: unknown): value is WorkspaceLifecycleMessage =>
  hasExactKeys(value, ['request_id', 'deadline', 'reason']) &&
  isNonEmptyString(value.request_id) &&
  isNonNegativeInteger(value.deadline) &&
  typeof value.reason === 'string'

const capabilityUrlPattern = /^marklab-asset:\/\/local\/v1\/[A-Za-z0-9._~-]+$/
export const isAssetCapability = (value: unknown): value is AssetCapability =>
  hasExactKeys(value, ['url', 'expires_at_ms']) &&
  typeof value.url === 'string' &&
  capabilityUrlPattern.test(value.url) &&
  isNonNegativeInteger(value.expires_at_ms)
export const isAssetBytes = (value: unknown): value is AssetBytes =>
  hasAllowedKeys(value, ['bytes', 'size_bytes'], ['bytes', 'media_type', 'size_bytes']) &&
  value.bytes instanceof ArrayBuffer &&
  isNonNegativeInteger(value.size_bytes) &&
  value.size_bytes === value.bytes.byteLength &&
  (value.media_type === undefined ||
    value.media_type === null ||
    typeof value.media_type === 'string')
