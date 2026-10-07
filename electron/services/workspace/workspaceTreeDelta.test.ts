import { describe, expect, it } from 'vitest'

import { WorkspaceTreeDeltaTracker } from '@electron/services/workspace/workspaceTreeDelta'

const root = { kind: 'external', path: '/workspace' } as const

describe('WorkspaceTreeDeltaTracker', () => {
  it('emits revisioned additions and removals after a baseline is observed', () => {
    const tracker = new WorkspaceTreeDeltaTracker()
    tracker.observe([{ kind: 'file', name: 'old.md', path: 'old.md' }])

    expect(tracker.advance(root, [{ kind: 'file', name: 'new.md', path: 'new.md' }])).toEqual({
      generation: 0,
      kind: 'changes',
      previousRevision: 0,
      revision: 1,
      root,
      changes: [
        { type: 'removed', path: 'old.md' },
        {
          type: 'added',
          entry: { kind: 'file', name: 'new.md', path: 'new.md' },
        },
      ],
    })
  })

  it('does not guess a rename without application metadata', () => {
    const tracker = new WorkspaceTreeDeltaTracker()
    tracker.observe([
      { kind: 'folder', name: 'docs', path: 'docs' },
      { kind: 'file', name: 'readme.md', path: 'docs/readme.md' },
    ])

    const event = tracker.advance(root, [
      { kind: 'folder', name: 'notes', path: 'notes' },
      { kind: 'file', name: 'readme.md', path: 'notes/readme.md' },
    ])

    expect(event.kind).toBe('changes')
    if (event.kind === 'changes') {
      expect(event.changes.every((change) => change.type !== 'renamed')).toBe(true)
    }
  })

  it('uses explicit application rename metadata', () => {
    const tracker = new WorkspaceTreeDeltaTracker()
    tracker.observe([{ kind: 'file', name: 'old.md', path: 'old.md' }], root)

    const event = tracker.advance(
      root,
      [{ kind: 'file', name: 'new.md', path: 'new.md' }],
      [],
      [{ from: 'old.md', to: 'new.md' }],
    )

    expect(event).toMatchObject({
      kind: 'changes',
      changes: [
        {
          type: 'renamed',
          from: 'old.md',
          entry: { kind: 'file', name: 'new.md', path: 'new.md' },
        },
      ],
    })
  })

  it('invalidates instead of emitting an oversized event', () => {
    const tracker = new WorkspaceTreeDeltaTracker()
    tracker.observe([], root)
    const entries = Array.from({ length: 5_000 }, (_, index) => ({
      kind: 'file' as const,
      name: `${index}.md`,
      path: `${index}.md`,
    }))

    expect(tracker.advance(root, entries)).toMatchObject({ kind: 'invalidated' })
  })

  it('invalidates a small change set whose long paths exceed the byte budget', () => {
    const tracker = new WorkspaceTreeDeltaTracker()
    tracker.observe([], root)
    const entries = Array.from({ length: 64 }, (_, index) => ({
      kind: 'file' as const,
      name: `${index}.md`,
      path: `${'目录/'.repeat(900)}${index}.md`,
    }))

    expect(tracker.advance(root, entries)).toMatchObject({ kind: 'invalidated' })
  })

  it('uses invalidated when no baseline exists or the root changes', () => {
    const tracker = new WorkspaceTreeDeltaTracker()
    expect(tracker.advance(root, [])).toEqual({
      generation: 0,
      kind: 'invalidated',
      previousRevision: 0,
      revision: 1,
      root,
    })
    expect(tracker.advance({ kind: 'external', path: '/other' }, [])).toMatchObject({
      kind: 'invalidated',
      previousRevision: 1,
      revision: 2,
    })
  })

  it('emits explicit content changes without an empty structural delta', () => {
    const tracker = new WorkspaceTreeDeltaTracker()
    const entries = [{ kind: 'file', name: 'note.md', path: 'note.md' }] as const
    tracker.observe([...entries], root)

    expect(tracker.advance(root, [...entries], ['note.md'])).toMatchObject({
      kind: 'changes',
      changes: [{ type: 'changed', path: 'note.md' }],
      previousRevision: 0,
      revision: 1,
    })
  })
})
