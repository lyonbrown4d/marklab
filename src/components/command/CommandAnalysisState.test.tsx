import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CommandAnalysisState from '@/components/command/CommandAnalysisState'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('CommandAnalysisState', () => {
  it('shows a loading status while workspace suggestions are pending', () => {
    render(<CommandAnalysisState error={false} loading onRetry={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent('command.analysis.loading')
  })

  it('shows failures and retries workspace suggestions', () => {
    const retry = vi.fn(async () => undefined)
    render(<CommandAnalysisState error loading={false} onRetry={retry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('command.analysis.error')
    fireEvent.click(screen.getByRole('button', { name: 'actions.retry' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
