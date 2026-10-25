import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const fileText = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const fileExists = (file: string) => existsSync(new URL(file, import.meta.url))

describe('native Rust toolchain contract', () => {
  it('pins release and native checks to the documented minimum compiler', () => {
    const manifest = fileText('../../src-tauri/Cargo.toml')
    const minimum = manifest.match(/^rust-version\s*=\s*"([^"]+)"/m)?.[1]
    expect(minimum).toBe('1.99.1')
    for (const file of [
      '../../crates/marklab-document/Cargo.toml',
      '../../crates/marklab-cli/Cargo.toml',
    ]) {
      expect(fileText(file).match(/^rust-version\s*=\s*"([^"]+)"/m)?.[1], file).toBe(minimum)
    }
    expect(fileText('../../rust-toolchain.toml')).toContain(`channel = "${minimum}"`)
    expect(fileExists('../../Cargo.lock')).toBe(true)
    expect(fileExists('../../src-tauri/Cargo.lock')).toBe(false)
    for (const member of ['src-tauri', 'crates/marklab-document', 'crates/marklab-cli']) {
      expect(fileText('../../Cargo.toml')).toContain(`"${member}"`)
    }
    expect(fileText('../../.cargo/config.toml')).toContain('target-dir = "src-tauri/target"')
    for (const [file, job] of [
      ['../../.github/workflows/native.yml', 'native'],
      ['../../.github/workflows/release.yml', 'build'],
      ['../../.github/workflows/cli.yml', 'cli'],
    ]) {
      const workflow = parse(fileText(file)) as {
        jobs: Record<string, { steps: { uses?: string; with?: { toolchain?: string } }[] }>
      }
      const toolchain = workflow.jobs[job].steps.find((step) =>
        step.uses?.startsWith('dtolnay/rust-toolchain@'),
      )
      expect(toolchain?.with?.toolchain, file).toBe(minimum)
    }
    expect(fileText('../../README.md')).toContain(`Rust ${minimum}`)
    expect(fileText('../../docs/tauri-migration.md')).toContain(`Rust ${minimum}`)
  })
})
