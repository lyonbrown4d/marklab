import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceNavigate } from '@/features/workbench/WorkspaceNavigate'
import { WorkspacePaneContext, type WorkspacePane } from '@/features/workbench/paneContext'

const Location = () => <output aria-label="route">{useLocation().pathname}</output>
const pane = (active: boolean): WorkspacePane => ({
  id: 'document',
  active,
  visible: true,
  recoveryKey: 0,
  registerFlush: () => () => {},
  openFile: vi.fn(),
  openBeside: vi.fn(),
})

describe('workspace pane redirects', () => {
  it('keeps passive document redirects from stealing the focused graph route', async () => {
    const view = (active: boolean) => (
      <MemoryRouter initialEntries={['/workspace/graph']}>
        <WorkspacePaneContext.Provider value={pane(active)}>
          <WorkspaceNavigate to="/files/edit/Alpha.md" replace />
        </WorkspacePaneContext.Provider>
        <Location />
      </MemoryRouter>
    )
    const { rerender } = render(view(false))
    expect(screen.getByLabelText('route')).toHaveTextContent('/workspace/graph')
    rerender(view(true))
    await waitFor(() =>
      expect(screen.getByLabelText('route')).toHaveTextContent('/files/edit/Alpha.md'),
    )
  })
})
