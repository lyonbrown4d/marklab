import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import TerminalSessionPane from '@/components/terminal/TerminalSessionPane'

vi.mock('@xterm/xterm', () => ({
  Terminal: class Terminal {},
}))

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => false,
}))

describe('TerminalSessionPane', () => {
  it('removes inactive panes from keyboard focus while preserving hidden interaction state', () => {
    const props = {
      active: false,
      exitedLabel: 'Exited',
      focusRequest: 0,
      onStateChange: vi.fn(),
      restartKey: 0,
      statusLabel: 'Unavailable',
      tabKey: 'terminal-tab-1',
      theme: 'paper' as const,
      visible: true,
    }
    const { container, rerender } = render(<TerminalSessionPane {...props} />)
    const pane = container.firstElementChild

    expect(pane).toHaveAttribute('inert')
    expect(pane).toHaveAttribute('aria-hidden', 'true')
    expect(pane).toHaveClass('pointer-events-none')

    rerender(<TerminalSessionPane {...props} active />)

    expect(pane).not.toHaveAttribute('inert')
    expect(pane).toHaveAttribute('aria-hidden', 'false')
    expect(pane).not.toHaveClass('pointer-events-none')
  })
})
