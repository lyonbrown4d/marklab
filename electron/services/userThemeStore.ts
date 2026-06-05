import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { noopLogger, type Logger } from '@electron/services/logger.js'
import type { UserThemeInfo } from '@electron/types.js'

const THEMES_DIR = 'themes'
const THEME_CSS_FILE = 'theme.css'
const THEME_META_FILE = 'theme.json'
const MAX_THEME_CSS_BYTES = 512 * 1024
const THEME_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i

let logger: Logger = noopLogger

type UserThemeMeta = UserThemeInfo & {
  sourceName: string
}

export const configureUserThemeStoreLogger = (nextLogger: Logger): void => {
  logger = nextLogger
}

const themesDir = (): string => path.join(app.getPath('userData'), THEMES_DIR)

export const getUserThemesDir = (): string => {
  fs.mkdirSync(themesDir(), { recursive: true })
  return themesDir()
}

const themeDir = (id: string): string => path.join(getUserThemesDir(), id)

const themeCssPath = (id: string): string => path.join(themeDir(id), THEME_CSS_FILE)

const themeMetaPath = (id: string): string => path.join(themeDir(id), THEME_META_FILE)

const assertThemeId = (id: string): void => {
  if (!THEME_ID_PATTERN.test(id) || id.includes('..')) {
    throw new Error('Invalid theme id.')
  }
}

const slugifyThemeName = (name: string): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\.css$/i, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'custom-theme'
}

const sanitizeThemeCss = (css: string): string => {
  const bytes = Buffer.from(css, 'utf8').length
  if (bytes > MAX_THEME_CSS_BYTES) {
    throw new Error('Theme CSS is too large. Keep it under 512 KB.')
  }
  if (/@import\b/i.test(css)) {
    throw new Error('Theme CSS cannot use @import.')
  }
  if (/url\(\s*['"]?(?:https?:|file:)/i.test(css)) {
    throw new Error('Theme CSS cannot reference remote or file URLs.')
  }
  return css
}

const readThemeMeta = (id: string): UserThemeInfo | null => {
  try {
    assertThemeId(id)
    const raw = JSON.parse(fs.readFileSync(themeMetaPath(id), 'utf8')) as Partial<UserThemeMeta>
    if (typeof raw.id !== 'string' || raw.id !== id) return null
    if (typeof raw.name !== 'string' || !raw.name.trim()) return null
    return {
      id,
      name: raw.name,
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    }
  } catch (error) {
    logger.warn('unable to read user theme metadata', { error, id })
    return null
  }
}

export const listUserThemes = (): UserThemeInfo[] => {
  const dir = getUserThemesDir()
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readThemeMeta(entry.name))
    .filter((theme): theme is UserThemeInfo => Boolean(theme))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export const importUserThemeCss = (sourcePath: string): UserThemeInfo => {
  if (path.extname(sourcePath).toLowerCase() !== '.css') {
    throw new Error('Only CSS theme files are supported.')
  }

  const sourceName = path.basename(sourcePath)
  const id = `${slugifyThemeName(sourceName)}-${Date.now().toString(36)}`
  const name = sourceName.replace(/\.css$/i, '').trim() || 'Custom Theme'
  const css = sanitizeThemeCss(fs.readFileSync(sourcePath, 'utf8'))
  const createdAt = Date.now()
  const meta: UserThemeMeta = { id, name, sourceName, createdAt }

  fs.mkdirSync(themeDir(id), { recursive: true })
  fs.writeFileSync(themeCssPath(id), css)
  fs.writeFileSync(themeMetaPath(id), `${JSON.stringify(meta, null, 2)}\n`)

  return { id, name, createdAt }
}

export const readUserThemeCss = (id: string): string => {
  assertThemeId(id)
  return sanitizeThemeCss(fs.readFileSync(themeCssPath(id), 'utf8'))
}

export const removeUserTheme = async (id: string): Promise<void> => {
  assertThemeId(id)
  await fs.promises.rm(themeDir(id), { recursive: true, force: true })
}
