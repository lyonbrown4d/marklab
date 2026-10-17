import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const fileText = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string

describe('Windows Authenticode and retained local Electron signing contract', () => {
  it('keeps Windows OS signing unconfigured while preserving Tauri updater signing', () => {
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
    expect(workflow).not.toContain('WINDOWS_CSC_LINK')
    expect(workflow).not.toContain('WINDOWS_CSC_KEY_PASSWORD')
  })

  it('selects and validates a certificate from a local Windows store', () => {
    const packageJson = fileText('../../package.json')
    const packager = fileText('../../scripts/package-signed-windows.ps1')

    const scripts = (JSON.parse(packageJson) as { scripts: Record<string, string> }).scripts
    expect(scripts['electron:dist:win:signed']).toContain('scripts/package-signed-windows.ps1')
    expect(scripts['dist:win']).toBe('moon run desktop:dist-win')
    expect(packager).toContain('MARKLAB_WINDOWS_CERTIFICATE_SHA1')
    expect(packager).toContain('Cert:\\CurrentUser\\My')
    expect(packager).toContain('Cert:\\LocalMachine\\My')
    expect(packager).toContain('HasPrivateKey')
    expect(packager).toContain('1.3.6.1.5.5.7.3.3')
    expect(packager).toContain('forceCodeSigning=true')
    expect(packager).toContain('certificateSha1=')
  })

  it('requires SHA-256, RFC 3161 timestamping, and verifies both executables', () => {
    const packageJson = fileText('../../package.json')
    const verifier = fileText('../../scripts/verify-windows-signatures.ps1')

    expect(packageJson).toContain('signingHashAlgorithms')
    expect(packageJson).toContain('sha256')
    expect(packageJson).toContain('rfc3161TimeStampServer')
    expect(verifier).toContain('signtool.exe')
    expect(verifier).toContain("'verify', '/pa', '/all', '/tw', '/v'")
    expect(verifier).toContain('Get-AuthenticodeSignature')
    expect(verifier).toContain("'*-setup.exe'")
    expect(verifier).toContain('Marklab.exe')
    expect(verifier).toContain("$signature.Status -ne 'Valid'")
    expect(verifier).toContain('$signature.TimeStamperCertificate')
    expect(verifier).toContain('missing a trusted timestamp')
  })

  it('keeps private-key containers out of version control', () => {
    const gitignore = fileText('../../.gitignore')

    expect(gitignore).toContain('*.pfx')
    expect(gitignore).toContain('*.p12')
  })
})
