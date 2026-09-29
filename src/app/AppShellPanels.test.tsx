import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppShellPanels } from '@/app/AppShellPanels'

vi.mock('react-resizable-panels', () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: () => <div />,
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'actions.openTerminal' ? 'Open terminal' : key),
  }),
}))

describe('AppShellPanels', () => {
  it('offers an explicit bottom trigger while the terminal is closed', () => {
    const onOpenTerminalArea = vi.fn()
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
        onOpenTerminalArea={onOpenTerminalArea}
        terminalShortcutLabel="Ctrl J"
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Open terminal' })
    expect(trigger).toHaveTextContent('Ctrl J')
    trigger.click()
    expect(onOpenTerminalArea).toHaveBeenCalledTimes(1)
  })

  it('hides the bottom trigger while the terminal is open', () => {
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
        onOpenTerminalArea={vi.fn()}
        terminalShortcutLabel="Ctrl J"
      />,
    )

    expect(screen.queryByRole('button', { name: 'Open terminal' })).not.toBeInTheDocument()
  })
})
