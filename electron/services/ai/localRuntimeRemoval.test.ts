import fs from 'node:fs/promises'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

describe('embedded local AI runtime boundary', () => {
  it('does not ship an embedded llama.cpp runtime or utility entry', async () => {
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8')) as {
      build: { asarUnpack: string[]; files: string[] }
      dependencies: Record<string, string>
    }
    const pnpmWorkspace = parse(await fs.readFile('pnpm-workspace.yaml', 'utf8')) as {
      onlyBuiltDependencies: string[]
    }
    const electronVite = await fs.readFile('vite.electron.ts', 'utf8')

    expect(packageJson.dependencies).not.toHaveProperty('node-llama-cpp')
    expect(pnpmWorkspace.onlyBuiltDependencies).not.toContain('node-llama-cpp')
    expect(JSON.stringify(packageJson.build)).not.toContain('node-llama-cpp')
    expect(electronVite).not.toContain('localAiUtilityEntry')
    expect(electronVite).not.toContain('node-llama-cpp')
  })
})
