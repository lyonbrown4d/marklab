import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const fileText = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

describe('native Rust toolchain contract', () => {
  it('pins release and native checks to the documented minimum compiler', () => {
    const manifest = fileText('../../src-tauri/Cargo.toml')
    const minimum = manifest.match(/^rust-version\s*=\s*"([^"]+)"/m)?.[1]
    expect(minimum).toBe('1.99.1')
    for (const [file, job] of [
      ['../../.github/workflows/native.yml', 'native'],
      ['../../.github/workflows/release.yml', 'build'],
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
