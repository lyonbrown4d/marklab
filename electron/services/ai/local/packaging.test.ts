import fs from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

// eslint-disable-next-line no-restricted-imports -- Root Vite helpers are outside Electron aliases.
import { electronMainExternal } from '../../../../vite.electron.js'

describe('local AI packaging', () => {
  it('externalizes node-llama-cpp and ships its native packages outside ASAR', async () => {
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8')) as {
      build: { asarUnpack: string[]; files: string[] }
      pnpm: { onlyBuiltDependencies: string[] }
    }

    expect(electronMainExternal).toContain('node-llama-cpp')
    expect(packageJson.pnpm.onlyBuiltDependencies).toContain('node-llama-cpp')
    expect(packageJson.build.files).toContain('node_modules/node-llama-cpp/**/*')
    expect(packageJson.build.files).toContain('node_modules/@node-llama-cpp/${os}-${arch}/**/*')
    expect(packageJson.build.asarUnpack).toContain(
      'node_modules/@node-llama-cpp/${os}-${arch}/**/*',
    )
    expect(packageJson.build.files.join('\n')).not.toContain('-cuda')
    expect(packageJson.build.files.join('\n')).not.toContain('-vulkan')
  })
})
