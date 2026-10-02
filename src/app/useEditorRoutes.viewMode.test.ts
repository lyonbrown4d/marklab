import { describe, expect, it } from 'vitest'
import { resolveEditorViewMode } from '@/app/useEditorRoutes'
import type { ViewMode, WorkspaceTab } from '@/store/appTypes'

type ResolveOverrides = {
  activeTab?: WorkspaceTab | null
  currentFilePath?: string | null
  graphFileRouteActive?: boolean
  previewRouteActive?: boolean
  sourceRouteActive?: boolean
  tabViewModes?: Record<string, ViewMode>
}

const resolveMode = (overrides: ResolveOverrides = {}) =>
  resolveEditorViewMode({
    activeTab: null,
    currentFilePath: 'notes/active.md',
    graphFileRouteActive: false,
    previewRouteActive: false,
    sourceRouteActive: false,
    tabViewModes: {},
    ...overrides,
  })

describe('resolveEditorViewMode', () => {
  it('prioritizes source, graph-file, and preview routes in that order', () => {
    expect(
      resolveMode({
        sourceRouteActive: true,
        graphFileRouteActive: true,
        previewRouteActive: true,
      }),
    ).toBe('source')
    expect(resolveMode({ graphFileRouteActive: true, previewRouteActive: true })).toBe('graph')
    expect(resolveMode({ previewRouteActive: true })).toBe('preview')
  })

  it.each(['source', 'graph', 'preview'] as const)(
    'uses the active file tab %s view before a cached tab mode',
    (view) => {
      expect(
        resolveMode({
          activeTab: { kind: 'file', path: 'notes/active.md', view },
          tabViewModes: { 'notes/active.md': 'wysiwyg' },
        }),
      ).toBe(view)
    },
  )

  it('uses the cached tab mode for an editable current file', () => {
    expect(
      resolveMode({
        activeTab: { kind: 'file', path: 'notes/active.md', view: 'edit' },
        tabViewModes: { 'notes/active.md': 'source' },
      }),
    ).toBe('source')
  })

  it('uses WYSIWYG when there is no current file', () => {
    expect(
      resolveMode({
        activeTab: { kind: 'file', path: 'notes/active.md', view: 'graph' },
        currentFilePath: null,
        tabViewModes: { 'notes/active.md': 'source' },
      }),
    ).toBe('wysiwyg')
  })
})
