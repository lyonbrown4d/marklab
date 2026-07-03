import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import SearchResultPreview from '@/components/SearchResultPreview'
import type { FsSearchResult } from '@/services/fsApi'

const createResult = (overrides: Partial<FsSearchResult> = {}): FsSearchResult => ({
  column: 3,
  end_column: 9,
  line: 12,
  path: 'docs/Guide.md',
  score: 0.92,
  snippet: 'Alpha beta gamma',
  snippet_highlights: [{ end: 10, start: 6 }],
  title: 'Guide title',
  ...overrides,
})

describe('SearchResultPreview', () => {
  it('renders the full preview with normalized icon sizing and highlighted snippet text', () => {
    const { container } = render(<SearchResultPreview result={createResult()} />)

    expect(container.querySelector('svg')?.classList.contains('size-4')).toBe(true)
    expect(container.querySelector('svg')?.classList.contains('lucide-file-search')).toBe(true)
    expect(screen.getByText('Guide title')).toBeTruthy()
    expect(screen.getByText('docs/Guide.md:12')).toBeTruthy()
    expect(screen.getByText('beta').tagName).toBe('MARK')
  })

  it('uses the compact search icon and compact snippet treatment', () => {
    const { container } = render(<SearchResultPreview compact result={createResult()} />)

    expect(container.querySelector('svg')?.classList.contains('size-4')).toBe(true)
    expect(container.querySelector('svg')?.classList.contains('lucide-search')).toBe(true)
    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('gamma')).toBeTruthy()
  })

  it('clamps invalid highlight ranges and omits snippet markup when no snippet exists', () => {
    const { rerender } = render(
      <SearchResultPreview
        result={createResult({
          snippet: 'abcdef',
          snippet_highlights: [
            { end: 2, start: -3 },
            { end: 3, start: 3 },
            { end: 99, start: 4 },
          ],
        })}
      />,
    )

    expect(screen.getByText('ab').tagName).toBe('MARK')
    expect(screen.getByText('ef').tagName).toBe('MARK')

    rerender(<SearchResultPreview result={createResult({ snippet: '', snippet_highlights: [] })} />)

    expect(screen.queryByText('Alpha beta gamma')).toBeNull()
  })
})
