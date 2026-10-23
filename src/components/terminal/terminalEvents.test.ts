import type { Subject } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import type { TerminalExitEvent, TerminalOutputEvent } from '@/services/terminalApi'
import { terminalExitEvents$, terminalOutputEvents$ } from '@/services/terminalEventStreams'
import {
  clearTerminalSessionEvents,
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
    terminalExitSubject.next({ id: 'session-buffered', exit_code: 0, signal: null })

    expect(onOutput).toHaveBeenCalledTimes(2)
    expect(onOutput).toHaveBeenLastCalledWith({ id: 'session-buffered', data: 'after subscribe' })
    expect(onExit).toHaveBeenCalledWith({ id: 'session-buffered', exit_code: 0, signal: null })

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

  it('replays early output and exit in order, once, after create acknowledgement', () => {
    primeTerminalEventListeners()
    terminalOutputSubject.next({ id: 'session-exited', data: 'pending' })
    terminalExitSubject.next({ id: 'session-exited', exit_code: 1, signal: null })
    terminalOutputSubject.next({ id: 'session-exited', data: 'late output' })
    const received: string[] = []
    const handlers = {
      onExit: () => received.push('exit'),
      onOutput: (event: TerminalOutputEvent) => received.push(event.data),
    }
    const unsubscribe = subscribeTerminalSessionEvents('session-exited', handlers)
    expect(received).toEqual(['pending', 'exit'])
    unsubscribe()
    const unsubscribeAgain = subscribeTerminalSessionEvents('session-exited', handlers)
    expect(received).toEqual(['pending', 'exit'])
    unsubscribeAgain()
  })

  it('bounds early output while preserving its exit', () => {
    primeTerminalEventListeners()
    for (let index = 0; index < 140; index += 1) {
      terminalOutputSubject.next({ id: 'session-bounded', data: String(index) })
    }
    terminalExitSubject.next({ id: 'session-bounded', exit_code: 0, signal: null })
    const onOutput = vi.fn()
    const onExit = vi.fn()
    const unsubscribe = subscribeTerminalSessionEvents('session-bounded', { onOutput, onExit })
    expect(onOutput).toHaveBeenCalledTimes(127)
    expect(onOutput).toHaveBeenLastCalledWith({ id: 'session-bounded', data: '139' })
    expect(onExit).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('clears closed sessions and ignores their late events', () => {
    primeTerminalEventListeners()
    terminalOutputSubject.next({ id: 'session-closed', data: 'pending' })
    clearTerminalSessionEvents('session-closed')
    terminalExitSubject.next({ id: 'session-closed', exit_code: 0, signal: null })
    const onOutput = vi.fn()
    const onExit = vi.fn()
    const unsubscribe = subscribeTerminalSessionEvents('session-closed', { onOutput, onExit })
    terminalOutputSubject.next({ id: 'session-closed', data: 'late subscribed output' })
    terminalExitSubject.next({ id: 'session-closed', exit_code: 0, signal: null })
    expect(onOutput).not.toHaveBeenCalled()
    expect(onExit).not.toHaveBeenCalled()
    unsubscribe()
  })
})
