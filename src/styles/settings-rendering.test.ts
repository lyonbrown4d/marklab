import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const nodeProcess = (
  globalThis as typeof globalThis & {
    process: { cwd: () => string }
  }
).process
const readSource = (path: string) =>
  readFileSync(resolve(nodeProcess.cwd(), path), 'utf8') as string

const settingsStyles = readSource('src/styles/app/_settings.scss')
const settingsDialogSource = readSource('src/components/settings/SettingsDialogLoading.tsx')

describe('settings rendering', () => {
  it('centers the dialog without retaining a transformed GPU layer', () => {
    expect(settingsDialogSource).toContain('settings-dialog-content')
    expect(settingsStyles).toMatch(
      /\.settings-dialog-content\s*\{[^}]*inset:\s*0;[^}]*margin:\s*auto;[^}]*transform:\s*none;[^}]*will-change:\s*auto;/s,
    )
  })

  it('uses opacity-only dialog motion so text stays crisp after opening', () => {
    expect(settingsStyles).toMatch(
      /@keyframes settings-dialog-content-in\s*\{(?:(?!transform:)[\s\S])*?\}/,
    )
    expect(settingsStyles).toMatch(
      /@keyframes settings-dialog-content-out\s*\{(?:(?!transform:)[\s\S])*?\}/,
    )
  })

  it('keeps compact settings labels on an integer-pixel type step', () => {
    expect(settingsStyles).toMatch(
      /\.settings-shortcut-category-title\s*\{[^}]*font-size:\s*0\.75rem;/s,
    )
  })
})
