import { describe, expect, it } from 'vitest'
import { resolveLinkedFilePath } from '@/logic/markdownCompletionPaths'
import type { FileEntry } from '@/store/appTypes'
import type { FsWorkspaceIndex } from '@/services/fsApi'

const files: FileEntry[] = [
  { kind: 'file', path: 'notes/current.md' },
  { kind: 'file', path: 'notes/architecture-overview.md' },
]

describe('resolveLinkedFilePath', () => {
  it('resolves an extensionless Markdown link only when the workspace index contains it', () => {
    const workspaceIndex = {
      files: [{ path: 'notes/current.md' }, { path: 'notes/architecture-overview.md' }],
    } as FsWorkspaceIndex

    expect(
      resolveLinkedFilePath('notes/current.md', 'architecture-overview', [], workspaceIndex),
    ).toBe('notes/architecture-overview.md')
    expect(
      resolveLinkedFilePath('notes/current.md', 'missing-page', files, workspaceIndex),
    ).toBeNull()
  })

  it('resolves indexed non-Markdown workspace links', () => {
    const workspaceIndex = {
      files: [{ path: 'notes/current.md' }],
      paths: ['notes'],
      asset_paths: ['notes/brief.pdf', 'notes/diagram.svg'],
    } as FsWorkspaceIndex

    expect(resolveLinkedFilePath('notes/current.md', './brief.pdf', files, workspaceIndex)).toBe(
      'notes/brief.pdf',
    )
    expect(resolveLinkedFilePath('notes/current.md', './diagram.svg', files, workspaceIndex)).toBe(
      'notes/diagram.svg',
    )
  })

  it('does not treat an indexed directory as an extensionless Markdown file', () => {
    const workspaceIndex = {
      files: [{ path: 'notes/current.md' }, { path: 'notes/docs.md' }],
      paths: ['notes/docs'],
    } as FsWorkspaceIndex

    expect(resolveLinkedFilePath('notes/current.md', 'docs', files, workspaceIndex)).toBe(
      'notes/docs.md',
    )
  })

  it('decodes local paths and strips query parameters before resolving them', () => {
    const workspaceIndex = {
      files: [{ path: 'notes/current.md' }, { path: 'notes/foo bar.md' }],
    } as FsWorkspaceIndex

    expect(
      resolveLinkedFilePath(
        'notes/current.md',
        'foo%20bar.md?raw=1#summary',
        files,
        workspaceIndex,
      ),
    ).toBe('notes/foo bar.md')
  })
})
