import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Node knowledge runtime build configuration', () => {
  it('does not invoke Cargo or package a native engine resource', async () => {
    const root = process.cwd()
    const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as {
      build: { extraResources?: unknown[] }
      scripts: Record<string, string>
    }
    const moon = await fs.readFile(path.join(root, 'moon.yml'), 'utf8')
    const mise = await fs.readFile(path.join(root, 'mise.toml'), 'utf8')
    const vite = await fs.readFile(path.join(root, 'vite.config.ts'), 'utf8')
    const electronVite = await fs.readFile(path.join(root, 'vite.electron.ts'), 'utf8')

    expect(Object.keys(packageJson.scripts)).not.toContain('knowledge:build')
    expect(JSON.stringify(packageJson.build.extraResources ?? [])).not.toContain('resources/engine')
    expect(moon).not.toMatch(/\bcargo(?:-|\s)/)
    expect(moon).not.toContain('build-knowledge-engine.ts')
    expect(mise).not.toMatch(/^rust\s*=/m)
    expect(vite).toContain('entry: electronMainEntry')
    expect(electronVite).toContain('knowledgeSidecarEntry')
    expect(electronVite).not.toContain('localAiUtilityEntry')
  })
})
