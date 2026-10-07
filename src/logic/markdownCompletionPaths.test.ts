import { describe, expect, it } from 'vitest'
import { resolveLinkedFilePath } from '@/logic/markdownCompletionPaths'
import type { FileEntry } from '@/store/appTypes'

const files: FileEntry[] = [
  { kind: 'file', path: 'notes/current.md' },
  { kind: 'file', path: 'notes/architecture-overview.md' },
]

describe('resolveLinkedFilePath', () => {
  it('resolves extensionless Markdown links from the workspace file tree', () => {
    expect(resolveLinkedFilePath('notes/current.md', 'architecture-overview', files)).toBe(
      'notes/architecture-overview.md',
    )
    expect(resolveLinkedFilePath('notes/current.md', 'missing-page', files)).toBeNull()
  })

  it('resolves non-Markdown workspace links', () => {
    const workspaceFiles: FileEntry[] = [
      ...files,
      { kind: 'file', path: 'notes/brief.pdf' },
      { kind: 'file', path: 'notes/diagram.svg' },
    ]
    expect(resolveLinkedFilePath('notes/current.md', './brief.pdf', workspaceFiles)).toBe(
      'notes/brief.pdf',
    )
    expect(resolveLinkedFilePath('notes/current.md', './diagram.svg', workspaceFiles)).toBe(
      'notes/diagram.svg',
    )
  })

  it('does not treat a directory as an extensionless Markdown file', () => {
    const workspaceFiles: FileEntry[] = [
      ...files,
      { kind: 'folder', path: 'notes/docs' },
      { kind: 'file', path: 'notes/docs.md' },
    ]
    expect(resolveLinkedFilePath('notes/current.md', 'docs', workspaceFiles)).toBe('notes/docs.md')
  })

  it('decodes local paths and strips query parameters before resolving them', () => {
    expect(
      resolveLinkedFilePath('notes/current.md', 'foo%20bar.md?raw=1#summary', [
        ...files,
        { kind: 'file', path: 'notes/foo bar.md' },
      ]),
    ).toBe('notes/foo bar.md')
  })
})
