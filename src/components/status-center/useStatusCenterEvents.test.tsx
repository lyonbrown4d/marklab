import { act, render, screen } from '@testing-library/react'
import type { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStatusCenterEvents } from '@/components/status-center/useStatusCenterEvents'
import type { TerminalExitEvent, TerminalOutputEvent } from '@/services/terminalApi'
import { terminalExitEvents$, terminalOutputEvents$ } from '@/services/terminalEventStreams'

const runtimeMocks = vi.hoisted(() => ({
  listen: vi.fn(async () => vi.fn()),
}))

vi.mock('@/runtime/events', () => ({
  listen: runtimeMocks.listen,
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        'statusCenter.terminalExited': 'Terminal exited',
        'statusCenter.terminalExitedCode': `Terminal exited with code ${options?.code ?? ''}`,
        'statusCenter.terminalExitedSignal': `Terminal exited by ${options?.signal ?? ''}`,
        'statusCenter.terminalOutput': `Terminal output: ${options?.text ?? ''}`,
        'statusCenter.terminalOutputReceived': 'Terminal output received',
      }

      return labels[key] ?? key
    },
  }),
}))

vi.mock('@/services/terminalEventStreams', async () => {
  const { Subject } = await vi.importActual<typeof import('rxjs')>('rxjs')

  return {
    terminalExitEvents$: new Subject<TerminalExitEvent>(),
    terminalOutputEvents$: new Subject<TerminalOutputEvent>(),
  }
})

const terminalOutputSubject = terminalOutputEvents$ as Subject<TerminalOutputEvent>
const terminalExitSubject = terminalExitEvents$ as Subject<TerminalExitEvent>

const Harness = ({ desktopRuntime }: { desktopRuntime: boolean }) => {
  const { terminalEvents } = useStatusCenterEvents(desktopRuntime)

  return (
    <div data-testid="terminal-events">
      {terminalEvents.map((event) => (
        <div key={`${event.id}:${event.status}`}>{event.message}</div>
      ))}
    </div>
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
  runtimeMocks.listen.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useStatusCenterEvents terminal streams', () => {
  it('does not subscribe to terminal streams outside desktop runtime', () => {
    render(<Harness desktopRuntime={false} />)

    expect(terminalOutputSubject.observed).toBe(false)
    expect(terminalExitSubject.observed).toBe(false)
    expect(runtimeMocks.listen).not.toHaveBeenCalled()
  })

  it('throttles output updates, pushes exit updates, and unsubscribes on unmount', () => {
    const { unmount } = render(<Harness desktopRuntime={true} />)

    expect(terminalOutputSubject.observed).toBe(true)
    expect(terminalExitSubject.observed).toBe(true)

    act(() => {
      terminalOutputSubject.next({ id: 'terminal-1', data: 'first chunk' })
    })

    expect(screen.getByTestId('terminal-events')).toHaveTextContent('Terminal output: first chunk')

    act(() => {
      vi.advanceTimersByTime(500)
      terminalOutputSubject.next({ id: 'terminal-1', data: 'second chunk' })
    })

    expect(screen.getByTestId('terminal-events')).not.toHaveTextContent('second chunk')

    act(() => {
      vi.advanceTimersByTime(500)
      terminalOutputSubject.next({ id: 'terminal-1', data: 'third chunk' })
    })

    expect(screen.getByTestId('terminal-events')).toHaveTextContent('Terminal output: third chunk')

    act(() => {
      terminalExitSubject.next({ id: 'terminal-1', exit_code: 0 })
    })

    expect(screen.getByTestId('terminal-events')).toHaveTextContent('Terminal exited with code 0')

    unmount()

    expect(terminalOutputSubject.observed).toBe(false)
    expect(terminalExitSubject.observed).toBe(false)
  })
})
