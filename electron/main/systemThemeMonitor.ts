import type { SystemThemePayload } from '@electron/types.js'

const WINDOWS_THEME_CALIBRATION_MS = 5000

type Scheduler = {
  clearInterval: (timer: ReturnType<typeof setInterval>) => void
  setInterval: (callback: () => void, intervalMs: number) => ReturnType<typeof setInterval>
}

type SystemNativeTheme = {
  readonly shouldUseDarkColors: boolean
  off: (event: 'updated', listener: () => void) => unknown
  on: (event: 'updated', listener: () => void) => unknown
}

type SystemThemeMonitorOptions = {
  nativeTheme: SystemNativeTheme
  onChange: (payload: SystemThemePayload) => void
  platform?: NodeJS.Platform
  scheduler?: Scheduler
}

export type SystemThemeMonitor = {
  announceCurrent: () => void
  dispose: () => void
  start: () => void
}

const systemThemePayload = (
  nativeTheme: Pick<SystemNativeTheme, 'shouldUseDarkColors'>,
): SystemThemePayload => ({
  colorMode: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
})

export const createSystemThemeMonitor = ({
  nativeTheme,
  onChange,
  platform = process.platform,
  scheduler = globalThis,
}: SystemThemeMonitorOptions): SystemThemeMonitor => {
  let calibrationTimer: ReturnType<typeof setInterval> | null = null
  let lastColorMode: SystemThemePayload['colorMode'] | null = null
  let started = false

  const publish = (force = false): void => {
    const payload = systemThemePayload(nativeTheme)
    if (!force && payload.colorMode === lastColorMode) return
    lastColorMode = payload.colorMode
    onChange(payload)
  }

  const handleNativeThemeUpdated = (): void => publish()

  const start = (): void => {
    if (started) return
    started = true
    nativeTheme.on('updated', handleNativeThemeUpdated)
    if (platform === 'win32') {
      calibrationTimer = scheduler.setInterval(publish, WINDOWS_THEME_CALIBRATION_MS)
    }
  }

  const dispose = (): void => {
    if (!started) return
    started = false
    nativeTheme.off('updated', handleNativeThemeUpdated)
    if (calibrationTimer !== null) {
      scheduler.clearInterval(calibrationTimer)
      calibrationTimer = null
    }
  }

  return {
    announceCurrent: () => publish(true),
    dispose,
    start,
  }
}
