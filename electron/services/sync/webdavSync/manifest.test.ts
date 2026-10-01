import { describe, expect, it } from 'vitest'

import {
  assertCompatibleSyncPaths,
  parseSyncManifest,
} from '@electron/services/sync/webdavSync/manifest.js'
import { createSyncManifest } from '@electron/services/sync/webdavSync/syncState.js'

const manifest = {
  version: 1,
  deviceId: 'device-a',
  updatedAt: '2026-01-01T00:00:00.000Z',
  entries: [
    {
      path: 'notes/a.md',
      hash: 'a'.repeat(64),
      size: 1,
      modifiedAt: '2026-01-01T00:00:00.000Z',
      deviceId: 'device-a',
    },
  ],
}

describe('parseSyncManifest', () => {
  it('validates the manifest version and entry shape', () => {
    expect(parseSyncManifest(manifest)).toEqual(manifest)
    expect(() => parseSyncManifest({ ...manifest, version: 2 })).toThrow(/manifest/i)
    expect(() =>
      parseSyncManifest({ ...manifest, entries: [{ ...manifest.entries[0], hash: 'weak' }] }),
    ).toThrow(/manifest/i)
  })

  it('accepts only the immutable object storage marker', () => {
    const objectManifest = {
      ...manifest,
      entries: [{ ...manifest.entries[0], storage: 'object' }],
    }
    expect(parseSyncManifest(objectManifest)).toEqual(objectManifest)
    expect(() =>
      parseSyncManifest({
        ...manifest,
        entries: [{ ...manifest.entries[0], storage: 'mutable-path' }],
      }),
    ).toThrow(/manifest/i)
  })

  it.each(['../outside.txt', '/absolute.txt', 'C:\\outside.txt', 'notes/../../outside.txt'])(
    'rejects hostile manifest path %s',
    (hostilePath) => {
      expect(() =>
        parseSyncManifest({
          ...manifest,
          entries: [{ ...manifest.entries[0], path: hostilePath }],
        }),
      ).toThrow(/path/i)
    },
  )

  it('rejects duplicate canonical paths', () => {
    expect(() =>
      parseSyncManifest({
        ...manifest,
        entries: [manifest.entries[0], { ...manifest.entries[0], path: 'notes\\a.md' }],
      }),
    ).toThrow(/duplicate/i)
  })

  it.each([
    '.git/config',
    'notes/.GIT/config',
    'node_modules/package/index.js',
    'notes/.MARKLAB-SYNC/state.json',
    'folder/con.txt',
    'folder/name:stream.md',
    'folder/trailing. /note.md',
  ])('rejects non-portable or protected manifest path %s', (unsafePath) => {
    expect(() =>
      parseSyncManifest({
        ...manifest,
        entries: [{ ...manifest.entries[0], path: unsafePath }],
      }),
    ).toThrow(/path/i)
  })

  it.each([
    ['Notes/A.md', 'notes/a.md'],
    ['notes/caf\u00e9.md', 'notes/cafe\u0301.md'],
  ])('rejects portable aliases %s and %s', (left, right) => {
    expect(() =>
      parseSyncManifest({
        ...manifest,
        entries: [
          { ...manifest.entries[0], path: left },
          { ...manifest.entries[0], path: right },
        ],
      }),
    ).toThrow(/duplicate|conflict/i)
  })

  it('rejects portable aliases spread across local, baseline, and remote collections', () => {
    expect(() =>
      assertCompatibleSyncPaths(
        [{ path: 'Notes/A.md' }],
        [{ path: 'notes/a.md' }],
        [{ path: 'other.md' }],
      ),
    ).toThrow(/conflict/i)

    expect(() =>
      assertCompatibleSyncPaths(
        [{ path: 'notes/a.md' }],
        [{ path: 'other.md' }],
        [{ path: 'NOTES/A.md' }],
      ),
    ).toThrow(/conflict/i)
  })

  it('validates generated manifests before they can be written', () => {
    const first = manifest.entries[0]!

    expect(() =>
      createSyncManifest(
        [first, { ...first, path: 'NOTES/A.md' }],
        'device-a',
        new Date('2026-01-01T00:00:00.000Z'),
      ),
    ).toThrow(/duplicate|conflict/i)
  })
})
