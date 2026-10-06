import { describe, expect, it } from 'vitest'

import { planThreeWaySync } from '@electron/services/sync/webdavSync/planner'
import type { SyncManifestEntry } from '@electron/services/sync/core/types'

const entry = (path: string, hash: string, deletedAt?: string): SyncManifestEntry => ({
  path,
  hash,
  size: deletedAt ? 0 : 10,
  modifiedAt: '2026-01-01T00:00:00.000Z',
  deviceId: 'device-a',
  ...(deletedAt ? { deletedAt } : {}),
})

const actions = (
  local: SyncManifestEntry[],
  baseline: SyncManifestEntry[],
  remote: SyncManifestEntry[],
) => planThreeWaySync({ local, baseline, remote }).operations.map(({ kind, path }) => [kind, path])

describe('planThreeWaySync', () => {
  it('covers local-only, remote-only, unchanged, and both-changed branches', () => {
    expect(actions([entry('local.txt', 'a')], [], [])).toEqual([['upload', 'local.txt']])
    expect(actions([], [], [entry('remote.txt', 'b')])).toEqual([['download', 'remote.txt']])
    expect(
      actions([entry('same.txt', 'a')], [entry('same.txt', 'a')], [entry('same.txt', 'a')]),
    ).toEqual([['noop', 'same.txt']])
    expect(
      actions([entry('both.txt', 'b')], [entry('both.txt', 'a')], [entry('both.txt', 'c')]),
    ).toEqual([['conflict', 'both.txt']])
  })

  it('propagates one-sided tombstones and conflicts on delete-vs-change', () => {
    const deleted = entry('note.txt', 'a', '2026-02-01T00:00:00.000Z')
    expect(actions([], [entry('note.txt', 'a')], [entry('note.txt', 'a')])).toEqual([
      ['deleteRemote', 'note.txt'],
    ])
    expect(actions([entry('note.txt', 'a')], [entry('note.txt', 'a')], [deleted])).toEqual([
      ['deleteLocal', 'note.txt'],
    ])
    expect(actions([], [entry('note.txt', 'a')], [entry('note.txt', 'b')])).toEqual([
      ['conflict', 'note.txt'],
    ])
    expect(actions([entry('note.txt', 'b')], [entry('note.txt', 'a')], [deleted])).toEqual([
      ['conflict', 'note.txt'],
    ])
  })

  it('converges independently changed sides when their resulting hashes match', () => {
    expect(
      actions([entry('same.txt', 'b')], [entry('same.txt', 'a')], [entry('same.txt', 'b')]),
    ).toEqual([['noop', 'same.txt']])
  })

  it('treats absent and tombstone as different states and never resurrects deleted content', () => {
    const deleted = entry('note.txt', 'a', '2026-02-01T00:00:00.000Z')

    expect(actions([entry('note.txt', 'b')], [], [deleted])).toEqual([['conflict', 'note.txt']])
    expect(actions([], [], [deleted])).toEqual([['deleteLocal', 'note.txt']])
  })

  it('settles an applied tombstone instead of deleting it again', () => {
    const deleted = entry('note.txt', 'a', '2026-02-01T00:00:00.000Z')

    expect(actions([], [deleted], [deleted])).toEqual([['noop', 'note.txt']])
    expect(actions([], [deleted], [])).toEqual([['noop', 'note.txt']])
  })

  it('converges independent deletions without resurrecting either side', () => {
    const live = entry('note.txt', 'a')
    const deleted = entry('note.txt', 'a', '2026-02-01T00:00:00.000Z')

    expect(actions([], [live], [deleted])).toEqual([['noop', 'note.txt']])
    expect(actions([], [live], [])).toEqual([['noop', 'note.txt']])
  })

  it('still propagates an intentional recreation after a settled tombstone', () => {
    const deleted = entry('note.txt', 'a', '2026-02-01T00:00:00.000Z')

    expect(actions([entry('note.txt', 'b')], [deleted], [deleted])).toEqual([
      ['upload', 'note.txt'],
    ])
    expect(actions([], [deleted], [entry('note.txt', 'b')])).toEqual([['download', 'note.txt']])
  })

  it('freezes paths whose local or remote state is unknown', () => {
    expect(
      planThreeWaySync({
        local: [entry('large.bin', 'a')],
        baseline: [entry('large.bin', 'b')],
        remote: [entry('large.bin', 'c')],
        protectedPaths: new Set(['large.bin']),
      }).operations.map(({ kind, path }) => [kind, path]),
    ).toEqual([['skip', 'large.bin']])
  })
})
