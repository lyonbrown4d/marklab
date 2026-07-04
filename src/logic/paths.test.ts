import { describe, expect, it } from 'vitest'
import {
  extractHeadings,
  extractLinks,
  normalizeHeadingAnchor,
  normalizePath,
  resolveRelativePath,
} from '@/logic/paths'

describe('markdown path parsing', () => {
  it('normalizes portable workspace paths without allowing parent traversal', () => {
    expect(normalizePath('/docs//draft.md')).toBe('docs/draft.md')
    expect(normalizePath('docs\\draft.md')).toBe('docs/draft.md')
    expect(normalizePath('docs/../draft.md')).toBe('draft.md')
    expect(normalizePath('../../outside.md')).toBe('outside.md')
  })

  it('resolves markdown link paths relative to the active document', () => {
    expect(resolveRelativePath('notes/current.md', './target.md#details')).toBe('notes/target.md')
    expect(resolveRelativePath('notes/current.md', '../daily/today.md')).toBe('daily/today.md')
    expect(resolveRelativePath('notes/current.md', '/docs/spec.pdf')).toBe('docs/spec.pdf')
    expect(resolveRelativePath('notes/current.md', '#local-heading')).toBe('notes')
  })

  it('extracts stable heading slugs including unicode and duplicates', () => {
    expect(extractHeadings('# 项目 目标\n## 项目 目标\n### API & UI')).toEqual([
      { level: 1, text: '项目 目标', slug: '项目-目标' },
      { level: 2, text: '项目 目标', slug: '项目-目标-1' },
      { level: 3, text: 'API & UI', slug: 'api-ui' },
    ])
  })

  it('normalizes encoded heading anchors for markdown links', () => {
    expect(normalizeHeadingAnchor('%E9%A1%B9%E7%9B%AE%20%E7%9B%AE%E6%A0%87')).toBe('项目-目标')
  })

  it('extracts link context and source position', () => {
    expect(
      extractLinks('intro\nSee [Target](target.md#details) here\nUse [[Daily Note]] too'),
    ).toEqual([
      {
        text: 'Target',
        target: 'target.md#details',
        type: 'markdown',
        context: 'See [Target](target.md#details) here',
        line: 2,
        column: 5,
      },
      {
        text: 'Daily Note',
        target: 'Daily Note',
        type: 'wiki',
        context: 'Use [[Daily Note]] too',
        line: 3,
        column: 5,
      },
    ])
  })
})
