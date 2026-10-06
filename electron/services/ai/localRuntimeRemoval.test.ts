import fs from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

describe('embedded local AI runtime boundary', () => {
  it('does not ship an embedded llama.cpp runtime or utility entry', async () => {
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8')) as {
      build: { asarUnpack: string[]; files: string[] }
      dependencies: Record<string, string>
      pnpm: { onlyBuiltDependencies: string[] }
    }
    const electronVite = await fs.readFile('vite.electron.ts', 'utf8')

    expect(packageJson.dependencies).not.toHaveProperty('node-llama-cpp')
    expect(packageJson.pnpm.onlyBuiltDependencies).not.toContain('node-llama-cpp')
    expect(JSON.stringify(packageJson.build)).not.toContain('node-llama-cpp')
    expect(electronVite).not.toContain('localAiUtilityEntry')
    expect(electronVite).not.toContain('node-llama-cpp')
  })
})
