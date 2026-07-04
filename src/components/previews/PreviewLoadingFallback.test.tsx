import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'

describe('PreviewLoadingFallback', () => {
  it('announces lazy preview loading while keeping the spinner decorative', () => {
    render(<PreviewLoadingFallback label="Loading preview..." />)

    const status = screen.getByRole('status', { name: 'Loading preview...' })

    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Loading preview...')
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
    expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
