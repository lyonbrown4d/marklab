import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const electronRuntime = vi.hoisted(() => ({
  appendSwitch: vi.fn(),
  disableHardwareAcceleration: vi.fn(),
  isPackaged: false,
}))

vi.mock('electron', () => ({
  app: {
    commandLine: { appendSwitch: electronRuntime.appendSwitch },
    disableHardwareAcceleration: electronRuntime.disableHardwareAcceleration,
    get isPackaged() {
      return electronRuntime.isPackaged
    },
  },
}))

import { installElectronE2eRuntimeFlags } from '@electron/main/e2eRuntime'

const originalMarklabE2e = process.env.MARKLAB_E2E

describe('Electron E2E runtime flags', () => {
  beforeEach(() => {
    process.env.MARKLAB_E2E = '1'
    electronRuntime.appendSwitch.mockClear()
    electronRuntime.disableHardwareAcceleration.mockClear()
    electronRuntime.isPackaged = false
  })

  afterAll(() => {
    if (originalMarklabE2e === undefined) delete process.env.MARKLAB_E2E
    else process.env.MARKLAB_E2E = originalMarklabE2e
  })

  it('does not weaken a packaged app when MARKLAB_E2E is enabled', () => {
    electronRuntime.isPackaged = true

    installElectronE2eRuntimeFlags()

    expect(electronRuntime.disableHardwareAcceleration).not.toHaveBeenCalled()
    expect(electronRuntime.appendSwitch).not.toHaveBeenCalled()
  })

  it('keeps the existing software-rendering flags for an unpackaged E2E app', () => {
    installElectronE2eRuntimeFlags()

    expect(electronRuntime.disableHardwareAcceleration).toHaveBeenCalledOnce()
    expect(electronRuntime.appendSwitch).toHaveBeenCalledWith('no-sandbox')
  })
})
