import { describe, expect, it } from 'vitest'
import { getNativeMenuLabels, normalizeNativeMenuLocale } from '@electron/menuLocalization.js'

describe('native menu localization', () => {
  it('normalizes supported Electron and renderer locale values', () => {
    expect(normalizeNativeMenuLocale('zh')).toBe('zh-CN')
    expect(normalizeNativeMenuLocale('zh-Hans-CN')).toBe('zh-CN')
    expect(normalizeNativeMenuLocale('en')).toBe('en-US')
    expect(normalizeNativeMenuLocale('en-GB')).toBe('en-US')
  })

  it('falls back to English for unsupported OS locales', () => {
    expect(normalizeNativeMenuLocale('fr-FR')).toBe('en-US')
    expect(getNativeMenuLabels('fr-FR').file.label).toBe('File')
  })

  it('provides Chinese native menu labels', () => {
    const labels = getNativeMenuLabels('zh-CN')

    expect(labels.file.label).toBe('文件')
    expect(labels.app.quit('marklab')).toBe('退出 marklab')
  })
})
