import { Menu, type BrowserWindow, type MenuItemConstructorOptions, app } from 'electron'
import {
  getNativeMenuLabels,
  normalizeNativeMenuLocale,
  type NativeMenuLocale,
} from '@electron/menuLocalization.js'
import { getRendererPersistValue } from '@electron/services/settingsStore.js'

export const MENU_ACTION_IDS = [
  'file.new',
  'file.open_project',
  'file.open_file',
  'file.export_pdf',
  'file.export_docx',
  'file.export_html',
  'window.open_current_workspace_in_new_window',
  'edit.undo',
  'edit.redo',
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.select_all',
  'view.wysiwyg',
  'view.source',
  'view.graph',
  'view.toggle_sidebar',
  'view.toggle_right_sidebar',
  'view.toggle_zen_mode',
  'view.toggle_focus_mode',
  'view.toggle_typewriter_mode',
  'theme-mode.system',
  'theme-mode.light',
  'theme-mode.dark',
  'theme.paper',
  'theme.ivory',
  'theme.sepia',
  'theme.github',
  'theme.solarized',
  'theme.mist',
  'theme.ink',
  'theme.graphite',
  'theme.nord',
  'theme.obsidian',
  'help.about',
] as const
export type MenuActionId = (typeof MENU_ACTION_IDS)[number]
export type MenuActionDispatcher = (id: MenuActionId) => void

let installedMenu: { dispatch?: MenuActionDispatcher; mainWindow: BrowserWindow } | null = null
let configuredMenuLocale: NativeMenuLocale | null = null

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object')
}

const readPersistedMenuLocale = (): string | null => {
  try {
    const value = getRendererPersistValue('marklab.preferences')
    if (!isRecord(value) || !isRecord(value.state)) return null
    return typeof value.state.locale === 'string' ? value.state.locale : null
  } catch {
    return null
  }
}

const getCurrentMenuLocale = (): NativeMenuLocale => {
  configuredMenuLocale ??= normalizeNativeMenuLocale(readPersistedMenuLocale() ?? app.getLocale())
  return configuredMenuLocale
}

const sendMenuAction = (
  window: BrowserWindow | null,
  id: MenuActionId,
  dispatch?: MenuActionDispatcher,
) => {
  if (dispatch) {
    dispatch(id)
    return
  }
  if (!window || window.isDestroyed()) return
  window.webContents.send('menu-action', id)
}
const actionItem = (
  window: BrowserWindow,
  id: MenuActionId,
  label: string,
  accelerator?: string,
  dispatch?: MenuActionDispatcher,
): MenuItemConstructorOptions => {
  return {
    id,
    label,
    accelerator,
    click: () => sendMenuAction(window, id, dispatch),
  }
}
export const installNativeMenu = (mainWindow: BrowserWindow, dispatch?: MenuActionDispatcher) => {
  installedMenu = { dispatch, mainWindow }
  const labels = getNativeMenuLabels(getCurrentMenuLocale())
  const appName = app.name
  const themeItems: Array<{ id: MenuActionId; label: string }> = [
    { id: 'theme-mode.system', label: labels.theme.system },
    { id: 'theme-mode.light', label: labels.theme.light },
    { id: 'theme-mode.dark', label: labels.theme.dark },
    { id: 'theme.paper', label: labels.theme.paper },
    { id: 'theme.ivory', label: labels.theme.ivory },
    { id: 'theme.sepia', label: labels.theme.sepia },
    { id: 'theme.github', label: labels.theme.github },
    { id: 'theme.solarized', label: labels.theme.solarized },
    { id: 'theme.mist', label: labels.theme.mist },
    { id: 'theme.ink', label: labels.theme.ink },
    { id: 'theme.graphite', label: labels.theme.graphite },
    { id: 'theme.nord', label: labels.theme.nord },
    { id: 'theme.obsidian', label: labels.theme.obsidian },
  ]
  const fileMenu: MenuItemConstructorOptions = {
    label: labels.file.label,
    submenu: [
      actionItem(
        mainWindow,
        'window.open_current_workspace_in_new_window',
        labels.file.newWindow,
        'CmdOrCtrl+Shift+N',
        dispatch,
      ),
      { type: 'separator' },
      actionItem(mainWindow, 'file.open_project', labels.file.openProject, 'CmdOrCtrl+O', dispatch),
      actionItem(mainWindow, 'file.open_file', labels.file.openFile, 'CmdOrCtrl+Shift+O', dispatch),
      { type: 'separator' },
      actionItem(mainWindow, 'file.new', labels.file.newFile, 'CmdOrCtrl+N', dispatch),
      { type: 'separator' },
      actionItem(mainWindow, 'file.export_pdf', labels.file.exportPdf, undefined, dispatch),
      actionItem(mainWindow, 'file.export_docx', labels.file.exportDocx, undefined, dispatch),
      actionItem(mainWindow, 'file.export_html', labels.file.exportHtml, undefined, dispatch),
      { type: 'separator' },
      process.platform === 'darwin'
        ? { label: labels.file.closeWindow, role: 'close' }
        : { label: labels.app.quit(appName), role: 'quit' },
    ],
  }
  const editMenu: MenuItemConstructorOptions = {
    label: labels.edit.label,
    submenu: [
      actionItem(mainWindow, 'edit.undo', labels.edit.undo, 'CmdOrCtrl+Z', dispatch),
      actionItem(
        mainWindow,
        'edit.redo',
        labels.edit.redo,
        process.platform === 'darwin' ? 'Shift+Cmd+Z' : 'Ctrl+Y',
        dispatch,
      ),
      { type: 'separator' },
      actionItem(mainWindow, 'edit.cut', labels.edit.cut, 'CmdOrCtrl+X', dispatch),
      actionItem(mainWindow, 'edit.copy', labels.edit.copy, 'CmdOrCtrl+C', dispatch),
      actionItem(mainWindow, 'edit.paste', labels.edit.paste, 'CmdOrCtrl+V', dispatch),
      { type: 'separator' },
      actionItem(mainWindow, 'edit.select_all', labels.edit.selectAll, 'CmdOrCtrl+A', dispatch),
    ],
  }
  const viewMenu: MenuItemConstructorOptions = {
    label: labels.view.label,
    submenu: [
      actionItem(mainWindow, 'view.wysiwyg', labels.view.wysiwyg, undefined, dispatch),
      actionItem(mainWindow, 'view.source', labels.view.source, undefined, dispatch),
      actionItem(mainWindow, 'view.graph', labels.view.graph, undefined, dispatch),
      { type: 'separator' },
      actionItem(mainWindow, 'view.toggle_sidebar', labels.view.sidebar, undefined, dispatch),
      actionItem(
        mainWindow,
        'view.toggle_right_sidebar',
        labels.view.rightSidebar,
        undefined,
        dispatch,
      ),
      { type: 'separator' },
      actionItem(mainWindow, 'view.toggle_zen_mode', labels.view.zenMode, undefined, dispatch),
      actionItem(mainWindow, 'view.toggle_focus_mode', labels.view.focusMode, undefined, dispatch),
      actionItem(
        mainWindow,
        'view.toggle_typewriter_mode',
        labels.view.typewriterMode,
        undefined,
        dispatch,
      ),
      { type: 'separator' },
      { label: labels.view.reload, role: 'reload' },
      { label: labels.view.devTools, role: 'toggleDevTools' },
    ],
  }
  const themeMenu: MenuItemConstructorOptions = {
    label: labels.theme.label,
    submenu: themeItems.map((item) =>
      actionItem(mainWindow, item.id, item.label, undefined, dispatch),
    ),
  }
  const helpMenu: MenuItemConstructorOptions = {
    label: labels.help.label,
    submenu: [
      actionItem(mainWindow, 'help.about', labels.help.about(appName), undefined, dispatch),
    ],
  }
  const template: MenuItemConstructorOptions[] = [fileMenu, editMenu, viewMenu, themeMenu, helpMenu]
  if (process.platform === 'darwin') {
    template.unshift({
      label: appName,
      submenu: [
        actionItem(mainWindow, 'help.about', labels.app.about(appName), undefined, dispatch),
        { type: 'separator' },
        { label: labels.app.services, role: 'services' },
        { type: 'separator' },
        { label: labels.app.hide(appName), role: 'hide' },
        { label: labels.app.hideOthers, role: 'hideOthers' },
        { label: labels.app.showAll, role: 'unhide' },
        { type: 'separator' },
        { label: labels.app.quit(appName), role: 'quit' },
      ],
    })
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export const setNativeMenuLocale = (locale: string): { locale: NativeMenuLocale; ok: boolean } => {
  configuredMenuLocale = normalizeNativeMenuLocale(locale)
  if (installedMenu && !installedMenu.mainWindow.isDestroyed()) {
    installNativeMenu(installedMenu.mainWindow, installedMenu.dispatch)
  }
  return { locale: configuredMenuLocale, ok: true }
}
