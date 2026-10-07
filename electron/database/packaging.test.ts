import fs from 'node:fs/promises'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

// eslint-disable-next-line no-restricted-imports -- Root Vite helpers are outside Electron aliases.
import { electronMainExternal } from '../../vite.electron'

describe('SQLite packaging', () => {
  it('externalizes and unpacks the better-sqlite3 native module', async () => {
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8')) as {
      build: { asarUnpack: string[]; files: string[] }
    }
    const pnpmWorkspace = parse(await fs.readFile('pnpm-workspace.yaml', 'utf8')) as {
      onlyBuiltDependencies: string[]
    }

    expect(electronMainExternal).toContain('better-sqlite3')
    expect(pnpmWorkspace.onlyBuiltDependencies).toContain('better-sqlite3')
    expect(packageJson.build.files).toContain('node_modules/better-sqlite3/lib/**/*')
    expect(packageJson.build.files).toContain(
      'node_modules/better-sqlite3/prebuilds/*-${arch}.node',
    )
    expect(packageJson.build.asarUnpack).toContain('node_modules/better-sqlite3/prebuilds/**/*')
  })

  it('loads the native binding and exercises a migrated in-memory query', async () => {
    const { default: Database } = await import('better-sqlite3')
    const database = new Database(':memory:')
    try {
      database.exec('CREATE TABLE smoke_test (value TEXT NOT NULL)')
      database.prepare('INSERT INTO smoke_test(value) VALUES (?)').run('ready')
      expect(database.prepare('SELECT value FROM smoke_test').get()).toEqual({ value: 'ready' })
    } finally {
      database.close()
    }
  })
})
