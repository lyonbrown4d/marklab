import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readJson = <Value>(path: string): Value =>
  JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as Value

describe('PDF.js worker dependency contract', () => {
  it('keeps the renderer and worker on the react-pdf PDF.js version', () => {
    const appPackage = readJson<{ dependencies: Record<string, string> }>('package.json')
    const reactPdfPackage = readJson<{ dependencies: Record<string, string> }>(
      'node_modules/react-pdf/package.json',
    )
    const expectedVersion = reactPdfPackage.dependencies['pdfjs-dist']
    const lockfile = readFileSync(resolve(process.cwd(), 'pnpm-lock.yaml'), 'utf8')
    const lockedVersions = [...lockfile.matchAll(/^ {2}pdfjs-dist@([^:]+):$/gm)].map(
      ([, version]) => version,
    )

    expect(appPackage.dependencies['pdfjs-dist']).toBe(expectedVersion)
    expect(new Set(lockedVersions)).toEqual(new Set([expectedVersion]))
  })
})
