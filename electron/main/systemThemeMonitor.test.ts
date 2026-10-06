import { describe, expect, it, vi } from 'vitest'
import { createSystemThemeMonitor } from '@electron/main/systemThemeMonitor'

type UpdatedListener = () => void

const createFixture = (platform: NodeJS.Platform = 'win32') => {
  let updatedListener: UpdatedListener | null = null
  let calibration: (() => void) | null = null
  const nativeTheme = {
    shouldUseDarkColors: true,
    on: vi.fn((_event: 'updated', listener: UpdatedListener) => {
      updatedListener = listener
    }),
    off: vi.fn((_event: 'updated', listener: UpdatedListener) => {
      if (updatedListener === listener) updatedListener = null
    }),
  }
  const onChange = vi.fn()
  const scheduler = {
    clearInterval: vi.fn(),
    setInterval: vi.fn((callback: () => void) => {
      calibration = callback
      return 42 as unknown as ReturnType<typeof setInterval>
    }),
  }
  const monitor = createSystemThemeMonitor({ nativeTheme, onChange, platform, scheduler })

  return {
    emitUpdated: () => updatedListener?.(),
    calibrate: () => calibration?.(),
    monitor,
    nativeTheme,
    onChange,
    scheduler,
  }
}

describe('system theme monitor', () => {
  it('announces the native theme when the renderer becomes ready', () => {
    const fixture = createFixture()

    fixture.monitor.start()
    fixture.monitor.announceCurrent()

    expect(fixture.onChange).toHaveBeenCalledOnce()
    expect(fixture.onChange).toHaveBeenCalledWith({ colorMode: 'dark' })
  })

  it('publishes native theme changes and ignores unchanged update events', () => {
    const fixture = createFixture()
    fixture.monitor.start()
    fixture.monitor.announceCurrent()
    fixture.onChange.mockClear()

    fixture.emitUpdated()
    fixture.nativeTheme.shouldUseDarkColors = false
    fixture.emitUpdated()

    expect(fixture.onChange).toHaveBeenCalledOnce()
    expect(fixture.onChange).toHaveBeenCalledWith({ colorMode: 'light' })
  })

  it('uses a low-frequency Windows calibration and disposes every subscription', () => {
    const fixture = createFixture()

    fixture.monitor.start()

    expect(fixture.scheduler.setInterval).toHaveBeenCalledOnce()
    expect(fixture.scheduler.setInterval).toHaveBeenCalledWith(expect.any(Function), 5000)

    fixture.monitor.announceCurrent()
    fixture.onChange.mockClear()
    fixture.nativeTheme.shouldUseDarkColors = false
    fixture.calibrate()
    expect(fixture.onChange).toHaveBeenCalledWith({ colorMode: 'light' })

    fixture.monitor.dispose()

    expect(fixture.nativeTheme.off).toHaveBeenCalledWith('updated', expect.any(Function))
    expect(fixture.scheduler.clearInterval).toHaveBeenCalledWith(42)
  })

  it('relies on native events without polling on non-Windows platforms', () => {
    const fixture = createFixture('darwin')

    fixture.monitor.start()

    expect(fixture.scheduler.setInterval).not.toHaveBeenCalled()
  })
})
