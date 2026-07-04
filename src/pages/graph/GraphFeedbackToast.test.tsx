import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GraphFeedbackToast } from '@/pages/graph/GraphFeedbackToast'

describe('GraphFeedbackToast', () => {
  it('announces shortcut feedback as a polite status message', () => {
    render(<GraphFeedbackToast message="Graph fitted" />)

    const status = screen.getByRole('status')

    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Graph fitted')
  })
})
