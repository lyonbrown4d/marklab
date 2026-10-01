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

  it('limits compatibility IPC surfaces to their explicit allowlisted adapters', () => {
    const runtimeSource = readText('src/runtime/electron.ts')

    expect(runtimeSource).toContain('commands: ElectronCommandBridgeApi')
    expect(runtimeSource).toContain('events: ElectronEventBridgeApi')
    expect(runtimeSource).not.toMatch(/^\s{2}(send|on|off|removeListener):/m)
  })

  it('does not keep project-owned deprecated declarations in active code', () => {
    const files = [...walkSourceFiles('electron'), ...walkSourceFiles('src')]
    const deprecatedTag = ['@', 'deprecated'].join('')
    const offenders = files.filter((file) => readText(file).includes(deprecatedTag))

    expect(offenders).toEqual([])
  })

  it('does not retain the retired transitional workspace command map', () => {
    const files = [...walkSourceFiles('electron'), ...walkSourceFiles('src')]
    const retiredSymbol = ['transitional', 'Native', 'Commands'].join('')
    const offenders = files.filter((file) => readText(file).includes(retiredSymbol))

    expect(offenders).toEqual([])
  })

  it('does not retain legacy generic asset command handlers', () => {
    const retiredCommands = [
      ['fs', 'issue', 'asset', 'capability'].join('_'),
      ['fs', 'read', 'asset', 'bytes'].join('_'),
    ]
    const files = [...walkSourceFiles('electron'), ...walkSourceFiles('src')]
    const offenders = files.filter((file) => {
      const source = readText(file)
      return retiredCommands.some((command) => source.includes(command))
    })

    expect(offenders).toEqual([])
  })

  it('keeps AI inline completion off the generic command and event bridges', () => {
    const allowlists = readText('electron/preload/allowlists.ts')
    const genericAiIpc = readText('electron/ipc/ai.ts')
    const completionApi = readText('src/services/aiCompletionApi.ts')

    expect(allowlists).not.toContain('ai_start_inline_completion')
    expect(completionApi).not.toContain("from '@/runtime/ipc'")
    expect(completionApi).not.toContain("from '@/runtime/events'")
    expect(completionApi).toContain('getElectronRuntime().aiCompletion')
    expect(genericAiIpc).not.toContain('AiInlineCompletionServiceContract')
    expect(genericAiIpc).not.toContain('completionService')
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

  it('keeps the preload global behind the renderer runtime adapter', () => {
    const offenders = walkSourceFiles('src').filter((file) => {
      if (path.normalize(file) === path.normalize('src/runtime/electron.ts')) return false
      return readText(file).includes('marklabElectron')
    })

    expect(offenders).toEqual([])
  })
})
