import type {
  DarkThemeMode,
  LightThemeMode,
  ThemeColorMode,
  ThemeMode,
  ThemeModePreference,
} from '@/store/appTypes'

export type BuiltInTheme = {
  value: ThemeMode
  labelKey: string
  swatchClass: string
  mode: ThemeColorMode
}

export const lightThemeValues = [
  'paper',
  'ivory',
  'sepia',
  'github',
  'solarized',
  'mist',
] as const satisfies readonly LightThemeMode[]

export const darkThemeValues = [
  'ink',
  'graphite',
  'nord',
  'obsidian',
] as const satisfies readonly DarkThemeMode[]

export const builtInThemeValues = [...lightThemeValues, ...darkThemeValues] as const

export const builtInThemes: BuiltInTheme[] = [
  { value: 'paper', labelKey: 'theme.paper', swatchClass: 'theme-swatch-paper', mode: 'light' },
  { value: 'ivory', labelKey: 'theme.ivory', swatchClass: 'theme-swatch-ivory', mode: 'light' },
  { value: 'sepia', labelKey: 'theme.sepia', swatchClass: 'theme-swatch-sepia', mode: 'light' },
  {
    value: 'github',
    labelKey: 'theme.github',
    swatchClass: 'theme-swatch-github',
    mode: 'light',
  },
  {
    value: 'solarized',
    labelKey: 'theme.solarized',
    swatchClass: 'theme-swatch-solarized',
    mode: 'light',
  },
  { value: 'mist', labelKey: 'theme.mist', swatchClass: 'theme-swatch-mist', mode: 'light' },
  { value: 'ink', labelKey: 'theme.ink', swatchClass: 'theme-swatch-ink', mode: 'dark' },
  {
    value: 'graphite',
    labelKey: 'theme.graphite',
    swatchClass: 'theme-swatch-graphite',
    mode: 'dark',
  },
  {
    value: 'nord',
    labelKey: 'theme.nord',
    swatchClass: 'theme-swatch-nord',
    mode: 'dark',
  },
  {
    value: 'obsidian',
    labelKey: 'theme.obsidian',
    swatchClass: 'theme-swatch-obsidian',
    mode: 'dark',
  },
]

const builtInThemeSet = new Set<ThemeMode>(builtInThemeValues)
const lightThemeSet = new Set<LightThemeMode>(lightThemeValues)
const darkThemeSet = new Set<DarkThemeMode>(darkThemeValues)

export const lightThemes = builtInThemes.filter(
  (theme): theme is BuiltInTheme & { value: LightThemeMode; mode: 'light' } =>
    theme.mode === 'light',
)

export const darkThemes = builtInThemes.filter(
  (theme): theme is BuiltInTheme & { value: DarkThemeMode; mode: 'dark' } => theme.mode === 'dark',
)

export const isThemeMode = (value: string): value is ThemeMode => {
  return builtInThemeSet.has(value as ThemeMode)
}

export const isLightThemeMode = (value: string): value is LightThemeMode => {
  return lightThemeSet.has(value as LightThemeMode)
}

export const isDarkThemeValue = (value: string): value is DarkThemeMode => {
  return darkThemeSet.has(value as DarkThemeMode)
}

export const isDarkThemeMode = (theme: ThemeMode): theme is DarkThemeMode => {
  return isDarkThemeValue(theme)
}

export const themeActionId = (theme: ThemeMode): string => `theme.${theme}`
export const themeModeActionId = (mode: ThemeModePreference): string => `theme-mode.${mode}`

export const themeFromActionId = (id: string): ThemeMode | null => {
  if (!id.startsWith('theme.')) return null
  const value = id.slice('theme.'.length)
  return isThemeMode(value) ? value : null
}

export const themeModeFromActionId = (id: string): ThemeModePreference | null => {
  if (id === 'theme-mode.system') return 'system'
  if (id === 'theme-mode.light') return 'light'
  if (id === 'theme-mode.dark') return 'dark'
  return null
}
