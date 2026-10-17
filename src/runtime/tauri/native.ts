import type { DesktopRuntimeApi } from '@/runtime/desktop'
import { request, type TauriEventHub } from '@/runtime/tauri/transport'

type NativeSurfaces = Pick<
  DesktopRuntimeApi,
  | 'aiCompletion'
  | 'clipboard'
  | 'dialog'
  | 'edit'
  | 'languageIntelligence'
  | 'linkPreview'
  | 'settings'
  | 'shell'
  | 'themes'
  | 'updates'
  | 'webTabs'
>

export const createNativeApis = (events: TauriEventHub): NativeSurfaces => ({
  aiCompletion: {
    cancel: (requestId) => request('ai_completion_cancel', { requestId }),
    start: (payload) => request('ai_completion_start', payload),
    onEvent: (handler) => events.on('ai-completion-event', handler),
  },
  clipboard: {
    readImage: () => request('clipboard_read_image'),
    readText: () => request('clipboard_read_text'),
    write: (payload) => request('clipboard_write', payload),
    writeText: (text) => request('clipboard_write_text', { text }),
  },
  dialog: {
    createWorkspace: (payload) => request('dialog_create_workspace', payload),
    open: (payload = {}) => request('dialog_open', payload),
    save: (payload = {}) => request('dialog_save', payload),
  },
  edit: { execute: (action) => request('edit_execute', { action }) },
  languageIntelligence: {
    openDocument: (payload) => request('language_document_open', payload),
    changeDocument: (payload) => request('language_document_change', payload),
    closeDocument: (payload) => request('language_document_close', payload),
    completion: (payload) => request('language_completion', payload),
    diagnostics: (payload) => request('language_diagnostics', payload),
  },
  linkPreview: {
    capture: (url) => request('link_preview_capture', { url }),
    fetch: (url) => request('link_preview_fetch', { url }),
  },
  settings: {
    recentWorkspaces: {
      list: () => request('recent_workspaces_list'),
      remove: async (path) => {
        const result = await request<{ ok: boolean; error?: string }>('recent_workspaces_remove', {
          path,
        })
        if (!result.ok) throw new Error(result.error ?? 'Unable to remove workspace history')
      },
      watch: async (handler) => events.on('recent-workspaces-changed', handler),
    },
    persist: {
      getItem: (key) => request('settings_persist_get', { key }),
      setItem: (key, value) => request('settings_persist_set', { key, value }),
      removeItem: (key) => request('settings_persist_remove', { key }),
    },
  },
  shell: {
    openPath: (path) => request('shell_open_path', { path }),
    revealPath: (path) => request('shell_reveal_path', { path }),
  },
  themes: {
    importCss: (path) => request('themes_import_css', { path }),
    list: () => request('themes_list'),
    openFolder: () => request('themes_open_folder'),
    readCss: (id) => request('themes_read_css', { id }),
    remove: (id) => request('themes_remove', { id }),
  },
  updates: {
    check: () => request('updates_check'),
    download: () => request('updates_download'),
    getState: () => request('updates_get_state'),
    install: () => request('updates_install'),
    setInstallOnQuit: (enabled) => request('updates_set_install_on_quit', { enabled }),
    onEvent: (handler) => events.on('updates-event', handler),
  },
  webTabs: {
    activate: (payload) => request('web_tabs_activate', payload),
    close: (payload) => request('web_tabs_close', payload),
    goBack: (payload) => request('web_tabs_go_back', payload),
    goForward: (payload) => request('web_tabs_go_forward', payload),
    hide: (payload) => request('web_tabs_hide', payload),
    navigate: (payload) => request('web_tabs_navigate', payload),
    onState: (handler) => events.on('web-tabs-state', handler),
    reload: (payload) => request('web_tabs_reload', payload),
    setBounds: (payload) => request('web_tabs_set_bounds', payload),
    setShortcutBindings: (payload) => request('web_tabs_set_shortcut_bindings', payload),
    stop: (payload) => request('web_tabs_stop', payload),
  },
})
