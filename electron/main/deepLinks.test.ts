import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSingleInstancePayload, registerDeepLinkProtocol } from '@electron/main/deepLinks.js'

const electronApp = vi.hoisted(() => ({
  isPackaged: false,
  setAsDefaultProtocolClient: vi.fn(),
}))
vi.mock('electron', () => ({ app: electronApp }))
vi.mock('@electron/services/logger.js', () => ({ noopLogger: { warn: vi.fn() } }))

const originalArgv = process.argv
const entry = 'D:/Projects/marklab/dist-electron/main.js'
const note = 'D:/notes/today.md'

beforeEach(() => {
  electronApp.isPackaged = false
  electronApp.setAsDefaultProtocolClient.mockReset()
})
afterEach(() => {
  process.argv = originalArgv
})

describe('Electron launch arguments', () => {
  it.each([
    ['electron', entry, note],
    ['electron', '--user-data-dir=TEMP/user-data', entry, note],
    ['electron', '--inspect=0', '--no-sandbox', entry, note],
    ['electron', '--user-data-dir', 'TEMP/user-data', entry, note],
    ['electron', '--remote-debugging-port', '0', entry, note],
    ['electron', '--', entry, note],
  ])('excludes runtime switches and the entry from %j', (...argv) => {
    expect(createSingleInstancePayload(argv, 'D:/notes')).toEqual({
      args: [note],
      cwd: 'D:/notes',
    })
  })

  it.each([
    ['electron'],
    ['electron', '--no-sandbox'],
    ['electron', '--user-data-dir', 'TEMP/user-data'],
    ['electron', '--'],
  ])('does not invent a target when no entry follows %j', (...argv) => {
    expect(createSingleInstancePayload(argv, null)).toEqual({ args: [], cwd: '' })
  })

  it('supports a directory entry and preserves application arguments after it', () => {
    expect(
      createSingleInstancePayload(
        ['electron', '--no-sandbox', '.', '--application-flag', 'marklab://open?id=1', note],
        '',
      ).args,
    ).toEqual(['--application-flag', 'marklab://open?id=1', note])
  })

  it('does not discard the first document or workspace in a packaged application', () => {
    electronApp.isPackaged = true
    expect(createSingleInstancePayload(['marklab.exe', note, 'D:/workspace'], '').args).toEqual([
      note,
      'D:/workspace',
    ])
  })

  it('normalizes non-string arguments without exposing the development entry', () => {
    expect(
      createSingleInstancePayload(['electron', null, '--no-sandbox', entry, 7, note], 7),
    ).toEqual({ args: [note], cwd: '' })
  })

  it('uses the same parser for cold startup and second-instance launches', async () => {
    process.argv = ['electron', '--user-data-dir=TEMP/user-data', entry]
    vi.resetModules()
    const { getLaunchInfo } = await import('@electron/main/deepLinks.js')
    expect(getLaunchInfo().args).toEqual([])
    expect(createSingleInstancePayload(process.argv, process.cwd()).args).toEqual([])
  })

  it('registers the actual development entry rather than an Electron switch', () => {
    process.argv = ['electron', '--user-data-dir=TEMP/user-data', entry, note]
    registerDeepLinkProtocol()
    expect(electronApp.setAsDefaultProtocolClient).toHaveBeenCalledWith(
      'marklab',
      process.execPath,
      [entry],
    )
  })

  it('registers a packaged protocol without development arguments', () => {
    electronApp.isPackaged = true
    registerDeepLinkProtocol()
    expect(electronApp.setAsDefaultProtocolClient).toHaveBeenCalledWith('marklab')
  })
})
