import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TerminalPanel from '@/components/TerminalPanel'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const paneProps = vi.hoisted(() => new Map<string, Record<string, unknown>>())

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/components/terminal/TerminalSessionPane', () => ({
  default: (props: Record<string, unknown>) => {
    paneProps.set(String(props.tabKey), props)
    return <div data-testid="terminal-session-pane" />
  },
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
  beforeEach(() => {
    paneProps.clear()
    usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
  })

  it('uses the shared spinner for connecting terminal tabs', () => {
    render(<TerminalPanel visible theme="paper" onClose={vi.fn()} />)

    const tab = screen.getByRole('tab', { name: /Terminal 1/ })
    const spinner = tab.querySelector('svg[role="presentation"]')

    expect(spinner).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
  })

  it('closes from the panel button and from Escape', () => {
    const onClose = vi.fn()
    render(<TerminalPanel visible theme="paper" onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close terminal' }))
    fireEvent.keyDown(screen.getByRole('tablist', { name: 'Terminal' }), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('snapshots the selected shell for new tabs and only applies changes on restart', () => {
    usePreferencesStore.setState({ terminalShellPath: 'C:\\shell-a.exe' })
    render(<TerminalPanel visible theme="paper" onClose={vi.fn()} />)

    expect(paneProps.get('terminal-tab-1')?.shellPath).toBe('C:\\shell-a.exe')

    act(() => usePreferencesStore.getState().setTerminalShellPath('D:\\shell-b.exe'))
    expect(paneProps.get('terminal-tab-1')).toMatchObject({
      restartKey: 0,
      shellPath: 'C:\\shell-a.exe',
    })

    fireEvent.click(screen.getByRole('button', { name: 'New terminal' }))
    expect(paneProps.get('terminal-tab-2')?.shellPath).toBe('D:\\shell-b.exe')

    act(() => usePreferencesStore.getState().setTerminalShellPath('E:\\shell-c.exe'))
    fireEvent.click(screen.getByRole('button', { name: 'Restart terminal' }))
    expect(paneProps.get('terminal-tab-2')).toMatchObject({
      restartKey: 1,
      shellPath: 'E:\\shell-c.exe',
    })
  })
})
