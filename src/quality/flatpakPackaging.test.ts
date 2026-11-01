import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const script = resolve('scripts/package-flatpak.ts')
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const directories: string[] = []
const deb = (name = 'marklab', release = version, arch = 'amd64') => {
  const directory = mkdtempSync(join(tmpdir(), 'marklab-flatpak-contract-'))
  directories.push(directory)
  const control = join(directory, 'source/DEBIAN')
  mkdirSync(control, { recursive: true })
  writeFileSync(
    join(control, 'control'),
    `Package: ${name}\nVersion: ${release}\nArchitecture: ${arch}\nMaintainer: Marklab\nDescription: Fixture\n`,
  )
  const artifact = join(directory, 'source package.deb')
  const result = spawnSync(
    'dpkg-deb',
    ['--build', '--root-owner-group', join(directory, 'source'), artifact],
    {
      encoding: 'utf8',
    },
  )
  expect(result.status, result.stderr).toBe(0)
  return artifact
}
const run = (artifact: string) =>
  spawnSync(process.execPath, ['--experimental-strip-types', script, '--deb', artifact], {
    encoding: 'utf8',
    timeout: 10000,
  })

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

// dpkg-deb and Flatpak are Linux packaging tools; other platforms keep their native paths.
const canBuildDeb =
  process.platform === 'linux' &&
  process.arch === 'x64' &&
  spawnSync('dpkg-deb', ['--version'], { stdio: 'ignore' }).status === 0
describe.skipIf(!canBuildDeb)('Flatpak input validation', () => {
  it.each([
    ['unrelated-app', version, 'amd64'],
    ['marklab', '0.0.0', 'amd64'],
    ['marklab', version, 'arm64'],
  ])('rejects incompatible source deb %s %s %s before export', (name, release, arch) => {
    const result = run(deb(name, release, arch))
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain(`Expected marklab ${version} amd64`)
  })

  it('rejects an incomplete CEF bundle even when deb metadata matches', () => {
    const result = run(deb())
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/ENOENT.*usr\/share\/Marklab/)
  })
})
