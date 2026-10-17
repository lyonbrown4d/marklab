import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const fileText = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

describe('Windows Authenticode availability and Tauri artifact verification', () => {
  it('keeps unconfigured OS signing distinct from Tauri updater signing', () => {
    const workflow = fileText('../../.github/workflows/release.yml')
    const native = JSON.parse(fileText('../../src-tauri/tauri.conf.json')) as {
      bundle: { windows?: { certificateThumbprint?: string; signCommand?: string } }
    }
    const release = parse(workflow) as {
      jobs: { build: { steps: { uses?: string; env?: Record<string, string> }[] } }
    }
    const action = release.jobs.build.steps.find(
      (step) => step.uses === 'tauri-apps/tauri-action@v1',
    )
    expect(native.bundle.windows?.certificateThumbprint).toBeUndefined()
    expect(native.bundle.windows?.signCommand).toBeUndefined()
    expect(action?.env?.TAURI_SIGNING_PRIVATE_KEY).toBe('${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}')
    expect(fileText('../../docs/release.md')).toContain(
      'Windows Authenticode signing is not configured',
    )
  })

  it('verifies the native executable and every available NSIS/MSI installer using Windows SDK tools', () => {
    const verifier = fileText('../../scripts/verify-windows-signatures.ps1')
    const manifest = fileText('../../src-tauri/Cargo.toml')
    expect(manifest).toContain('name = "marklab-desktop"')
    expect(verifier).toContain("'marklab-desktop.exe'")
    expect(verifier).toContain("'bundle'")
    expect(verifier).toContain("@('nsis', 'msi')")
    expect(verifier).toContain("'*.exe'")
    expect(verifier).toContain("'*.msi'")
    expect(verifier).toContain('$installerFiles.Count -eq 0')
    expect(verifier).toContain('$files.Count -gt 1')
    expect(verifier).toContain('Windows Kits\\10\\bin')
    expect(verifier).toContain("'verify', '/pa', '/all', '/tw', '/v'")
    expect(verifier).not.toMatch(/electron-builder|ELECTRON_BUILDER_CACHE|win-unpacked/)
  })

  it('fails unsigned, invalid, non-timestamped, missing, or stale ambiguous artifact sets', () => {
    const verifier = fileText('../../scripts/verify-windows-signatures.ps1')
    expect(verifier).toContain('Get-AuthenticodeSignature -LiteralPath $target')
    expect(verifier).toContain("$signature.Status -ne 'Valid'")
    expect(verifier).toContain('$signature.TimeStamperCertificate')
    expect(verifier).toContain('missing a trusted timestamp')
    expect(verifier).toContain('$LASTEXITCODE -ne 0')
    expect(verifier).toContain('-PathType Leaf')
    const gitignore = fileText('../../.gitignore')
    expect(gitignore).toContain('*.pfx')
    expect(gitignore).toContain('*.p12')
  })
})
