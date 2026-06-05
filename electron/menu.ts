import { Menu, type BrowserWindow, type MenuItemConstructorOptions, app } from 'electron'
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
  'theme.light',
  'theme.dark',
  'theme.marko-light',
  'theme.marko-dark',
  'help.about',
] as const
export type MenuActionId = (typeof MENU_ACTION_IDS)[number]
export type MenuActionDispatcher = (id: MenuActionId) => void
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
  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      actionItem(
        mainWindow,
        'window.open_current_workspace_in_new_window',
        'New Window',
        'CmdOrCtrl+Shift+N',
        dispatch,
      ),
      { type: 'separator' },
      actionItem(mainWindow, 'file.open_project', 'Open Folder...', 'CmdOrCtrl+O', dispatch),
      actionItem(mainWindow, 'file.open_file', 'Open File...', 'CmdOrCtrl+Shift+O', dispatch),
      { type: 'separator' },
      actionItem(mainWindow, 'file.new', 'New File', 'CmdOrCtrl+N', dispatch),
      { type: 'separator' },
      actionItem(mainWindow, 'file.export_pdf', 'Export to PDF...', undefined, dispatch),
      actionItem(mainWindow, 'file.export_docx', 'Export to Word...', undefined, dispatch),
      actionItem(mainWindow, 'file.export_html', 'Export to HTML...', undefined, dispatch),
      { type: 'separator' },
      process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
    ],
  }
  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      actionItem(mainWindow, 'edit.undo', 'Undo', 'CmdOrCtrl+Z', dispatch),
      actionItem(
        mainWindow,
        'edit.redo',
        'Redo',
        process.platform === 'darwin' ? 'Shift+Cmd+Z' : 'Ctrl+Y',
        dispatch,
      ),
      { type: 'separator' },
      actionItem(mainWindow, 'edit.cut', 'Cut', 'CmdOrCtrl+X', dispatch),
      actionItem(mainWindow, 'edit.copy', 'Copy', 'CmdOrCtrl+C', dispatch),
      actionItem(mainWindow, 'edit.paste', 'Paste', 'CmdOrCtrl+V', dispatch),
      { type: 'separator' },
      actionItem(mainWindow, 'edit.select_all', 'Select All', 'CmdOrCtrl+A', dispatch),
    ],
  }
  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      actionItem(mainWindow, 'view.wysiwyg', 'WYSIWYG', undefined, dispatch),
      actionItem(mainWindow, 'view.source', 'Source', undefined, dispatch),
      actionItem(mainWindow, 'view.graph', 'Graph', undefined, dispatch),
      { type: 'separator' },
      actionItem(mainWindow, 'view.toggle_sidebar', 'Toggle Sidebar', undefined, dispatch),
      actionItem(
        mainWindow,
        'view.toggle_right_sidebar',
        'Toggle Right Sidebar',
        undefined,
        dispatch,
      ),
      { type: 'separator' },
      actionItem(mainWindow, 'view.toggle_zen_mode', 'Toggle Zen Mode', undefined, dispatch),
      actionItem(mainWindow, 'view.toggle_focus_mode', 'Toggle Focus Mode', undefined, dispatch),
      actionItem(
        mainWindow,
        'view.toggle_typewriter_mode',
        'Toggle Typewriter Mode',
        undefined,
        dispatch,
      ),
      { type: 'separator' },
      { role: 'reload' },
      { role: 'toggleDevTools' },
    ],
  }
  const themeMenu: MenuItemConstructorOptions = {
    label: 'Theme',
    submenu: [
      actionItem(mainWindow, 'theme.light', 'Light', undefined, dispatch),
      actionItem(mainWindow, 'theme.dark', 'Dark', undefined, dispatch),
      { type: 'separator' },
      actionItem(mainWindow, 'theme.marko-light', 'Marklab Light', undefined, dispatch),
      actionItem(mainWindow, 'theme.marko-dark', 'Marklab Dark', undefined, dispatch),
    ],
  }
  const helpMenu: MenuItemConstructorOptions = {
    label: 'Help',
    submenu: [actionItem(mainWindow, 'help.about', 'About marklab', undefined, dispatch)],
  }
  const template: MenuItemConstructorOptions[] = [fileMenu, editMenu, viewMenu, themeMenu, helpMenu]
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
