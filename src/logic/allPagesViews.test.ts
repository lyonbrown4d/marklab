import { describe, expect, it } from 'vitest'

import type { AllPagesRow } from '@/logic/allPages'
import { groupAllPagesRowsByFolder } from '@/logic/allPagesViews'

const rows: AllPagesRow[] = [
  {
    assets: 1,
    folder: 'projects',
    headings: 2,
    indexed: true,
    issues: 1,
    links: 3,
    path: 'projects/spec.md',
    title: 'Spec',
  },
  {
    assets: null,
    folder: '/',
    headings: null,
    indexed: false,
    issues: 0,
    links: null,
    path: 'readme.md',
    title: 'readme.md',
  },
  {
    assets: 2,
    folder: 'projects',
    headings: 4,
    indexed: true,
    issues: 0,
    links: 1,
    path: 'projects/notes.md',
    title: 'Notes',
  },
]

describe('allPagesViews', () => {
  it('groups markdown rows by folder with aggregate metadata', () => {
    expect(groupAllPagesRowsByFolder(rows)).toEqual([
      {
        assets: 0,
        folder: '/',
        headings: 0,
        issues: 0,
        links: 0,
        rows: [rows[1]],
      },
      {
        assets: 3,
        folder: 'projects',
        headings: 6,
        issues: 1,
        links: 4,
        rows: [rows[0], rows[2]],
      },
    ])
  })
})
