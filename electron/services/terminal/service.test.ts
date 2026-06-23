import type * as Electron from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalService } from '@electron/services/terminal/service.js'

type DataHandler = (data: string) => void
type ExitHandler = (event: { exitCode?: number | null; signal?: string | number | null }) => void

const createService = () => {
  let dataHandler: DataHandler = () => undefined
  let exitHandler: ExitHandler = () => undefined
  const terminal = {
    kill: vi.fn(),
    onData: vi.fn((handler: DataHandler) => {
      dataHandler = handler
      return { dispose: vi.fn() }
    }),
    onExit: vi.fn((handler: ExitHandler) => {
      exitHandler = handler
      return { dispose: vi.fn() }
    }),
    resize: vi.fn(),
    write: vi.fn(),
  }
  const ptyModule = {
    spawn: vi.fn(() => terminal),
  }
  const service = new TerminalService(process.cwd())
  ;(service as unknown as { ptyModule: unknown }).ptyModule = ptyModule
  const send = vi.fn()
  const webContents = {
    isDestroyed: vi.fn(() => false),
    send,
  } as unknown as Electron.WebContents

  return {
    emitData: (data: string) => dataHandler(data),
    emitExit: (event: Parameters<ExitHandler>[0]) => exitHandler(event),
    ptyModule,
    send,
    service,
    terminal,
    webContents,
  }
}

describe('TerminalService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('buffers rapid PTY output into a single IPC event', () => {
    vi.useFakeTimers()
    const { emitData, send, service, webContents } = createService()
    const session = service.create(webContents, 24, 80)

    emitData('a')
    emitData('b')
    emitData('c')

    expect(send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20)

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('terminal-output', {
      id: session.id,
      data: 'abc',
    })
  })

  it('flushes pending output and stops the buffer subscription on close', () => {
    vi.useFakeTimers()
    const { emitData, send, service, terminal, webContents } = createService()
    const session = service.create(webContents, 24, 80)

    emitData('pending')
    service.close(session.id)

    expect(send).toHaveBeenCalledWith('terminal-output', {
      id: session.id,
      data: 'pending',
    })
    expect(terminal.kill).toHaveBeenCalledTimes(1)

    send.mockClear()
    emitData('late')
    vi.advanceTimersByTime(20)

    expect(send).not.toHaveBeenCalled()
  })

  it('flushes pending output before emitting terminal exit', () => {
    vi.useFakeTimers()
    const { emitData, emitExit, send, service, webContents } = createService()
    const session = service.create(webContents, 24, 80)

    emitData('before-exit')
    emitExit({ exitCode: 0, signal: null })

    expect(send).toHaveBeenNthCalledWith(1, 'terminal-output', {
      id: session.id,
      data: 'before-exit',
    })
    expect(send).toHaveBeenNthCalledWith(2, 'terminal-exit', {
      id: session.id,
      exit_code: 0,
      signal: null,
    })
  })
})
