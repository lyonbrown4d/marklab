import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- Root Vite helpers load outside renderer aliases.
import { plateMarkdownDeadExportsPlugin } from '../../vite.workerPlateTransforms'

type TestPlugin = {
  buildEnd: (this: TestPluginContext, error?: Error) => void
  buildStart: () => void
  transform: (code: string, id: string) => unknown
}

type TestPluginContext = {
  error: (message: string) => never
}

const loadPlateVendorSources = () => {
  const rootRequire = createRequire(import.meta.url)
  const markdownPath = rootRequire.resolve('@platejs/markdown')
  const markdownRequire = createRequire(markdownPath)
  const dateEntry = markdownRequire.resolve('@platejs/date')
  const dateDirectory = path.dirname(dateEntry)
  const dateFile = readdirSync(dateDirectory).find((name) => /^BaseDatePlugin-.*\.js$/u.test(name))
  if (!dateFile) throw new Error('Unable to locate the installed BaseDatePlugin bundle.')
  const datePath = path.join(dateDirectory, dateFile)

  return {
    date: { code: readFileSync(datePath, 'utf8'), id: datePath },
    markdown: { code: readFileSync(markdownPath, 'utf8'), id: markdownPath },
  }
}

const pluginContext: TestPluginContext = {
  error(message) {
    throw new Error(message)
  },
}

const runSuccessfulBuild = (plugin: TestPlugin) => {
  const sources = loadPlateVendorSources()
  plugin.buildStart()
  plugin.transform(sources.date.code, sources.date.id)
  plugin.transform(sources.markdown.code, sources.markdown.id)
  expect(() => plugin.buildEnd.call(pluginContext)).not.toThrow()
}

describe('plateMarkdownDeadExportsPlugin build lifecycle', () => {
  it('clears transform state before a second build on the same plugin instance', () => {
    const plugin = plateMarkdownDeadExportsPlugin() as unknown as TestPlugin
    runSuccessfulBuild(plugin)

    plugin.buildStart()
    plugin.transform(
      'export const untouched = true',
      '/node_modules/@platejs/markdown/secondary.js',
    )
    expect(() => plugin.buildEnd.call(pluginContext)).toThrow(
      /Plate worker boundary did not transform BaseDatePlugin/u,
    )
  })

  it('clears Plate usage state when a rebuild no longer includes Plate', () => {
    const plugin = plateMarkdownDeadExportsPlugin() as unknown as TestPlugin
    runSuccessfulBuild(plugin)

    plugin.buildStart()
    expect(() => plugin.buildEnd.call(pluginContext)).not.toThrow()
  })
})
