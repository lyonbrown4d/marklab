import { describe, expect, it } from 'vitest'

import type { FsWorkspaceIndex } from '@electron/services/workspace/types'
import {
  queryWorkspaceDocumentInsights,
  queryWorkspaceKnowledgeSummary,
  queryWorkspaceNavigation,
  queryWorkspacePages,
} from '@electron/services/workspace/workspaceIndexQueries'

const index: FsWorkspaceIndex = {
  paths: ['docs/alpha.md', 'docs/beta.md', 'assets/logo.png'],
  asset_paths: ['assets/logo.png'],
  files: [
    {
      path: 'docs/alpha.md',
      headings: [
        { path: 'docs/alpha.md', level: 1, text: 'Alpha', slug: 'alpha', line: 1, column: 1 },
      ],
      links: [
        {
          source_path: 'docs/alpha.md',
          text: 'Beta',
          target: './beta.md',
          link_type: 'markdown',
          target_path: 'docs/beta.md',
          target_anchor: 'details',
          target_heading_slug: 'details',
          is_external: false,
          context: 'See Beta',
          line: 3,
          column: 5,
        },
        {
          source_path: 'docs/alpha.md',
          text: 'Missing',
          target: './missing.md',
          link_type: 'markdown',
          target_path: null,
          is_external: false,
          context: 'See Missing',
          line: 4,
          column: 5,
        },
      ],
      assets: [
        {
          source_path: 'docs/alpha.md',
          target: '../assets/logo.png',
          target_path: 'assets/logo.png',
          is_external: false,
          context: '![Logo](../assets/logo.png)',
          line: 6,
          column: 1,
          media_type: 'image/png',
        },
        {
          source_path: 'docs/alpha.md',
          target: '../assets/missing.png',
          target_path: 'assets/missing.png',
          is_external: false,
          context: '![Missing](../assets/missing.png)',
          line: 7,
          column: 1,
        },
      ],
    },
    {
      path: 'docs/beta.md',
      headings: [
        { path: 'docs/beta.md', level: 1, text: 'Beta', slug: 'beta', line: 1, column: 1 },
        { path: 'docs/beta.md', level: 2, text: 'Details', slug: 'details', line: 2, column: 1 },
      ],
      links: [
        {
          source_path: 'docs/beta.md',
          text: 'Alpha',
          target: './alpha.md',
          link_type: 'markdown',
          target_path: 'docs/alpha.md',
          is_external: false,
          context: 'Back to Alpha',
          line: 5,
          column: 3,
        },
      ],
      assets: [],
    },
  ],
}

describe('workspace index queries', () => {
  it('filters, sorts, and paginates compact page summaries', () => {
    const result = queryWorkspacePages(index, 7, {
      folder: 'docs',
      issues_only: false,
      query: '',
      sort: 'headings',
      offset: 0,
      limit: 1,
    })

    expect(result).toMatchObject({ ready: true, revision: 7, total: 2, offset: 0, limit: 1 })
    expect(result.items).toEqual([
      {
        path: 'docs/beta.md',
        title: 'Beta',
        folder: 'docs',
        heading_count: 2,
        link_count: 1,
        asset_count: 0,
        issue_count: 0,
      },
    ])
    expect(result).not.toHaveProperty('files')
  })

  it('bounds global candidates and current-document navigation', () => {
    const result = queryWorkspaceNavigation(index, 8, {
      active_path: 'docs/alpha.md',
      query: 'beta',
      scope: 'all',
      limit: 1,
    })

    expect(result).toMatchObject({ ready: true, revision: 8, active_path: 'docs/alpha.md' })
    expect(result.files).toEqual([{ path: 'docs/beta.md', title: 'Beta' }])
    expect(result.headings).toEqual([
      { path: 'docs/beta.md', slug: 'beta', text: 'Beta', level: 1 },
    ])
    expect(result.current.outgoing_links).toHaveLength(1)
    expect(result.current.backlinks).toHaveLength(1)
    expect(result.current.missing_links).toHaveLength(1)
    expect(result.current.headings).toHaveLength(1)
  })

  it('keeps fuzzy navigation matches for non-contiguous command input', () => {
    const result = queryWorkspaceNavigation(index, 8, {
      query: 'bta',
      scope: 'all',
      limit: 5,
    })

    expect(result.files).toContainEqual({ path: 'docs/beta.md', title: 'Beta' })
    expect(result.headings).toContainEqual({
      path: 'docs/beta.md',
      slug: 'beta',
      text: 'Beta',
      level: 1,
    })
  })

  it('returns only requested document details and bounded asset issues', () => {
    const result = queryWorkspaceDocumentInsights(index, 'docs/alpha.md', 9, 1)

    expect(result).toMatchObject({
      ready: true,
      revision: 9,
      path: 'docs/alpha.md',
      found: true,
      asset_report: {
        current_asset_count: 2,
        current_missing_count: 1,
        workspace_missing_count: 1,
        limit: 1,
      },
      knowledge: { incoming_count: 1, outgoing_count: 1, missing_count: 1, orphan: false },
    })
    expect(result.backlinks).toEqual([
      expect.objectContaining({ source_path: 'docs/beta.md', line: 5, column: 3 }),
    ])
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('missing.md'),
        }),
      ]),
    )
    expect(result.asset_report.current_assets).toHaveLength(1)
    expect(result.asset_report.workspace_missing_assets).toHaveLength(1)
  })

  it('returns an explicit empty state when the requested document is absent', () => {
    const result = queryWorkspaceDocumentInsights(index, 'docs/unknown.md', 11)

    expect(result).toMatchObject({
      ready: true,
      revision: 11,
      path: 'docs/unknown.md',
      found: false,
      headings: [],
      backlinks: [],
      diagnostics: [],
    })
  })

  it('returns the workspace knowledge summary without document payloads', () => {
    expect(queryWorkspaceKnowledgeSummary(index, 12)).toEqual({
      ready: true,
      revision: 12,
      file_count: 2,
      heading_count: 3,
      internal_link_count: 2,
      linked_file_count: 2,
      missing_link_count: 1,
      orphan_file_count: 0,
      collection_counts: {
        all: 2,
        'needs-attention': 1,
        linked: 2,
        structured: 0,
      },
    })
  })
})
