import { describe, expect, it } from 'vitest'
import {
  fileCompletions,
  linkedFilePathCandidates,
  resolveLinkedFilePath,
} from '@/logic/markdownCompletionPaths'
import type { FileEntry } from '@/store/appTypes'

const files: FileEntry[] = [
  { kind: 'file', path: 'notes/current.md' },
  { kind: 'file', path: 'notes/architecture-overview.md' },
]

describe('resolveLinkedFilePath', () => {
  it('keeps an empty target on the current document even if it is not in loaded entries', () => {
    expect(resolveLinkedFilePath('Home.md', '  ', [])).toBe('Home.md')
    expect(resolveLinkedFilePath(null, '  ', [])).toBeNull()
  })

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

describe('linkedFilePathCandidates', () => {
  it('resolves encoded paths without requiring loaded folder entries', () => {
    expect(linkedFilePathCandidates('Home.md', 'User%20Guide/00-Start-Here.md')).toEqual([
      'User Guide/00-Start-Here.md',
    ])
  })

  it('returns at most three distinct candidates in preference order', () => {
    expect(linkedFilePathCandidates('notes/current.md', 'next')).toEqual([
      'notes/next',
      'notes/next.md',
      'notes/next.markdown',
    ])
    expect(linkedFilePathCandidates('notes/current.md', '../docs/file.pdf')).toEqual([
      'docs/file.pdf',
      'docs/file.pdf.md',
      'docs/file.pdf.markdown',
    ])
    expect(linkedFilePathCandidates(null, 'next')).toEqual([])
    expect(linkedFilePathCandidates('Home.md', '')).toEqual(['Home.md'])
  })
})

describe('fileCompletions', () => {
  const workspaceFiles: FileEntry[] = [
    ...files,
    { kind: 'file', path: 'notes/architecture-overview.md' },
    { kind: 'file', path: 'docs/report.pdf' },
    { kind: 'folder', path: 'notes/folder.md' },
    { kind: 'file', path: 'src/app.ts' },
  ]
  it('offers matching Markdown and attachment paths relative to the active document', () => {
    const results = fileCompletions({
      activePath: 'notes/current.md',
      files: workspaceFiles,
      query: 'report',
      replacementStartColumn: 3,
      mode: 'markdown',
    })
    expect(results).toEqual([
      {
        label: 'report.pdf',
        kind: 'file',
        insertText: '../docs/report.pdf',
        detail: 'docs/report.pdf',
        replacementStartColumn: 3,
      },
    ])
  })
  it('filters wiki suggestions to unique Markdown file titles', () => {
    const results = fileCompletions({
      activePath: 'notes/current.md',
      files: workspaceFiles,
      query: 'ARCHITECTURE',
      replacementStartColumn: 1,
      mode: 'wiki',
    })
    expect(results).toHaveLength(1)
    expect(results[0].insertText).toBe('architecture-overview')
    expect(
      fileCompletions({
        activePath: null,
        files: workspaceFiles,
        query: 'report',
        replacementStartColumn: 1,
        mode: 'wiki',
      }),
    ).toEqual([])
  })
  it('uses the workspace path when there is no active document', () => {
    expect(
      fileCompletions({
        activePath: null,
        files: workspaceFiles,
        query: 'current',
        replacementStartColumn: 1,
        mode: 'markdown',
      })[0].insertText,
    ).toBe('notes/current.md')
  })
})

it('preserves malformed percent escapes without throwing during path resolution', () => {
  expect(linkedFilePathCandidates('Home.md', 'note%bad.md')).toEqual(['note%bad.md'])
})
