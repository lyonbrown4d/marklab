import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readJson = <Value>(path: string): Value =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as Value

describe('PDF.js worker dependency contract', () => {
  it('keeps the renderer and worker on the same installed PDF.js version', () => {
    const appPackage = readJson<{ dependencies: Record<string, string> }>('package.json')
    const appRequire = createRequire(resolve(process.cwd(), 'package.json'))
    const reactPdfRequire = createRequire(appRequire.resolve('react-pdf/package.json'))
    const workerPackage = readJson<{ version: string }>(
      appRequire.resolve('pdfjs-dist/package.json'),
    )
    const rendererPackage = readJson<{ version: string }>(
      reactPdfRequire.resolve('pdfjs-dist/package.json'),
    )
    const expectedVersion = workerPackage.version
    const lockfile = readFileSync(resolve(process.cwd(), 'pnpm-lock.yaml'), 'utf8')
    const lockedVersions = [...lockfile.matchAll(/^ {2}pdfjs-dist@([^:]+):$/gm)].map(
      ([, version]) => version,
    )

    expect(appPackage.dependencies['pdfjs-dist']).toBe(expectedVersion)
    expect(rendererPackage.version).toBe(expectedVersion)
    expect(new Set(lockedVersions)).toEqual(new Set([expectedVersion]))
  })
})
