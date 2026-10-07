import type { Locale } from '@/i18n/resources'

export type ViewMode = 'wysiwyg' | 'source' | 'preview'
export type FileViewKind = 'edit' | 'source' | 'preview'
export type ThemeColorMode = 'light' | 'dark'
export type ThemeModePreference = 'system' | ThemeColorMode
export type LightThemeMode = 'paper' | 'ivory' | 'sepia' | 'github' | 'solarized' | 'mist'
export type DarkThemeMode = 'ink' | 'graphite' | 'nord' | 'obsidian'
export type ThemeMode = LightThemeMode | DarkThemeMode
export type GitDiffSection = 'staged' | 'unstaged' | 'untracked' | 'conflicts'
export type GraphContentMode = 'none' | 'summary' | 'full'
export type GraphMiniMapPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type GraphMiniMapSize = 'compact' | 'regular'
export type MarkdownAssetImportStrategy = 'copy-to-document-assets' | 'preserve-path'

export type WorkspaceTab =
  | {
      kind: 'file'
      view: FileViewKind
      path: string
    }
  | {
      kind: 'git-diff'
      path: string
      section: GitDiffSection
    }
  | {
      kind: 'web'
      id: string
      url: string
      title: string
    }

export type FileEntry = {
  path: string
  kind: 'file' | 'folder'
  hasChildren?: boolean
  childrenLoaded?: boolean
}

export type RootKind = 'internal' | 'external' | 'single'
export type AppLocale = Locale
