import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TerminalSessionPane from '@/components/terminal/TerminalSessionPane'
import { terminalApi } from '@/services/terminalApi'

const terminalInstance = vi.hoisted(() => ({
  cols: 100,
  rows: 30,
  dispose: vi.fn(),
  focus: vi.fn(),
  loadAddon: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  open: vi.fn(),
  options: {} as Record<string, unknown>,
  refresh: vi.fn(),
  unicode: { activeVersion: '' },
  write: vi.fn(),
  writeln: vi.fn(),
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class Terminal {
    constructor() {
      return terminalInstance
    }
  },
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class FitAddon {
    fit = vi.fn()
  },
}))
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class Unicode11Addon {} }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class WebLinksAddon {} }))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/terminalApi', () => ({
  terminalApi: {
    close: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({ id: 'session-1', shell: 'pwsh.exe', cwd: 'C:\\work' }),
    resize: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('@/components/terminal/terminalEvents', () => ({
  primeTerminalEventListeners: vi.fn(),
  subscribeTerminalSessionEvents: vi.fn(() => vi.fn()),
}))

describe('TerminalSessionPane shell selection', () => {
  it('passes the tab shell snapshot when it creates a session', async () => {
    render(
      <TerminalSessionPane
        active
        exitedLabel="Exited"
        focusRequest={0}
        onStateChange={vi.fn()}
        restartKey={0}
        shellPath={'C:\\Program Files\\PowerShell\\7\\pwsh.exe'}
        statusLabel="Connecting"
        tabKey="terminal-tab-1"
        theme="paper"
        visible
      />,
    )

    await waitFor(() => {
      expect(terminalApi.create).toHaveBeenCalledWith(
        30,
        100,
        'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      )
    })
  })
})
