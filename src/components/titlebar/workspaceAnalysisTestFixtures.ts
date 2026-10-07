import type {
  WorkspaceKnowledgeSummaryResult,
  WorkspaceNavigationResult,
} from '@/services/workspaceAnalysisApi'

export const workspaceKnowledgeSummaryFixture: WorkspaceKnowledgeSummaryResult = {
  ready: true,
  revision: 1,
  file_count: 3,
  heading_count: 2,
  internal_link_count: 2,
  linked_file_count: 3,
  missing_link_count: 1,
  orphan_file_count: 0,
  collection_counts: { all: 3, 'needs-attention': 1, linked: 3, structured: 1 },
}

export const basicWorkspaceNavigationFixture: WorkspaceNavigationResult = {
  ready: true,
  revision: 1,
  active_path: 'notes/target.md',
  files: [],
  headings: [{ path: 'notes/target.md', level: 2, text: 'Indexed Detail', slug: 'indexed-detail' }],
  file_total: 1,
  heading_total: 1,
  current: {
    headings: [],
    outgoing_links: [],
    backlinks: [],
    missing_links: [],
    heading_total: 0,
    outgoing_link_total: 0,
    backlink_total: 0,
    missing_link_total: 0,
  },
  limit: 24,
}

export const linkedWorkspaceNavigationFixture: WorkspaceNavigationResult = {
  ...basicWorkspaceNavigationFixture,
  file_total: 3,
  heading_total: 0,
  headings: [],
  current: {
    headings: [{ path: 'notes/target.md', level: 2, text: 'Current Topic', slug: 'current-topic' }],
    outgoing_links: [
      {
        source_path: 'notes/target.md',
        text: 'Resolved Topic',
        target: 'resolved.md#done',
        link_type: 'markdown',
        target_path: 'notes/resolved.md',
        target_anchor: 'done',
        target_heading_slug: 'done',
        context: 'Read [Resolved Topic](resolved.md#done)',
        line: 6,
        column: 3,
      },
    ],
    backlinks: [
      {
        source_path: 'notes/source.md',
        text: 'Target',
        context: 'Backlink context points to Target',
        line: 3,
        column: 7,
        target_anchor: null,
        target_heading_slug: null,
      },
    ],
    missing_links: [
      {
        path: 'notes/target.md',
        text: 'Missing Note',
        target: 'missing.md',
        link_type: 'markdown',
        context: 'See [Missing Note](missing.md)',
        line: 8,
        column: 5,
      },
    ],
    heading_total: 1,
    outgoing_link_total: 1,
    backlink_total: 1,
    missing_link_total: 1,
  },
}
