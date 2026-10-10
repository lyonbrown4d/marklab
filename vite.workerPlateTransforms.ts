import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { PluginOption } from 'vite'

type DeadExportTarget = {
  expectedRegionHash: string
  exportName: 'BaseDatePlugin' | 'MarkdownPlugin'
  idFragment: string
  packageName: '@platejs/date' | '@platejs/markdown'
  region: string
}

export const expectedPlateMarkdownWorkerVersions = {
  '@platejs/date': '53.0.0',
  '@platejs/markdown': '53.3.15',
  platejs: '53.3.15',
} as const

type PlatePackageName = keyof typeof expectedPlateMarkdownWorkerVersions
type PlatePackageVersions = Record<PlatePackageName, string>

const deadExportTargets: DeadExportTarget[] = [
  {
    expectedRegionHash: '3e26855a3f55729a779b28ca6f56c38649e2d400e1b4280e1df05312766a7f6b',
    exportName: 'BaseDatePlugin',
    idFragment: '/@platejs/date/dist/BaseDatePlugin-',
    packageName: '@platejs/date',
    region: 'src/lib/BaseDatePlugin.ts',
  },
  {
    expectedRegionHash: 'c35319d7e9deb2f98e11a2b286523bfcd7bb2729b44bedd154f7a0f4bbf65349',
    exportName: 'MarkdownPlugin',
    idFragment: '/@platejs/markdown/dist/index.js',
    packageName: '@platejs/markdown',
    region: 'src/lib/MarkdownPlugin.ts',
  },
]

const normalizeId = (id: string) => id.replaceAll('\\', '/')
const normalizeRegion = (region: string) => region.replaceAll('\r\n', '\n').trim()
const hashRegion = (region: string) =>
  createHash('sha256').update(normalizeRegion(region)).digest('hex')

const readPackageVersion = (entry: string, packageName: PlatePackageName) => {
  let directory = path.dirname(entry)
  while (true) {
    const manifest = path.join(directory, 'package.json')
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as {
        name?: string
        version?: string
      }
      if (parsed.name === packageName && parsed.version) return parsed.version
    }
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  throw new Error(`Unable to read installed ${packageName} version for the Markdown worker.`)
}

export const readPlateMarkdownWorkerVersions = (): PlatePackageVersions => {
  const rootRequire = createRequire(import.meta.url)
  const markdownEntry = rootRequire.resolve('@platejs/markdown')
  const markdownRequire = createRequire(markdownEntry)

  return {
    '@platejs/date': readPackageVersion(markdownRequire.resolve('@platejs/date'), '@platejs/date'),
    '@platejs/markdown': readPackageVersion(markdownEntry, '@platejs/markdown'),
    platejs: readPackageVersion(rootRequire.resolve('platejs'), 'platejs'),
  }
}

export const assertPlateMarkdownWorkerVersions = (versions: PlatePackageVersions) => {
  for (const [packageName, expectedVersion] of Object.entries(
    expectedPlateMarkdownWorkerVersions,
  ) as [PlatePackageName, string][]) {
    const actualVersion = versions[packageName]
    if (actualVersion !== expectedVersion) {
      throw new Error(
        `Unsupported Markdown worker dependency ${packageName}@${actualVersion}; ` +
          `expected ${packageName}@${expectedVersion}. Review the worker compatibility boundary.`,
      )
    }
  }
}

const unavailableExportSource = (exportName: DeadExportTarget['exportName']) => {
  const message =
    `Plate export "${exportName}" is unavailable in the Markdown worker runtime. ` +
    'Update the worker compatibility boundary before using it.'

  return [
    `const ${exportName} = new Proxy(Object.create(null), {`,
    `  get() { throw new Error(${JSON.stringify(message)}); },`,
    `  set() { throw new Error(${JSON.stringify(message)}); }`,
    '});',
  ].join('\n')
}

const replaceTargetRegion = (code: string, target: DeadExportTarget) => {
  const startMarker = `//#region ${target.region}`
  const start = code.indexOf(startMarker)
  const endMarker = '//#endregion'
  const end = start < 0 ? -1 : code.indexOf(endMarker, start + startMarker.length)
  const declaration = `const ${target.exportName} =`

  const sourceRegion = start < 0 || end < 0 ? '' : code.slice(start, end)
  if (start < 0 || end < 0 || !sourceRegion.includes(declaration)) {
    throw new Error(
      `${target.packageName} worker boundary could not isolate ${target.exportName}. ` +
        'Review the upgraded package before building the Markdown worker.',
    )
  }
  const actualHash = hashRegion(sourceRegion)
  if (actualHash !== target.expectedRegionHash) {
    throw new Error(
      `${target.packageName} worker boundary signature changed for ${target.exportName} ` +
        `(${actualHash}). Review the package source before building the Markdown worker.`,
    )
  }

  const replacement = `${startMarker}\n${unavailableExportSource(target.exportName)}\n\n`
  return `${code.slice(0, start)}${replacement}${code.slice(end)}`
}

export const transformPlateMarkdownWorkerDependency = (code: string, id: string) => {
  const normalizedId = normalizeId(id)
  const target = deadExportTargets.find(({ idFragment }) => normalizedId.includes(idFragment))
  if (!target) return null

  return { code: replaceTargetRegion(code, target), exportName: target.exportName }
}

/**
 * Plate 53.3.15 builds renderer plugins at module scope in otherwise pure
 * Markdown/date modules. This worker-only transform removes exactly those two
 * dead exports. Missing markers fail the build so Plate upgrades are reviewed.
 */
export const plateMarkdownDeadExportsPlugin = (): PluginOption => {
  const transformed = new Set<DeadExportTarget['exportName']>()
  let usesPlateMarkdown = false

  return {
    buildStart() {
      transformed.clear()
      usesPlateMarkdown = false
      assertPlateMarkdownWorkerVersions(readPlateMarkdownWorkerVersions())
    },
    buildEnd(error) {
      if (error || !usesPlateMarkdown) return
      for (const { exportName } of deadExportTargets) {
        if (!transformed.has(exportName)) {
          this.error(
            `Plate worker boundary did not transform ${exportName}. ` +
              'Review the package import graph before building the Markdown worker.',
          )
        }
      }
    },
    enforce: 'pre',
    name: 'plate-markdown-worker-dead-exports',
    transform(code, id) {
      const normalizedId = normalizeId(id)
      if (normalizedId.includes('/@platejs/markdown/')) usesPlateMarkdown = true
      const result = transformPlateMarkdownWorkerDependency(code, normalizedId)
      if (!result) return null
      transformed.add(result.exportName)
      return { code: result.code, map: null }
    },
  }
}
