import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TerminalSessionPane from '@/components/terminal/TerminalSessionPane'
import { TERMINAL_FONT_FAMILY } from '@/components/terminal/terminalTheme'
import {
  clearTerminalSessionEvents,
  subscribeTerminalSessionEvents,
} from '@/components/terminal/terminalEvents'
import { terminalApi } from '@/services/terminalApi'

const terminalConstructor = vi.hoisted(() => vi.fn())
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
    constructor(options: unknown) {
      terminalConstructor(options)
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
  clearTerminalSessionEvents: vi.fn(),
  primeTerminalEventListeners: vi.fn(),
  subscribeTerminalSessionEvents: vi.fn(() => vi.fn()),
}))

const props = {
  active: true,
  exitedLabel: 'Exited',
  focusRequest: 0,
  onStateChange: vi.fn(),
  restartKey: 0,
  shellPath: null,
  statusLabel: 'Connecting',
  tabKey: 'terminal-tab-1',
  theme: 'paper' as const,
  visible: true,
}

describe('TerminalSessionPane shell selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(subscribeTerminalSessionEvents).mockImplementation(() => vi.fn())
  })
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
    expect(terminalConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ fontFamily: TERMINAL_FONT_FAMILY }),
    )
  })

  it('preserves the running terminal across locale changes and uses the latest exit label', async () => {
    const { rerender, unmount } = render(<TerminalSessionPane {...props} />)
    await waitFor(() => expect(subscribeTerminalSessionEvents).toHaveBeenCalledOnce())
    rerender(<TerminalSessionPane {...props} exitedLabel="已退出" statusLabel="已连接" />)
    expect(terminalApi.create).toHaveBeenCalledOnce()
    expect(terminalApi.close).not.toHaveBeenCalled()
    expect(terminalInstance.dispose).not.toHaveBeenCalled()

    const handlers = vi.mocked(subscribeTerminalSessionEvents).mock.calls[0][1]
    act(() => handlers.onExit({ id: 'session-1', exit_code: 0, signal: null }))
    expect(terminalInstance.writeln).toHaveBeenLastCalledWith('已退出')
    expect(props.onStateChange).toHaveBeenLastCalledWith(
      'terminal-tab-1',
      expect.objectContaining({ status: 'exited' }),
    )
    unmount()
    expect(terminalApi.close).not.toHaveBeenCalled()
    expect(clearTerminalSessionEvents).toHaveBeenCalledWith('session-1')
  })

  it('keeps an early exit status after synchronous buffered event replay', async () => {
    vi.mocked(subscribeTerminalSessionEvents).mockImplementation((_id, handlers) => {
      handlers.onOutput({ id: 'session-1', data: 'last output' })
      handlers.onExit({ id: 'session-1', exit_code: 1, signal: null })
      return vi.fn()
    })
    const { unmount } = render(<TerminalSessionPane {...props} />)
    await waitFor(() =>
      expect(props.onStateChange).toHaveBeenLastCalledWith(
        'terminal-tab-1',
        expect.objectContaining({ status: 'exited' }),
      ),
    )
    expect(terminalInstance.write).toHaveBeenCalledWith('last output')
    expect(terminalInstance.writeln).toHaveBeenLastCalledWith('Exited')
    unmount()
    expect(terminalApi.close).not.toHaveBeenCalled()
  })

  it('cleans up the old session before restart and closes the replacement on unmount', async () => {
    const { rerender, unmount } = render(<TerminalSessionPane {...props} />)
    await waitFor(() => expect(subscribeTerminalSessionEvents).toHaveBeenCalledOnce())
    const unsubscribe = vi.mocked(subscribeTerminalSessionEvents).mock.results[0].value
    rerender(<TerminalSessionPane {...props} restartKey={1} />)
    await waitFor(() => expect(terminalApi.create).toHaveBeenCalledTimes(2))
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(clearTerminalSessionEvents).toHaveBeenCalledWith('session-1')
    expect(terminalApi.close).toHaveBeenCalledOnce()
    unmount()
    expect(terminalApi.close).toHaveBeenCalledTimes(2)
  })

  it('cleans up a session whose creation finishes after the pane closes', async () => {
    const { unmount } = render(<TerminalSessionPane {...props} />)
    unmount()
    await waitFor(() => expect(terminalApi.close).toHaveBeenCalledWith('session-1'))
    expect(clearTerminalSessionEvents).toHaveBeenCalledWith('session-1')
    expect(subscribeTerminalSessionEvents).not.toHaveBeenCalled()
  })
})
