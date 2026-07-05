import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')

const walkSourceFiles = (relativeDirectory: string): string[] => {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory)
  return fs.readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) return walkSourceFiles(relativePath)
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) return [relativePath]
    return []
  })
}

describe('Electron preload/runtime boundary', () => {
  it('exposes only the named Marklab preload API', () => {
    const preloadSource = readText('electron/preload.ts')
    const exposedWorldNames = Array.from(
      preloadSource.matchAll(/contextBridge\.exposeInMainWorld\(\s*['"`]([^'"`]+)['"`]/g),
      (match) => match[1],
    )

    expect(exposedWorldNames).toEqual(['marklabElectron'])
    expect(preloadSource).not.toMatch(/^\s{2}(invoke|send|on|off|removeListener):/m)
    expect(preloadSource).not.toContain('ipcRenderer.send(')
  })

  it('keeps generic command and event bridges behind explicit allowlists', () => {
    const preloadSource = readText('electron/preload.ts')

    expect(preloadSource).toContain('assertAllowedCommand(command)')
    expect(preloadSource).toContain('assertAllowedEvent(eventName)')
    expect(preloadSource).toContain('allowedCommands.has(command)')
    expect(preloadSource).toContain('allowedEvents.has(eventName)')
  })

  it('does not expose generic IPC methods through the renderer runtime type', () => {
    const runtimeSource = readText('src/runtime/electron.ts')

    expect(runtimeSource).not.toMatch(/^\s{2}(invoke|send|on|off|removeListener):/m)
    expect(runtimeSource).toContain('commands?: {')
    expect(runtimeSource).toContain('events?: {')
  })

  it('keeps renderer source files from importing Electron directly', () => {
    const offenders = walkSourceFiles('src').filter((file) => {
      const source = readText(file)
      return /from ['"]electron['"]|require\(['"]electron['"]\)|import\(['"]electron['"]\)/.test(
        source,
      )
    })

    expect(offenders).toEqual([])
  })
})
