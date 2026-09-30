import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppShellPanels } from '@/app/AppShellPanels'

vi.mock('react-resizable-panels', () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => <div />,
}))

describe('AppShellPanels', () => {
  it('leaves terminal opening to the bottom status bar while closed', () => {
    render(
      <AppShellPanels
        shellPanelLayout={{ defaultLayout: undefined, onLayoutChanged: vi.fn() } as never}
        shellGroupElementRef={{ current: null }}
        terminalPanelRef={{ current: null } as never}
        workspacePanels={<main>Workspace</main>}
        terminalOpen={false}
        terminalInitialized={false}
        terminalFocusRequest={0}
        theme="paper"
        onCloseTerminalArea={vi.fn()}
      />,
    )

    expect(screen.getByText('Workspace')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /terminal/i })).not.toBeInTheDocument()
  })

  it('keeps the terminal panel available when it is open', () => {
    render(
      <AppShellPanels
        shellPanelLayout={{ defaultLayout: undefined, onLayoutChanged: vi.fn() } as never}
        shellGroupElementRef={{ current: null }}
        terminalPanelRef={{ current: null } as never}
        workspacePanels={<main>Workspace</main>}
        terminalOpen
        terminalInitialized={false}
        terminalFocusRequest={0}
        theme="paper"
        onCloseTerminalArea={vi.fn()}
      />,
    )

    expect(screen.getByText('Workspace')).toBeInTheDocument()
  })
})
