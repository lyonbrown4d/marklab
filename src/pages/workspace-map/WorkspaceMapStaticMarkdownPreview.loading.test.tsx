import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceMapStaticMarkdownPreview } from '@/pages/workspace-map/WorkspaceMapStaticMarkdownPreview'

const loadMath = vi.hoisted(() => vi.fn())
vi.mock('@platejs/math', () => {
  loadMath()
  throw new Error('Formula module unavailable')
})

beforeEach(() => loadMath.mockClear())

describe('workspace map formula module loading', () => {
  it('keeps ordinary document previews independent of Plate loading', async () => {
    render(
      <WorkspaceMapStaticMarkdownPreview
        markdown="Plain"
        preview={{ html: '<p>Plain</p>', math: [] }}
      />,
    )
    await vi.dynamicImportSettled()
    expect(screen.getByText('Plain')).toBeInTheDocument()
    expect(loadMath).not.toHaveBeenCalled()
  })

  it('preserves accessible formula text when its optional module fails to load', async () => {
    render(
      <WorkspaceMapStaticMarkdownPreview
        markdown="$x^2$"
        preview={{
          html: '<p><span data-graph-math-id="graph-math-0">x^2</span></p>',
          math: [{ id: 'graph-math-0', expression: 'x^2', displayMode: false }],
        }}
      />,
    )
    await vi.dynamicImportSettled()
    expect(screen.getByText('x^2')).toBeInTheDocument()
    expect(screen.queryByRole('math')).not.toBeInTheDocument()
  })
})
