import { describe, expect, it, vi } from 'vitest'
import { registerGitTerminalIpc } from '@electron/ipc/gitTerminalCommands'

describe('terminal command IPC', () => {
  it('forwards the optional shell path to the terminal service', async () => {
    const terminalService = {
      create: vi.fn(() => ({
        cwd: 'D:/notes',
        id: 'terminal-1',
        shell: 'C:/Program Files/PowerShell/7/pwsh.exe',
      })),
      dispose: vi.fn(),
    }
    const bridge = registerGitTerminalIpc(
      { handle: vi.fn() } as never,
      { once: vi.fn() } as never,
      {
        gitService: {} as never,
        logger: { info: vi.fn() } as never,
        terminalService: terminalService as never,
      },
    )
    const sender = { id: 9 }

    await bridge.commandHandlers.terminal_create(
      {
        cols: 100,
        cwd: 'D:/notes',
        rows: 30,
        shellPath: 'C:/Program Files/PowerShell/7/pwsh.exe',
      },
      { sender } as never,
    )

    expect(terminalService.create).toHaveBeenCalledWith(
      sender,
      30,
      100,
      'D:/notes',
      'C:/Program Files/PowerShell/7/pwsh.exe',
    )
  })

  it('rejects invalid terminal dimensions before calling the service', () => {
    const { bridge, terminalService } = createBridge()

    expect(() =>
      bridge.commandHandlers.terminal_create({ cols: 80, rows: '24' }, {
        sender: { id: 10 },
      } as never),
    ).toThrow()
    expect(terminalService.create).not.toHaveBeenCalled()
  })

  it('rejects unknown terminal creation fields', () => {
    const { bridge, terminalService } = createBridge()

    expect(() =>
      bridge.commandHandlers.terminal_create({ cols: 80, rows: 24, unexpected: true }, {
        sender: { id: 11 },
      } as never),
    ).toThrow()
    expect(terminalService.create).not.toHaveBeenCalled()
  })
})

const createBridge = () => {
  const terminalService = {
    create: vi.fn(),
    dispose: vi.fn(),
  }
  const bridge = registerGitTerminalIpc({ handle: vi.fn() } as never, { once: vi.fn() } as never, {
    gitService: {} as never,
    logger: { info: vi.fn() } as never,
    terminalService: terminalService as never,
  })
  return { bridge, terminalService }
}
