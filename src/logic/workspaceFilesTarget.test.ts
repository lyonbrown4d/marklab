import { describe, expect, it } from 'vitest'
import { getWorkspaceFilesTarget } from '@/logic/workspaceFilesTarget'
import type { FileEntry, WorkspaceTab } from '@/store/appTypes'

const entries: FileEntry[] = [
  { kind: 'folder', path: 'notes' },
  { kind: 'file', path: 'notes/data.json' },
  { kind: 'file', path: 'notes/readme.md' },
]

describe('getWorkspaceFilesTarget', () => {
  it('restores the last existing file tab with its view', () => {
    const tabs: WorkspaceTab[] = [
      { kind: 'file', path: 'notes/readme.md', view: 'source' },
      { kind: 'workspace-graph' },
      { kind: 'file', path: 'notes/data.json', view: 'source' },
    ]

    expect(getWorkspaceFilesTarget(tabs, entries)).toEqual(tabs[2])
  })

  it('keeps the active file selected when returning from the workspace map', () => {
    const tabs: WorkspaceTab[] = [
      { kind: 'file', path: 'notes/data.json', view: 'source' },
      { kind: 'file', path: 'notes/readme.md', view: 'source' },
    ]

    expect(getWorkspaceFilesTarget(tabs, entries, 'file:source:notes/data.json')).toEqual(tabs[0])
  })

  it('falls back to the first Markdown file, then the first file, and never invents a route', () => {
    expect(getWorkspaceFilesTarget([], entries)).toEqual({
      kind: 'file',
      path: 'notes/readme.md',
      view: 'edit',
    })
    expect(getWorkspaceFilesTarget([], [entries[1]])).toEqual({
      kind: 'file',
      path: 'notes/data.json',
      view: 'edit',
    })
    expect(getWorkspaceFilesTarget([], [entries[0]])).toBeNull()
  })

  it('uses the configured default view and normalizes preview-only fallback files', () => {
    expect(getWorkspaceFilesTarget([], [entries[2]], null, 'source')).toEqual({
      kind: 'file',
      path: 'notes/readme.md',
      view: 'source',
    })
    expect(
      getWorkspaceFilesTarget([], [{ kind: 'file', path: 'assets/cover.png' }], null, 'source'),
    ).toEqual({
      kind: 'file',
      path: 'assets/cover.png',
      view: 'preview',
    })
  })

  it('normalizes a stale active tab view for a preview-only file', () => {
    const previewEntry: FileEntry = { kind: 'file', path: 'assets/cover.png' }
    const staleTab: WorkspaceTab = {
      kind: 'file',
      path: previewEntry.path,
      view: 'source',
    }

    expect(
      getWorkspaceFilesTarget([staleTab], [previewEntry], 'file:source:assets/cover.png'),
    ).toEqual({
      kind: 'file',
      path: previewEntry.path,
      view: 'preview',
    })
  })
})
