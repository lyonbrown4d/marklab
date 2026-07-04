import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TerminalPanel from '@/components/TerminalPanel'

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/components/terminal/TerminalSessionPane', () => ({
  default: () => <div data-testid="terminal-session-pane" />,
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'terminal.close': 'Close terminal',
        'terminal.closeTab': 'Close tab',
        'terminal.connected': 'Connected',
        'terminal.connecting': 'Connecting',
        'terminal.error': 'Error',
        'terminal.exited': 'Exited',
        'terminal.new': 'New terminal',
        'terminal.restart': 'Restart terminal',
        'terminal.tab': `Terminal ${values?.index ?? ''}`,
        'terminal.title': 'Terminal',
        'terminal.unavailable': 'Unavailable',
      }
      return labels[key] ?? key
    },
  }),
}))

describe('TerminalPanel', () => {
  it('uses the shared spinner for connecting terminal tabs', () => {
    render(<TerminalPanel visible theme="paper" onClose={vi.fn()} />)

    const tab = screen.getByRole('tab', { name: /Terminal 1/ })
    const spinner = tab.querySelector('svg[role="presentation"]')

    expect(spinner).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
  })
})
