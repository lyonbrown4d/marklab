import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- Worker build helpers are intentionally tested from app tests.
import {
  assertPlateMarkdownWorkerVersions,
  expectedPlateMarkdownWorkerVersions,
  readPlateMarkdownWorkerVersions,
  transformPlateMarkdownWorkerDependency,
} from '../../vite.workerPlateTransforms'

const rootRequire = createRequire(import.meta.url)
const markdownEntry = rootRequire.resolve('@platejs/markdown')
const dateEntry = createRequire(markdownEntry).resolve('@platejs/date')
const datePluginFile = readdirSync(path.dirname(dateEntry)).find((file) =>
  /^BaseDatePlugin-.*\.js$/.test(file),
)
if (!datePluginFile) throw new Error('Installed @platejs/date BaseDatePlugin bundle not found.')

const cases = [
  {
    exportName: 'BaseDatePlugin',
    id: path.join(path.dirname(dateEntry), datePluginFile),
    packageName: '@platejs/date',
    region: 'src/lib/BaseDatePlugin.ts',
  },
  {
    exportName: 'MarkdownPlugin',
    id: markdownEntry,
    packageName: '@platejs/markdown',
    region: 'src/lib/MarkdownPlugin.ts',
  },
] as const

describe('Plate Markdown worker dependency transform', () => {
  it('reads and validates the installed Plate compatibility versions', () => {
    expect(readPlateMarkdownWorkerVersions()).toEqual(expectedPlateMarkdownWorkerVersions)
  })

  it.each(Object.keys(expectedPlateMarkdownWorkerVersions))(
    'fails closed when the installed %s version changes',
    (packageName) => {
      expect(() =>
        assertPlateMarkdownWorkerVersions({
          ...expectedPlateMarkdownWorkerVersions,
          [packageName]: '0.0.0-upgraded',
        }),
      ).toThrow(`${packageName}@0.0.0-upgraded`)
    },
  )

  it.each(cases)('replaces $exportName with an explicit unavailable export', (testCase) => {
    const source = readFileSync(testCase.id, 'utf8')
    const transformed = transformPlateMarkdownWorkerDependency(source, testCase.id)
    if (!transformed) throw new Error('Expected dependency transform to match.')
    const context: { transformedExport?: Record<string, unknown> } = {}
    const startMarker = `//#region ${testCase.region}`
    const start = transformed.code.indexOf(startMarker)
    const end = transformed.code.indexOf('//#endregion', start)
    const transformedRegion = transformed.code.slice(start, end)

    runInNewContext(
      `${transformedRegion}\nglobalThis.transformedExport = ${testCase.exportName};`,
      context,
    )

    expect(() => context.transformedExport?.key).toThrow(
      `Plate export "${testCase.exportName}" is unavailable in the Markdown worker runtime. ` +
        'Update the worker compatibility boundary before using it.',
    )
  })

  it.each(cases)('fails closed when the $exportName source marker changes', (testCase) => {
    expect(() =>
      transformPlateMarkdownWorkerDependency('const changed = true', testCase.id),
    ).toThrow(`${testCase.packageName} worker boundary could not isolate ${testCase.exportName}.`)
  })

  it.each(cases)('fails closed when the $exportName region signature changes', (testCase) => {
    const source = readFileSync(testCase.id, 'utf8')
    const changed = source.replace(
      `const ${testCase.exportName} =`,
      `const ${testCase.exportName} = /* changed */`,
    )

    expect(() => transformPlateMarkdownWorkerDependency(changed, testCase.id)).toThrow(
      `${testCase.packageName} worker boundary signature changed for ${testCase.exportName}`,
    )
  })
})
