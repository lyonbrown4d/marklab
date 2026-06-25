import type { Subject } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import type { TerminalExitEvent, TerminalOutputEvent } from '@/services/terminalApi'
import { terminalExitEvents$, terminalOutputEvents$ } from '@/services/terminalEventStreams'
import {
  primeTerminalEventListeners,
  subscribeTerminalSessionEvents,
} from '@/components/terminal/terminalEvents'

const runtimeMocks = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => true),
}))

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: runtimeMocks.isDesktopRuntime,
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

describe('terminalEvents', () => {
  it('buffers output until a terminal session subscriber is attached', () => {
    primeTerminalEventListeners()

    terminalOutputSubject.next({ id: 'session-buffered', data: 'before subscribe' })

    const onOutput = vi.fn()
    const onExit = vi.fn()
    const unsubscribe = subscribeTerminalSessionEvents('session-buffered', { onExit, onOutput })

    expect(onOutput).toHaveBeenCalledTimes(1)
    expect(onOutput).toHaveBeenLastCalledWith({ id: 'session-buffered', data: 'before subscribe' })

    terminalOutputSubject.next({ id: 'session-buffered', data: 'after subscribe' })
    terminalOutputSubject.next({ id: 'other-session', data: 'ignored' })
    terminalExitSubject.next({ id: 'session-buffered', exit_code: 0 })

    expect(onOutput).toHaveBeenCalledTimes(2)
    expect(onOutput).toHaveBeenLastCalledWith({ id: 'session-buffered', data: 'after subscribe' })
    expect(onExit).toHaveBeenCalledWith({ id: 'session-buffered', exit_code: 0 })

    unsubscribe()
  })

  it('buffers output again after the last session subscriber unsubscribes', () => {
    primeTerminalEventListeners()

    const onOutput = vi.fn()
    const unsubscribe = subscribeTerminalSessionEvents('session-resubscribe', {
      onExit: vi.fn(),
      onOutput,
    })
    unsubscribe()

    terminalOutputSubject.next({ id: 'session-resubscribe', data: 'while detached' })

    const onResubscribeOutput = vi.fn()
    const unsubscribeResubscribe = subscribeTerminalSessionEvents('session-resubscribe', {
      onExit: vi.fn(),
      onOutput: onResubscribeOutput,
    })

    expect(onOutput).not.toHaveBeenCalled()
    expect(onResubscribeOutput).toHaveBeenCalledWith({
      id: 'session-resubscribe',
      data: 'while detached',
    })

    unsubscribeResubscribe()
  })

  it('drops pending output when the session exits before subscription', () => {
    primeTerminalEventListeners()

    terminalOutputSubject.next({ id: 'session-exited', data: 'pending' })
    terminalExitSubject.next({ id: 'session-exited', exit_code: 1 })

    const onOutput = vi.fn()
    const unsubscribe = subscribeTerminalSessionEvents('session-exited', {
      onExit: vi.fn(),
      onOutput,
    })

    expect(onOutput).not.toHaveBeenCalled()

    unsubscribe()
  })
})
