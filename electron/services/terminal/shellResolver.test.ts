import { describe, expect, it, vi } from 'vitest'
import {
  resolveTerminalShell,
  type TerminalShellResolverDependencies,
} from '@electron/services/terminal/shellResolver.js'

const createDependencies = (
  overrides: Partial<TerminalShellResolverDependencies> = {},
): TerminalShellResolverDependencies => ({
  access: vi.fn(),
  env: {},
  findExecutable: vi.fn(() => undefined),
  platform: 'linux',
  stat: vi.fn(() => ({ isFile: () => true, mode: 0o755 })),
  ...overrides,
})

describe('resolveTerminalShell', () => {
  it('prefers PowerShell executables on Windows instead of COMSPEC', () => {
    const findExecutable = vi.fn((name: string) => {
      if (name === 'C:\\Program Files\\PowerShell\\7\\pwsh.exe') return name
      return undefined
    })

    expect(
      resolveTerminalShell(undefined, {
        ...createDependencies(),
        env: {
          COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
          PATH: 'relative;;C:\\Program Files\\PowerShell\\7',
        },
        findExecutable,
        platform: 'win32',
      }),
    ).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
    expect(findExecutable).toHaveBeenCalledWith('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
    expect(findExecutable).not.toHaveBeenCalledWith(expect.stringContaining('cmd.exe'))
  })

  it('falls back to Windows PowerShell when pwsh is unavailable', () => {
    const findExecutable = vi.fn((name: string) => {
      return name === 'C:\\Tools\\powershell.exe' ? name : undefined
    })

    expect(
      resolveTerminalShell(null, {
        ...createDependencies(),
        env: { PATH: 'C:\\Tools' },
        findExecutable,
        platform: 'win32',
      }),
    ).toContain('powershell.exe')
  })

  it('ignores Windows cwd and relative PATH candidates', () => {
    const systemShell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    const findExecutable = vi.fn(() => 'C:\\workspace\\pwsh.exe')
    const stat = vi.fn((filePath: string) => {
      if (filePath === systemShell) return { isFile: () => true, mode: 0o644 }
      throw new Error('missing')
    })

    expect(
      resolveTerminalShell(undefined, {
        ...createDependencies(),
        env: {
          PATH: ';relative;C:\\Trusted\\bin',
          SystemRoot: 'C:\\Windows',
        },
        findExecutable,
        platform: 'win32',
        stat,
      }),
    ).toBe(systemShell)
    expect(findExecutable).not.toHaveBeenCalledWith('pwsh.exe')
    expect(findExecutable).not.toHaveBeenCalledWith('relative\\pwsh.exe')
  })

  it('uses the user shell on macOS and Linux when it is executable', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      expect(
        resolveTerminalShell(undefined, {
          ...createDependencies(),
          env: { SHELL: '/opt/homebrew/bin/fish' },
          platform,
        }),
      ).toBe('/opt/homebrew/bin/fish')
    }
  })

  it('falls back to zsh on macOS and bash then sh on Linux', () => {
    const macFind = vi.fn((name: string) => (name === 'zsh' ? '/bin/zsh' : undefined))
    const linuxFind = vi.fn((name: string) => (name === 'sh' ? '/bin/sh' : undefined))

    expect(
      resolveTerminalShell(undefined, {
        ...createDependencies(),
        findExecutable: macFind,
        platform: 'darwin',
      }),
    ).toBe('/bin/zsh')
    expect(
      resolveTerminalShell(undefined, {
        ...createDependencies(),
        findExecutable: linuxFind,
        platform: 'linux',
      }),
    ).toBe('/bin/sh')
    expect(linuxFind.mock.calls.map(([name]) => name)).toEqual(['bash', 'sh'])
  })

  it('checks standard absolute shell locations when PATH lookup is unavailable', () => {
    const stat = vi.fn((filePath: string) => {
      if (filePath === '/bin/zsh' || filePath === '/bin/bash') {
        return { isFile: () => true, mode: 0o755 }
      }
      throw new Error('missing')
    })

    expect(
      resolveTerminalShell(undefined, {
        ...createDependencies(),
        platform: 'darwin',
        stat,
      }),
    ).toBe('/bin/zsh')
    expect(
      resolveTerminalShell(undefined, {
        ...createDependencies(),
        platform: 'linux',
        stat,
      }),
    ).toBe('/bin/bash')
  })

  it('rejects a relative custom shell path', () => {
    expect(() => resolveTerminalShell('bin/bash', createDependencies())).toThrow(
      'must be an absolute executable file path',
    )
  })

  it('rejects a blank custom shell path instead of treating it as the default', () => {
    expect(() => resolveTerminalShell('   ', createDependencies())).toThrow(
      'must be an absolute executable file path',
    )
  })

  it('rejects a missing custom shell path with an actionable error', () => {
    const stat = vi.fn(() => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })

    expect(() => resolveTerminalShell('/missing/shell', { ...createDependencies(), stat })).toThrow(
      'does not exist',
    )
  })

  it('rejects a directory and a non-executable Unix file', () => {
    expect(() =>
      resolveTerminalShell('/usr/local/bin', {
        ...createDependencies(),
        stat: () => ({ isFile: () => false, mode: 0o755 }),
      }),
    ).toThrow('must point to a file')

    expect(() =>
      resolveTerminalShell('/tmp/shell', {
        ...createDependencies(),
        stat: () => ({ isFile: () => true, mode: 0o644 }),
      }),
    ).toThrow('is not executable')
  })

  it('uses current-user X_OK access when validating a Unix shell', () => {
    const access = vi.fn(() => {
      throw new Error('EACCES')
    })

    expect(() =>
      resolveTerminalShell('/opt/team/shell', {
        ...createDependencies(),
        access,
      }),
    ).toThrow('is not executable by the current user')
  })

  it('validates Windows custom shell extensions using PATHEXT case-insensitively', () => {
    const dependencies = createDependencies({
      env: { PATHEXT: '.COM;.EXE;.BAT;.CMD' },
      platform: 'win32',
    })

    expect(() => resolveTerminalShell('C:\\Tools\\notes.txt', dependencies)).toThrow(
      'executable extension',
    )
    expect(resolveTerminalShell('C:\\Tools\\PWSH.ExE', dependencies)).toBe('C:\\Tools\\PWSH.ExE')
  })

  it('accepts a valid custom executable path', () => {
    expect(resolveTerminalShell('/usr/local/bin/fish', createDependencies())).toBe(
      '/usr/local/bin/fish',
    )
  })
})
