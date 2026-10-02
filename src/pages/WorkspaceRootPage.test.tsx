import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceRootPage from '@/pages/WorkspaceRootPage'
import type { LayoutContext } from '@/app/AppLayoutContext'

let layoutState: Pick<LayoutContext, 'activeTab' | 'files' | 'onOpenFile'>

vi.mock('@/pages/useLayoutContext', () => ({
  useLayoutContext: (selector: (state: LayoutContext) => unknown) =>
    selector(layoutState as LayoutContext),
}))

vi.mock('@/pages/EditorEmptyState', () => ({
  default: ({ files }: { files: Array<{ path: string }> }) => (
    <div>Empty editor ({files.length})</div>
  ),
}))

const RouteResult = () => {
  const location = useLocation()
  return <div>{location.pathname}</div>
}

const renderRoot = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<WorkspaceRootPage />} />
        <Route path="*" element={<RouteResult />} />
      </Routes>
    </MemoryRouter>,
  )

describe('WorkspaceRootPage', () => {
  beforeEach(() => {
    layoutState = {
      activeTab: null,
      files: [],
      onOpenFile: vi.fn(),
    }
  })

  it('restores the active file route with its current editor view', () => {
    layoutState.files = [{ kind: 'file', path: 'notes/current.md' }]
    layoutState.activeTab = { kind: 'file', path: 'notes/current.md', view: 'source' }

    renderRoot()

    expect(screen.getByText('/files/source/notes/current.md')).toBeInTheDocument()
  })

  it('uses a supported preview route for the first non-Markdown file', () => {
    layoutState.files = [{ kind: 'file', path: 'assets/cover.png' }]

    renderRoot()

    expect(screen.getByText('/files/preview/assets/cover.png')).toBeInTheDocument()
  })

  it('shows the true editor empty state when the workspace has no files', () => {
    renderRoot()

    expect(screen.getByText('Empty editor (0)')).toBeInTheDocument()
  })
})
