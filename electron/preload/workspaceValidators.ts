import type {
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
  WorkspaceTextPreview,
} from '@electron/types'
import type {
  WorkspaceTreeChildrenResult,
  WorkspaceTreeDeltaEvent,
  WorkspaceTreeEntry,
  WorkspaceTreeExistenceResult,
  WorkspaceTreeInitialFileResult,
  WorkspaceTreeSearchResult,
} from '@/types/workspaceTree'
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
export const isTextPreview = (value: unknown): value is WorkspaceTextPreview =>
  hasExactKeys(value, ['content', 'truncated']) &&
  typeof value.content === 'string' &&
  typeof value.truncated === 'boolean'

const isWorkspaceTreeEntry = (value: unknown): value is WorkspaceTreeEntry =>
  hasExactKeys(value, ['kind', 'name', 'path', 'hasChildren']) &&
  (value.kind === 'file' || value.kind === 'folder') &&
  typeof value.name === 'string' &&
  typeof value.path === 'string' &&
  typeof value.hasChildren === 'boolean'

export const isWorkspaceTreeChildrenResult = (
  value: unknown,
): value is WorkspaceTreeChildrenResult =>
  hasExactKeys(value, ['entries', 'nextCursor', 'parent', 'generation', 'revision', 'root']) &&
  Array.isArray(value.entries) &&
  value.entries.every(isWorkspaceTreeEntry) &&
  (value.nextCursor === null || typeof value.nextCursor === 'string') &&
  typeof value.parent === 'string' &&
  isNonNegativeInteger(value.generation) &&
  isNonNegativeInteger(value.revision) &&
  isWorkspaceRoot(value.root)

export const isWorkspaceTreeExistenceResult = (
  value: unknown,
): value is WorkspaceTreeExistenceResult =>
  hasExactKeys(value, ['existing', 'generation', 'revision', 'root']) &&
  Array.isArray(value.existing) &&
  value.existing.every((path) => typeof path === 'string') &&
  isNonNegativeInteger(value.generation) &&
  isNonNegativeInteger(value.revision) &&
  isWorkspaceRoot(value.root)

export const isWorkspaceTreeInitialFileResult = (
  value: unknown,
): value is WorkspaceTreeInitialFileResult =>
  hasExactKeys(value, ['generation', 'path', 'revision', 'root']) &&
  isNonNegativeInteger(value.generation) &&
  (value.path === null || typeof value.path === 'string') &&
  isNonNegativeInteger(value.revision) &&
  isWorkspaceRoot(value.root)

export const isWorkspaceTreeSearchResult = (value: unknown): value is WorkspaceTreeSearchResult =>
  hasExactKeys(value, ['entries', 'generation', 'revision', 'root']) &&
  Array.isArray(value.entries) &&
  value.entries.every(isWorkspaceTreeEntry) &&
  isNonNegativeInteger(value.generation) &&
  isNonNegativeInteger(value.revision) &&
  isWorkspaceRoot(value.root)

const isDeltaEntry = (value: unknown): boolean =>
  hasExactKeys(value, ['kind', 'name', 'path']) &&
  (value.kind === 'file' || value.kind === 'folder') &&
  typeof value.name === 'string' &&
  typeof value.path === 'string'

const isWorkspaceTreeChange = (value: unknown): boolean => {
  if (!isRecord(value)) return false
  if (value.type === 'removed' || value.type === 'changed') {
    return hasExactKeys(value, ['type', 'path']) && typeof value.path === 'string'
  }
  if (value.type === 'added') {
    return hasExactKeys(value, ['type', 'entry']) && isDeltaEntry(value.entry)
  }
  return (
    value.type === 'renamed' &&
    hasExactKeys(value, ['type', 'from', 'entry']) &&
    typeof value.from === 'string' &&
    isDeltaEntry(value.entry)
  )
}

export const isWorkspaceTreeDeltaEvent = (value: unknown): value is WorkspaceTreeDeltaEvent => {
  if (!isRecord(value)) return false
  const baseValid =
    isNonNegativeInteger(value.previousRevision) &&
    isNonNegativeInteger(value.generation) &&
    isNonNegativeInteger(value.revision) &&
    value.revision === value.previousRevision + 1 &&
    isWorkspaceRoot(value.root)
  if (!baseValid) return false
  if (value.kind === 'invalidated') {
    return hasExactKeys(value, ['generation', 'kind', 'previousRevision', 'revision', 'root'])
  }
  return (
    value.kind === 'changes' &&
    hasExactKeys(value, [
      'changes',
      'generation',
      'kind',
      'previousRevision',
      'revision',
      'root',
    ]) &&
    Array.isArray(value.changes) &&
    value.changes.every(isWorkspaceTreeChange)
  )
}

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
