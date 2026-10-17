import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface ReleaseStep {
  name?: string
  uses?: string
  run?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
}
interface ReleaseWorkflow {
  on: { workflow_dispatch: unknown; push: { tags: string[] } }
  concurrency: { group: string; 'cancel-in-progress': boolean }
  jobs: Record<
    string,
    {
      needs?: string
      strategy?: { matrix: { include: { target: string; bundles: string }[] } }
      steps: ReleaseStep[]
    }
  >
}
const workflow = parse(readFileSync('.github/workflows/release.yml', 'utf8')) as ReleaseWorkflow
const script = resolve('scripts/prepare-tauri-release.ts')
const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version
const directories: string[] = []
const macCredentials = [
  'APPLE_CERTIFICATE',
  'APPLE_CERTIFICATE_PASSWORD',
  'APPLE_SIGNING_IDENTITY',
  'APPLE_ID',
  'APPLE_PASSWORD',
  'APPLE_TEAM_ID',
]
const fixture = (versions: { package?: string; tauri?: string; cargo?: string } = {}) => {
  const directory = mkdtempSync(join(tmpdir(), 'marklab-release-contract-'))
  directories.push(directory)
  mkdirSync(join(directory, 'src-tauri'))
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({ version: versions.package ?? version }),
  )
  writeFileSync(
    join(directory, 'src-tauri/tauri.conf.json'),
    JSON.stringify({ version: versions.tauri ?? version }),
  )
  writeFileSync(
    join(directory, 'src-tauri/Cargo.toml'),
    `[package]\nversion = "${versions.cargo ?? version}"\n`,
  )
  return directory
}
const run = (directory: string, mode: string, overrides: Record<string, string | undefined> = {}) =>
  spawnSync(process.execPath, ['--experimental-strip-types', script, mode], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 3000,
    // Do not inherit developer/CI signing keys or GitHub output paths.
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      NODE_NO_WARNINGS: '1',
      GITHUB_REPOSITORY: 'lyonbrown4d/marklab',
      ...overrides,
    },
  })
const signing = (directory: string) => ({
  TAURI_RELEASE_CONFIG: join(directory, 'release.json'),
  TAURI_SIGNING_PUBLIC_KEY: 'fixture-public-key',
  TAURI_SIGNING_PRIVATE_KEY: 'fixture-private-key-never-export',
})
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('Tauri release workflow contract', () => {
  it('uses the official bundler, exact native targets, and signed updater metadata in a draft', () => {
    expect(workflow.on.push.tags).toEqual(['app-v*'])
    expect(workflow.on).toHaveProperty('workflow_dispatch')
    expect(workflow.jobs.build.needs).toBe('validate')
    expect(workflow.jobs.build.strategy?.matrix.include).toEqual([
      expect.objectContaining({ target: 'x86_64-unknown-linux-gnu', bundles: 'appimage,deb' }),
      expect.objectContaining({ target: 'aarch64-apple-darwin', bundles: 'app,dmg' }),
      expect.objectContaining({ target: 'x86_64-pc-windows-msvc', bundles: 'nsis,msi' }),
    ])
    const action = workflow.jobs.build.steps.find(
      (step) => step.uses === 'tauri-apps/tauri-action@v1',
    )
    expect(action?.with).toMatchObject({
      releaseDraft: true,
      prerelease: false,
      uploadUpdaterJson: true,
      updaterJsonPreferNsis: true,
      uploadWorkflowArtifacts: true,
      tagName: '${{ needs.validate.outputs.tag }}',
    })
    expect(action?.with?.args).toContain('--config')
    expect(action?.env?.TAURI_SIGNING_PRIVATE_KEY).toBe('${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}')
    expect(workflow.jobs.build.steps.some((step) => step.run?.includes('draft=false'))).toBe(false)
  })

  it('preserves serialization, project coverage, renderer regressions and native tests, and macOS verification', () => {
    expect(workflow.concurrency).toEqual({ group: 'release-desktop', 'cancel-in-progress': false })
    expect(workflow.jobs.validate.steps.map((step) => step.run)).toEqual(
      expect.arrayContaining(['pnpm check', 'pnpm test:renderer:e2e']),
    )
    expect(
      workflow.jobs.build.steps.some(
        (step) =>
          step.run ===
          'cargo test --manifest-path src-tauri/Cargo.toml --target ${{ matrix.target }} --lib --locked',
      ),
    ).toBe(true)
    const prepare = workflow.jobs.build.steps.find((step) =>
      step.run?.endsWith('prepare-tauri-release.ts configure'),
    )
    const action = workflow.jobs.build.steps.find(
      (step) => step.uses === 'tauri-apps/tauri-action@v1',
    )
    for (const name of macCredentials) {
      expect(prepare?.env?.[name]).toBe(`\${{ secrets.${name} }}`)
      expect(action?.env?.[name]).toBe(`\${{ secrets.${name} }}`)
    }
    expect(
      workflow.jobs.build.steps.some((step) =>
        step.run?.startsWith('codesign --verify --deep --strict'),
      ),
    ).toBe(true)
    const input = workflow.jobs.validate.steps.find((step) =>
      step.run?.endsWith('prepare-tauri-release.ts validate'),
    )
    expect(input?.env?.REQUESTED_TAG).toBe('${{ inputs.tag }}')
    expect(input?.run).not.toContain('${{ inputs.tag }}')
  })
})

describe('release preparation executed against disposable metadata', () => {
  it('accepts matching stable versions and emits the validated tag', () => {
    const directory = fixture()
    const output = join(directory, 'output.txt')
    const result = run(directory, 'validate', {
      REQUESTED_TAG: `app-v${version}`,
      GITHUB_OUTPUT: output,
    })
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(output, 'utf8')).toBe(`tag=app-v${version}\n`)
  })

  it.each([
    { GITHUB_REPOSITORY: 'another/project' },
    { REQUESTED_TAG: 'app-v0.0.0' },
    { GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'app-v0.0.0' },
    { REQUESTED_TAG: '$(touch injected)' },
  ])('rejects an unrelated repository or invalid release tag: %j', (overrides) => {
    const directory = fixture()
    const result = run(directory, 'validate', overrides)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/Release workflow must run from|Release tag must exactly match/)
    expect(existsSync(join(directory, 'injected'))).toBe(false)
  })

  it.each(['tauri', 'cargo'] as const)(
    'rejects a mismatched %s version before generating configuration',
    (field) => {
      const directory = fixture({ [field]: '0.0.0' })
      const result = run(directory, 'configure', signing(directory))
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('versions must match')
      expect(existsSync(join(directory, 'release.json'))).toBe(false)
    },
  )

  it.each(['TAURI_SIGNING_PUBLIC_KEY', 'TAURI_SIGNING_PRIVATE_KEY'])(
    'requires %s without exposing its counterpart',
    (missing) => {
      const directory = fixture()
      const result = run(directory, 'configure', { ...signing(directory), [missing]: '' })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain(`Missing release configuration: ${missing}`)
      expect(result.stdout + result.stderr).not.toContain('fixture-private-key-never-export')
      expect(existsSync(join(directory, 'release.json'))).toBe(false)
    },
  )

  it.each(macCredentials)('requires macOS signing/notarization credential %s', (missing) => {
    const directory = fixture()
    const credentials = Object.fromEntries(macCredentials.map((name) => [name, `fixture-${name}`]))
    const result = run(directory, 'configure', {
      ...signing(directory),
      ...credentials,
      RELEASE_PLATFORM: 'macos',
      [missing]: '',
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(`Missing release configuration: ${missing}`)
    expect(existsSync(join(directory, 'release.json'))).toBe(false)
  })

  it('writes only public updater configuration and leaves unconfigured source builds unavailable', () => {
    const directory = fixture()
    const credentials = Object.fromEntries(macCredentials.map((name) => [name, `fixture-${name}`]))
    const result = run(directory, 'configure', {
      ...signing(directory),
      ...credentials,
      RELEASE_PLATFORM: 'macos',
    })
    expect(result.status, result.stderr).toBe(0)
    const text = readFileSync(join(directory, 'release.json'), 'utf8')
    expect(JSON.parse(text)).toEqual({
      bundle: { createUpdaterArtifacts: true },
      plugins: {
        updater: {
          pubkey: 'fixture-public-key',
          endpoints: [
            'https://github.com/lyonbrown4d/marklab/releases/latest/download/latest.json',
          ],
        },
      },
    })
    const captured = text + result.stdout + result.stderr
    expect(captured).not.toContain('fixture-private-key-never-export')
    for (const value of Object.values(credentials)) expect(captured).not.toContain(value)
    const source = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as {
      plugins: { updater: unknown }
    }
    expect(source.plugins.updater).toEqual({ pubkey: '', endpoints: [] })
  })
})
