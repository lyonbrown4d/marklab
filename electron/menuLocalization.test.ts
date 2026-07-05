import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getNativeMenuLabels, normalizeNativeMenuLocale } from '@electron/menuLocalization.js'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const rendererSupportedLocales = () => {
  const source = fs.readFileSync(path.join(repositoryRoot, 'src/i18n/resources.ts'), 'utf8')
  const match = source.match(/supportedLocales = \[([\s\S]*?)\] as const/)
  if (!match) throw new Error('Unable to find renderer supportedLocales.')
  return Array.from(match[1].matchAll(/'([^']+)'/g), (entry) => entry[1]).sort()
}

const labelShape = (value: unknown): unknown => {
  if (typeof value === 'function') return 'function'
  if (!value || typeof value !== 'object') return typeof value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, labelShape(child)]),
  )
}

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

  it('keeps native menu locales aligned with renderer supported locales', () => {
    expect(rendererSupportedLocales()).toEqual(['en-US', 'zh-CN'])
  })

  it('keeps native menu label structure aligned across locales', () => {
    expect(labelShape(getNativeMenuLabels('zh-CN'))).toEqual(
      labelShape(getNativeMenuLabels('en-US')),
    )
  })
})
