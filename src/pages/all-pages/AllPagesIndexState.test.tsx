import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AllPagesIndexState } from '@/pages/all-pages/AllPagesIndexState'

const t = (key: string) => key

describe('AllPagesIndexState', () => {
  it('announces loading once with document lines and its description', () => {
    render(<AllPagesIndexState error={null} loading onRetry={vi.fn()} t={t} />)

    const status = screen.getByRole('status', { name: 'allPages.loadingTitle' })
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('allPages.loadingDescription')
    expect(status.querySelector('[data-document-loading]')).toHaveAttribute('aria-hidden', 'true')
    expect(status.querySelectorAll('[data-splash-line]')).toHaveLength(3)
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('replaces loading with an actionable error and clears busy state', () => {
    const onRetry = vi.fn().mockResolvedValue(undefined)
    const view = render(<AllPagesIndexState error={null} loading onRetry={onRetry} t={t} />)
    view.rerender(
      <AllPagesIndexState
        error={new Error('Index unavailable')}
        loading={false}
        onRetry={onRetry}
        t={t}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Index unavailable')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(view.container.querySelector('[aria-busy="true"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'actions.retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('renders no state when the index is ready without an error', () => {
    const { container } = render(
      <AllPagesIndexState error={null} loading={false} onRetry={vi.fn()} t={t} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
