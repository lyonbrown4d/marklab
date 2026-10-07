import { describe, expect, it } from 'vitest'

import { buildFileTree } from '@/logic/fileTree'

describe('buildFileTree', () => {
  it('preserves an unloaded folder child hint so it remains expandable', () => {
    const tree = buildFileTree([
      { kind: 'folder', path: 'notes', hasChildren: true, childrenLoaded: false },
    ])

    expect(tree).toEqual([
      expect.objectContaining({
        path: 'notes',
        hasChildren: true,
        childrenLoaded: false,
        children: [],
      }),
    ])
  })

  it('builds shared ancestors once for a large sibling set', () => {
    const entries = [
      { kind: 'folder' as const, path: 'notes', hasChildren: true },
      ...Array.from({ length: 5_000 }, (_, index) => ({
        kind: 'file' as const,
        path: `notes/file-${String(index).padStart(4, '0')}.md`,
        hasChildren: false,
      })),
    ]

    const tree = buildFileTree(entries)

    expect(tree).toHaveLength(1)
    expect(tree[0]?.children).toHaveLength(5_000)
    expect(tree[0]?.children?.[4_999]?.path).toBe('notes/file-4999.md')
  })
})
