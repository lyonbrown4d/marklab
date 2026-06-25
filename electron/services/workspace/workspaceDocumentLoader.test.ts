import { describe, expect, it, vi } from 'vitest'
import { loadWorkspaceDocuments } from '@electron/services/workspace/workspaceDocumentLoader'

describe('loadWorkspaceDocuments', () => {
  it('loads only search-indexable workspace documents', async () => {
    const readFile = vi.fn(async (path: string) => `content:${path}`)
    const documents = await loadWorkspaceDocuments({
      batchSize: 2,
      entries: [
        { kind: 'file', name: 'a.md', path: 'notes/a.md' },
        { kind: 'file', name: 'spec.pdf', path: 'docs/spec.pdf' },
        { kind: 'file', name: 'spec.docx', path: 'docs/spec.docx' },
        { kind: 'file', name: 'flow.drawio', path: 'diagrams/flow.drawio' },
        { kind: 'folder', name: 'assets', path: 'assets' },
        { kind: 'file', name: 'b.markdown', path: 'notes/b.markdown' },
      ],
      readFile,
    })

    expect(documents).toEqual([
      { path: 'notes/a.md', content: 'content:notes/a.md' },
      { path: 'notes/b.markdown', content: 'content:notes/b.markdown' },
    ])
    expect(readFile).toHaveBeenCalledTimes(2)
    expect(readFile).not.toHaveBeenCalledWith('docs/spec.pdf')
  })

  it('applies replacement content only to loaded indexable documents', async () => {
    const readFile = vi.fn(async (path: string) => `content:${path}`)
    const documents = await loadWorkspaceDocuments({
      batchSize: 4,
      entries: [
        { kind: 'file', name: 'a.md', path: 'notes/a.md' },
        { kind: 'file', name: 'spec.pdf', path: 'docs/spec.pdf' },
      ],
      readFile,
      replaceContent: 'draft',
      replacePath: 'notes/a.md',
    })

    expect(documents).toEqual([{ path: 'notes/a.md', content: 'draft' }])
    expect(readFile).not.toHaveBeenCalled()
  })

  it('limits concurrent reads while preserving document order', async () => {
    let activeReads = 0
    let maxActiveReads = 0
    const delaysByPath: Record<string, number> = {
      'notes/a.md': 20,
      'notes/b.md': 0,
      'notes/c.md': 0,
      'notes/d.md': 0,
    }
    const readFile = vi.fn(async (path: string) => {
      activeReads += 1
      maxActiveReads = Math.max(maxActiveReads, activeReads)

      try {
        await new Promise((resolve) => setTimeout(resolve, delaysByPath[path] ?? 0))
        return `content:${path}`
      } finally {
        activeReads -= 1
      }
    })

    const documents = await loadWorkspaceDocuments({
      batchSize: 2,
      entries: [
        { kind: 'file', name: 'a.md', path: 'notes/a.md' },
        { kind: 'file', name: 'b.md', path: 'notes/b.md' },
        { kind: 'file', name: 'c.md', path: 'notes/c.md' },
        { kind: 'file', name: 'd.md', path: 'notes/d.md' },
      ],
      readFile,
    })

    expect(documents).toEqual([
      { path: 'notes/a.md', content: 'content:notes/a.md' },
      { path: 'notes/b.md', content: 'content:notes/b.md' },
      { path: 'notes/c.md', content: 'content:notes/c.md' },
      { path: 'notes/d.md', content: 'content:notes/d.md' },
    ])
    expect(maxActiveReads).toBe(2)
  })
})
