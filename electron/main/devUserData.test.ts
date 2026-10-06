import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { configureDevUserDataPath } from '@electron/main/devUserData'

describe('configureDevUserDataPath', () => {
  it('sets an absolute isolated userData path in development when explicitly configured', () => {
    const app = { isPackaged: false, setPath: vi.fn() }

    const configured = configureDevUserDataPath(app, {
      MARKLAB_DEV_USER_DATA_DIR: './.tmp/computer-use-profile',
    })

    expect(configured).toBe(path.resolve('./.tmp/computer-use-profile'))
    expect(path.isAbsolute(configured!)).toBe(true)
    expect(app.setPath).toHaveBeenCalledWith('userData', configured)
  })

  it('does nothing without the opt-in or in a packaged application', () => {
    const development = { isPackaged: false, setPath: vi.fn() }
    const packaged = { isPackaged: true, setPath: vi.fn() }

    expect(configureDevUserDataPath(development, {})).toBeNull()
    expect(
      configureDevUserDataPath(packaged, { MARKLAB_DEV_USER_DATA_DIR: './ignored' }),
    ).toBeNull()
    expect(development.setPath).not.toHaveBeenCalled()
    expect(packaged.setPath).not.toHaveBeenCalled()
  })

  it('rejects an empty configured path before changing Electron state', () => {
    const app = { isPackaged: false, setPath: vi.fn() }

    expect(() => configureDevUserDataPath(app, { MARKLAB_DEV_USER_DATA_DIR: '   ' })).toThrow(
      'MARKLAB_DEV_USER_DATA_DIR',
    )
    expect(app.setPath).not.toHaveBeenCalled()
  })
})
