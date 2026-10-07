import { describe, expect, it } from 'vitest'

import { applyWorkspaceTreeDelta } from '@/logic/workspaceTreeProjection'
import type { WorkspaceTreeDeltaEvent } from '@/types/workspaceTree'

const root = { kind: 'external', path: '/workspace' } as const

describe('applyWorkspaceTreeDelta', () => {
  it('applies ordered changes to the loaded projection', () => {
    const event: WorkspaceTreeDeltaEvent = {
      generation: 0,
      kind: 'changes',
      previousRevision: 3,
      revision: 4,
      root,
      changes: [
        {
          type: 'renamed',
          from: 'docs',
          entry: { kind: 'folder', name: 'notes', path: 'notes' },
        },
        {
          type: 'added',
          entry: { kind: 'file', name: 'today.md', path: 'notes/today.md' },
        },
      ],
    }

    expect(
      applyWorkspaceTreeDelta(
        [
          { kind: 'folder', path: 'docs' },
          { kind: 'file', path: 'docs/old.md' },
        ],
        3,
        event,
      ),
    ).toEqual({
      entries: [
        { kind: 'folder', path: 'notes' },
        { kind: 'file', path: 'notes/old.md' },
        { kind: 'file', path: 'notes/today.md' },
      ],
      revision: 4,
      refreshRequired: false,
    })
  })

  it('detects a revision gap and requests a controlled refresh', () => {
    const event: WorkspaceTreeDeltaEvent = {
      generation: 0,
      kind: 'changes',
      previousRevision: 4,
      revision: 5,
      root,
      changes: [],
    }

    expect(applyWorkspaceTreeDelta([], 2, event)).toEqual({
      entries: [],
      revision: 2,
      refreshRequired: true,
    })
  })

  it('requests refresh for explicit invalidation', () => {
    const event: WorkspaceTreeDeltaEvent = {
      generation: 0,
      kind: 'invalidated',
      previousRevision: 2,
      revision: 3,
      root,
    }

    expect(applyWorkspaceTreeDelta([], 2, event).refreshRequired).toBe(true)
  })
})
