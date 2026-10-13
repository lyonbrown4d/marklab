import fs, { type Stats, type StatWatcher } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecentWorkspaceWatcher } from '@electron/services/recentWorkspaceWatcher'

type Change = (current: Stats, previous: Stats) => void
const metadata = (values: Partial<Stats> = {}): Stats =>
  ({ ino: 1, dev: 1, nlink: 1, mode: 0o40755, ctimeMs: 1, ...values }) as Stats

describe('recent workspace metadata watcher', () => {
  let callbacks: Map<string, Change>
  beforeEach(() => {
    vi.useFakeTimers()
    callbacks = new Map()
    vi.spyOn(fs, 'watchFile').mockImplementation((file, ...args) => {
      callbacks.set(String(file), args.at(-1) as Change)
      return {} as StatWatcher
    })
    vi.spyOn(fs, 'unwatchFile').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('shares polling across windows and releases resources after the last subscriber closes', () => {
    const watcher = new RecentWorkspaceWatcher()
    const first = vi.fn(),
      second = vi.fn()
    const stopFirst = watcher.subscribe(['/notes'], first)
    const stopSecond = watcher.subscribe(['/notes'], second)
    vi.advanceTimersByTime(100)
    first.mockClear()
    second.mockClear()
    expect(fs.watchFile).toHaveBeenCalledOnce()
    expect(fs.watchFile).toHaveBeenCalledWith(
      '/notes',
      { interval: 1_000, persistent: false },
      expect.any(Function),
    )
    callbacks.get('/notes')!(metadata({ mode: 0 }), metadata())
    vi.advanceTimersByTime(100)
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    stopFirst()
    expect(fs.unwatchFile).not.toHaveBeenCalled()
    stopSecond()
    expect(fs.unwatchFile).toHaveBeenCalledWith('/notes', callbacks.get('/notes'))
  })

  it.each([
    { ino: 0, mode: 0 },
    { ino: 2 },
    { dev: 2 },
    { nlink: 0 },
    { mode: 0o40000 },
    { ctimeMs: 2 },
  ])('detects disappearance, recreation and root permission changes %j', (changes) => {
    const watcher = new RecentWorkspaceWatcher(),
      listener = vi.fn()
    const stop = watcher.subscribe(['/notes'], listener)
    vi.advanceTimersByTime(100)
    listener.mockClear()
    callbacks.get('/notes')!(metadata(changes), metadata())
    callbacks.get('/notes')!(metadata(changes), metadata())
    vi.advanceTimersByTime(100)
    expect(listener).toHaveBeenCalledOnce()
    stop()
  })

  it('ignores unchanged metadata and mtime-only changes', () => {
    const watcher = new RecentWorkspaceWatcher(),
      listener = vi.fn()
    const stop = watcher.subscribe(['/notes'], listener)
    vi.advanceTimersByTime(100)
    listener.mockClear()
    callbacks.get('/notes')!(metadata({ mtimeMs: 42 }), metadata())
    vi.advanceTimersByTime(100)
    expect(listener).not.toHaveBeenCalled()
    stop()
  })

  it('updates watched roots after history edits and ignores queued callbacks from removed roots', () => {
    const watcher = new RecentWorkspaceWatcher(),
      listener = vi.fn()
    const stop = watcher.subscribe(['/old'], listener)
    vi.advanceTimersByTime(100)
    listener.mockClear()
    watcher.setPaths(['/new'])
    expect(fs.unwatchFile).toHaveBeenCalledWith('/old', callbacks.get('/old'))
    vi.advanceTimersByTime(100)
    listener.mockClear()
    callbacks.get('/old')!(metadata({ ino: 0 }), metadata())
    vi.advanceTimersByTime(100)
    expect(listener).not.toHaveBeenCalled()
    stop()
  })

  it('does not watch without subscribers and cancels pending notifications on unsubscribe', () => {
    const watcher = new RecentWorkspaceWatcher(),
      listener = vi.fn()
    watcher.setPaths(['/notes'])
    expect(fs.watchFile).not.toHaveBeenCalled()
    const stop = watcher.subscribe(['/notes'], listener)
    callbacks.get('/notes')!(metadata({ ino: 0 }), metadata())
    stop()
    stop()
    vi.advanceTimersByTime(100)
    expect(listener).not.toHaveBeenCalled()
  })

  it('cleans up a partially failed subscription and skips malformed historical paths', () => {
    const watcher = new RecentWorkspaceWatcher()
    vi.mocked(fs.watchFile).mockImplementationOnce(() => {
      throw new Error('watch unavailable')
    })
    expect(() => watcher.subscribe(['/notes'], vi.fn())).toThrow('watch unavailable')
    expect(fs.unwatchFile).toHaveBeenCalledOnce()
    const stop = watcher.subscribe(['/invalid\0'], vi.fn())
    expect(fs.watchFile).toHaveBeenCalledOnce()
    stop()
  })
})
