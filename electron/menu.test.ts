import type { MenuItemConstructorOptions } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installNativeMenu } from '@electron/menu.js'

const electronMock = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: MenuItemConstructorOptions[]) => template),
  getLocale: vi.fn(() => 'en-US'),
  setApplicationMenu: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    getLocale: electronMock.getLocale,
    name: 'marklab',
  },
  Menu: {
    buildFromTemplate: electronMock.buildFromTemplate,
    setApplicationMenu: electronMock.setApplicationMenu,
  },
}))

vi.mock('@electron/services/settingsStore.js', () => ({
  getRendererPersistValue: vi.fn(() => null),
}))

const mainWindow = {
  isDestroyed: () => false,
  webContents: {
    send: vi.fn(),
  },
} as never

describe('installNativeMenu', () => {
  beforeEach(() => {
    electronMock.buildFromTemplate.mockClear()
    electronMock.setApplicationMenu.mockClear()
  })

  it('uses native edit roles so source editor shortcuts are not dispatched twice', () => {
    installNativeMenu(mainWindow, vi.fn())

    const template = electronMock.buildFromTemplate.mock.calls[0]?.[0]
    const editMenu = template?.find((item) => item.label === 'Edit')
    const editItems = Array.isArray(editMenu?.submenu) ? editMenu.submenu : []

    expect(editItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Cut', role: 'cut' }),
        expect.objectContaining({ label: 'Copy', role: 'copy' }),
        expect.objectContaining({ label: 'Paste', role: 'paste' }),
        expect.objectContaining({ label: 'Select All', role: 'selectAll' }),
      ]),
    )
    expect(editItems).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'edit.cut' })]),
    )
  })
})
