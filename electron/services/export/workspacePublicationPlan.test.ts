import { describe, expect, it } from 'vitest'
import { buildWorkspacePublicationPlan } from '@electron/services/export/workspacePublicationPlan'
import type { FsIndexedMarkdownFile } from '@electron/services/workspace/types'

describe('buildWorkspacePublicationPlan', () => {
  it('uses lexical link order and appends disconnected files', () => {
    const indexFile = file('README.md', [
      link('README.md', 'chapters/two.md', 2),
      link('README.md', 'chapters/one.md', 3),
    ])
    const plan = buildWorkspacePublicationPlan(
      {
        files: [file('appendix.md'), file('chapters/one.md'), indexFile, file('chapters/two.md')],
      },
      [
        { path: 'README.md', content: '# Product Guide\nStart here.' },
        { path: 'chapters/one.md', content: '# First concepts\nThe first chapter.' },
        { path: 'chapters/two.md', content: '# Working flow\nThe linked chapter.' },
        { path: 'appendix.md', content: '# Appendix\nReference material.' },
      ],
      'Product Guide',
    )

    expect(plan.chapters.map((chapter) => chapter.path)).toEqual([
      'README.md',
      'chapters/two.md',
      'chapters/one.md',
      'appendix.md',
    ])
    expect(plan.chapters.map((chapter) => chapter.depth)).toEqual([0, 1, 1, 0])
    expect(plan.chapters.at(-1)).toMatchObject({ orphaned: true, title: 'Appendix' })
    expect(plan.orphanCount).toBe(1)
    expect(plan.totalWords).toBeGreaterThan(0)
  })

  it('terminates cycles and keeps every file exactly once', () => {
    const plan = buildWorkspacePublicationPlan(
      {
        files: [file('a.md', [link('a.md', 'b.md', 1)]), file('b.md', [link('b.md', 'a.md', 1)])],
      },
      [
        { path: 'a.md', content: '# A' },
        { path: 'b.md', content: '# B' },
      ],
      'Cycle',
    )

    expect(plan.chapters.map((chapter) => chapter.path)).toEqual(['a.md', 'b.md'])
    expect(plan.chapters.every((chapter) => chapter.orphaned)).toBe(true)
  })
})

const file = (path: string, links: FsIndexedMarkdownFile['links'] = []): FsIndexedMarkdownFile => ({
  assets: [],
  headings: [{ column: 1, level: 1, line: 1, path, slug: 'title', text: title(path) }],
  links,
  path,
})

const link = (
  sourcePath: string,
  targetPath: string,
  line: number,
): FsIndexedMarkdownFile['links'][number] => ({
  column: 1,
  context: '',
  is_external: false,
  line,
  link_type: 'markdown',
  source_path: sourcePath,
  target: targetPath,
  target_path: targetPath,
  text: targetPath,
})

const title = (path: string): string =>
  path
    .split('/')
    .at(-1)
    ?.replace(/\.md$/i, '')
    .replace(/^./, (value) => value.toUpperCase()) ?? path
