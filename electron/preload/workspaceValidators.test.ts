import { describe, expect, it } from 'vitest'
import {
  isAssetCapability,
  isBufferStatus,
  isFlushAck,
  isLifecycleMessage,
  isPathActionAck,
  isReadFileResponse,
  isSessionIdentity,
  isSessionSeed,
  isSnapshot,
  isSnapshotChanged,
  isSwitchToken,
  isWorkspaceDescriptor,
  isWorkspaceTreeChildrenResult,
  isWorkspaceTreeDeltaEvent,
  isWorkspaceTreeExistenceResult,
  isWorkspaceTreeInitialFileResult,
  isWorkspaceTreeSearchResult,
} from '@electron/preload/workspaceValidators'

const session = { session_id: 'session-1', generation: 1 }
const root = { kind: 'external', path: 'D:/notes' }
const snapshot = { root, entries: [{ path: 'note.md', name: 'note.md', kind: 'file' }] }

describe('workspace preload validators', () => {
  it.each([
    ['session', isSessionIdentity, session],
    ['descriptor', isWorkspaceDescriptor, { session, root }],
    ['read', isReadFileResponse, { session, path: 'note.md', content: '# Note' }],
    [
      'buffer',
      isBufferStatus,
      { session, path: 'note.md', client_update_seq: 1, revision: 2, dirty: true },
    ],
    ['flush', isFlushAck, { session, through_client_update_seq: 1 }],
    ['switch', isSwitchToken, { token: 'switch-1' }],
    ['path action', isPathActionAck, { ok: true }],
    ['snapshot', isSnapshot, snapshot],
    ['snapshot event', isSnapshotChanged, { session, snapshot }],
    ['seed', isSessionSeed, { session, root, state: {}, version: 1 }],
    ['lifecycle', isLifecycleMessage, { request_id: 'request-1', deadline: 100, reason: 'switch' }],
    [
      'capability',
      isAssetCapability,
      { url: 'marklab-asset://local/v1/token', expires_at_ms: 100 },
    ],
    [
      'tree children',
      isWorkspaceTreeChildrenResult,
      {
        entries: [{ kind: 'folder', name: 'docs', path: 'docs', hasChildren: true }],
        nextCursor: null,
        parent: '',
        generation: 1,
        revision: 2,
        root,
      },
    ],
    [
      'tree existence',
      isWorkspaceTreeExistenceResult,
      { existing: ['note.md'], generation: 1, revision: 2, root },
    ],
    [
      'tree initial file',
      isWorkspaceTreeInitialFileResult,
      { generation: 1, path: 'note.md', revision: 2, root },
    ],
    ['tree search', isWorkspaceTreeSearchResult, { entries: [], generation: 1, revision: 2, root }],
    [
      'tree delta',
      isWorkspaceTreeDeltaEvent,
      {
        changes: [{ type: 'changed', path: 'old.md' }],
        generation: 1,
        kind: 'changes',
        previousRevision: 1,
        revision: 2,
        root,
      },
    ],
  ] as const)('validates %s without accepting extra or missing fields', (_, validator, valid) => {
    expect(validator(valid)).toBe(true)
    expect(validator({ ...valid, unexpected: true })).toBe(false)
    expect(validator({})).toBe(false)
    expect(validator(null)).toBe(false)
    expect(validator([])).toBe(false)
  })

  it('rejects invalid nested fields and unsafe integers', () => {
    expect(isSessionIdentity({ ...session, generation: -1 })).toBe(false)
    expect(isSessionIdentity({ ...session, generation: Number.MAX_SAFE_INTEGER + 1 })).toBe(false)
    expect(isWorkspaceDescriptor({ session, root: { ...root, kind: 'remote' } })).toBe(false)
    expect(isSnapshot({ root, entries: [{ path: 'a', name: 'a', kind: 'symlink' }] })).toBe(false)
    expect(isSessionSeed({ session, root, state: [] })).toBe(false)
    expect(isPathActionAck({ ok: false })).toBe(false)
  })

  it('rejects non-capability URLs', () => {
    expect(isAssetCapability({ url: 'file:///private/image.png', expires_at_ms: 1 })).toBe(false)
  })

  it('strictly rejects malformed nested tree delta changes', () => {
    expect(
      isWorkspaceTreeDeltaEvent({
        changes: [{ type: 'removed', path: 'old.md', unexpected: true }],
        generation: 1,
        kind: 'changes',
        previousRevision: 1,
        revision: 2,
        root,
      }),
    ).toBe(false)
    expect(
      isWorkspaceTreeDeltaEvent({
        kind: 'invalidated',
        generation: 1,
        previousRevision: 2,
        revision: 4,
        root,
      }),
    ).toBe(false)
  })
})
