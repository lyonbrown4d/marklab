import { getElectronRuntime, type ElectronUserThemeInfo } from '@/runtime/electron'

export type UserThemeInfo = ElectronUserThemeInfo

const themeError = (fallback: string, error?: string): Error => new Error(error || fallback)

const runtimeThemes = () => getElectronRuntime()?.themes ?? null

export const userThemeApi = {
  isSupported: () => Boolean(getElectronRuntime()?.themes && getElectronRuntime()?.dialog),

  async pickCssFile(): Promise<string | null> {
    const runtime = getElectronRuntime()
    if (!runtime?.dialog) return null
    const selected = await runtime.dialog.open({
      title: 'Import CSS Theme',
      buttonLabel: 'Import Theme',
      file: true,
      filters: [{ name: 'CSS Theme', extensions: ['css'] }],
    })
    return typeof selected === 'string' ? selected : null
  },

  async list(): Promise<UserThemeInfo[]> {
    const themes = runtimeThemes()
    if (!themes) return []
    const result = await themes.list()
    if (!result.ok) throw themeError('Unable to list themes.', result.error)
    return result.themes
  },

  async importCss(path: string): Promise<UserThemeInfo> {
    const themes = runtimeThemes()
    if (!themes) throw themeError('Custom themes are unavailable in this runtime.')
    const result = await themes.importCss(path)
    if (!result.ok || !result.theme) throw themeError('Unable to import theme.', result.error)
    return result.theme
  },

  async readCss(id: string | null): Promise<string> {
    const themes = runtimeThemes()
    if (!themes || !id) return ''
    const result = await themes.readCss(id)
    if (!result.ok) throw themeError('Unable to load theme CSS.', result.error)
    return result.css ?? ''
  },

  async remove(id: string): Promise<void> {
    const themes = runtimeThemes()
    if (!themes) return
    const result = await themes.remove(id)
    if (!result.ok) throw themeError('Unable to remove theme.', result.error)
  },

  async openFolder(): Promise<void> {
    const themes = runtimeThemes()
    if (!themes) return
    const result = await themes.openFolder()
    if (!result.ok) throw themeError('Unable to open themes folder.', result.error)
  },
}
