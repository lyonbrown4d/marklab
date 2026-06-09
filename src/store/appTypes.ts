import type { Locale } from '@/i18n/resources'

export type ViewMode = 'wysiwyg' | 'source' | 'graph'
export type FileViewKind = 'edit' | 'source' | 'graph'
export type ThemeColorMode = 'light' | 'dark'
export type ThemeModePreference = 'system' | ThemeColorMode
export type LightThemeMode = 'paper' | 'ivory' | 'sepia' | 'github' | 'solarized' | 'mist'
export type DarkThemeMode = 'ink' | 'graphite' | 'nord' | 'obsidian'
export type ThemeMode = LightThemeMode | DarkThemeMode
export type GitDiffSection = 'staged' | 'unstaged' | 'untracked' | 'conflicts'
export type GraphContentMode = 'none' | 'summary' | 'full'
export type MarkdownAssetImportStrategy = 'copy-to-document-assets' | 'preserve-path'

export type WorkspaceTab =
  | {
      kind: 'file'
      view: FileViewKind
      path: string
    }
  | {
      kind: 'workspace-graph'
    }
  | {
      kind: 'git-diff'
      path: string
      section: GitDiffSection
    }

export type FileEntry = {
  path: string
  kind: 'file' | 'folder'
}

export type RootKind = 'internal' | 'external' | 'single'
export type AppLocale = Locale
