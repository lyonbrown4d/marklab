import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@/runtime/ipc'
import { terminalApi, terminalExitEventSchema } from '@/services/terminalApi'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))

describe('terminalApi', () => {
  beforeEach(() => vi.mocked(invoke).mockReset())

  it('sends a configured shell path when creating a terminal', async () => {
    vi.mocked(invoke).mockResolvedValue({
      cwd: 'D:/notes',
      id: 'terminal-1',
      shell: 'C:/Program Files/PowerShell/7/pwsh.exe',
    })

    await expect(
      terminalApi.create(30, 100, 'C:/Program Files/PowerShell/7/pwsh.exe'),
    ).resolves.toMatchObject({ id: 'terminal-1' })

    expect(invoke).toHaveBeenCalledWith('terminal_create', {
      cols: 100,
      rows: 30,
      shellPath: 'C:/Program Files/PowerShell/7/pwsh.exe',
    })
  })

  it('preserves null to request the platform default shell', async () => {
    vi.mocked(invoke).mockResolvedValue({ cwd: '/home/user', id: 'terminal-2', shell: '/bin/bash' })

    await terminalApi.create(24, 80, null)

    expect(invoke).toHaveBeenCalledWith('terminal_create', {
      cols: 80,
      rows: 24,
      shellPath: null,
    })
  })

  it('normalizes legacy exit fields to the Rust event shape', () => {
    expect(terminalExitEventSchema.parse({ id: 'terminal-1', exit_code: 0 })).toEqual({
      id: 'terminal-1',
      exit_code: 0,
      signal: null,
    })
    expect(terminalExitEventSchema.parse({ id: 'terminal-2' })).toEqual({
      id: 'terminal-2',
      exit_code: null,
      signal: null,
    })
    expect(
      terminalExitEventSchema.safeParse({ id: 'terminal-3', exit_code: 'invalid' }).success,
    ).toBe(false)
  })
})
