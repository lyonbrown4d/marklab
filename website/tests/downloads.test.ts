import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseReleases } from '#site/lib/releases'
import { getDownload, platforms } from '#site/lib/downloads'
import { localPath } from '#site/lib/links'

const fixture = (
  version: string,
  filenames: string[],
  overrides: Record<string, unknown> = {},
) => ({
  tag_name: `app-v${version}`,
  name: `Marklab ${version}`,
  draft: false,
  prerelease: false,
  published_at: '2026-10-15T06:20:49Z',
  html_url: `https://github.com/lyonbrown4d/marklab/releases/tag/app-v${version}`,
  assets: filenames.map((name) => ({
    name,
    browser_download_url: `https://github.com/lyonbrown4d/marklab/releases/download/app-v${version}/${name}`,
    state: 'uploaded',
    size: 134837312,
  })),
  ...overrides,
})

test('selects newest available release separately for macOS and Windows', () => {
  const releases = parseReleases([
    fixture('0.2.4', ['Marklab-0.2.4-win-x64-setup.exe']),
    fixture('0.2.7', ['Marklab-0.2.7-mac-arm64.dmg']),
  ])
  assert.equal(getDownload(releases, 'mac-arm64')?.version, '0.2.7')
  assert.equal(getDownload(releases, 'win-x64')?.version, '0.2.4')
})

test('sorts semantic versions numerically and rejects draft and prerelease downloads', () => {
  const releases = parseReleases([
    fixture('0.2.9', ['Marklab-0.2.9-mac-arm64.dmg']),
    fixture('0.2.10', ['Marklab-0.2.10-mac-arm64.dmg']),
    fixture('0.3.0', ['Marklab-0.3.0-mac-arm64.dmg'], { draft: true }),
    fixture('0.4.0', ['Marklab-0.4.0-mac-arm64.dmg'], { prerelease: true }),
  ])
  assert.equal(releases.length, 2)
  assert.equal(getDownload(releases, 'mac-arm64')?.version, '0.2.10')
})

test('never invents a download or accepts a mismatched artifact version', () => {
  const releases = parseReleases([fixture('0.2.7', ['Marklab-0.2.6-mac-arm64.dmg'])])
  assert.equal(getDownload(releases, 'mac-arm64'), null)
  assert.equal(getDownload([], 'linux-x64'), null)
})

test('supports Apple Silicon only and does not offer Intel or universal builds', () => {
  const releases = parseReleases([
    fixture('0.2.7', ['Marklab-0.2.7-mac-x64.dmg', 'Marklab-0.2.7-mac-universal.dmg']),
  ])
  assert.equal(getDownload(releases, 'mac-arm64'), null)
  assert.deepEqual(platforms, ['mac-arm64', 'win-x64', 'linux-x64'])
})

test('supports the actual Linux x86_64 and earlier Windows installer names', () => {
  const releases = parseReleases([
    fixture('0.2.0', ['Marklab-0.2.0-linux-x86_64.AppImage', 'Marklab-0.2.0-win-x64.exe']),
  ])
  assert.equal(getDownload(releases, 'linux-x64')?.version, '0.2.0')
  assert.equal(getDownload(releases, 'win-x64')?.filename, 'Marklab-0.2.0-win-x64.exe')
})

test('resolves Tauri installers and preserves the published asset metadata', () => {
  const filenames = {
    'mac-arm64': 'Marklab_0.2.8_aarch64.dmg',
    'win-x64': 'Marklab_0.2.8_x64-setup.exe',
    'linux-x64': 'marklab_0.2.8_amd64.AppImage',
  }
  const release = fixture('0.2.8', Object.values(filenames))
  const releases = parseReleases([release])
  for (const platform of platforms) {
    const asset = release.assets.find((entry) => entry.name === filenames[platform])!
    assert.deepEqual(getDownload(releases, platform), {
      platform,
      version: '0.2.8',
      url: asset.browser_download_url,
      filename: asset.name,
      size: asset.size,
      releaseUrl: release.html_url,
    })
  }
  const productNameRelease = parseReleases([fixture('0.2.8', ['Marklab_0.2.8_amd64.AppImage'])])
  assert.equal(
    getDownload(productNameRelease, 'linux-x64')?.filename,
    'Marklab_0.2.8_amd64.AppImage',
  )
})

test('selects the latest available installer across Tauri and Electron releases', () => {
  const releases = parseReleases([
    fixture('0.2.7', [
      'Marklab-0.2.7-mac-arm64.dmg',
      'Marklab-0.2.7-win-x64-setup.exe',
      'Marklab-0.2.7-linux-x64.AppImage',
    ]),
    fixture('0.2.8', ['Marklab_0.2.8_aarch64.dmg', 'marklab_0.2.8_amd64.AppImage']),
  ])
  assert.equal(getDownload(releases, 'mac-arm64')?.filename, 'Marklab_0.2.8_aarch64.dmg')
  assert.equal(getDownload(releases, 'linux-x64')?.filename, 'marklab_0.2.8_amd64.AppImage')
  assert.equal(getDownload(releases, 'win-x64')?.filename, 'Marklab-0.2.7-win-x64-setup.exe')
})

test('rejects Tauri artifacts with wrong versions, architectures, or auxiliary formats', () => {
  const releases = parseReleases([
    fixture('0.2.8', [
      'Marklab_0.2.7_aarch64.dmg',
      'Marklab_0.2.7_x64-setup.exe',
      'marklab_0.2.7_amd64.AppImage',
      'Marklab_0.2.8_x64.dmg',
      'Marklab_0.2.8_universal.dmg',
      'Marklab_0.2.8_arm64-setup.exe',
      'Marklab_0.2.8_x86-setup.exe',
      'marklab_0.2.8_aarch64.AppImage',
      'marklab_0.2.8_i386.AppImage',
      'Marklab_0.2.8_aarch64.dmg.sig',
      'Marklab_0.2.8_aarch64.app.tar.gz',
      'Marklab_0.2.8_x64-setup.exe.sig',
      'Marklab_0.2.8_x64-setup.exe.blockmap',
      'Marklab_0.2.8_x64-setup.exe.zip',
      'marklab_0.2.8_amd64.AppImage.sig',
      'marklab_0.2.8_amd64.AppImage.tar.gz',
    ]),
  ])
  for (const platform of platforms) assert.equal(getDownload(releases, platform), null)
})

test('rejects untrusted asset and release URLs', () => {
  const invalid = fixture('0.2.7', ['Marklab-0.2.7-mac-arm64.dmg'])
  invalid.assets[0]!.browser_download_url = 'https://example.com/untrusted.dmg'
  assert.throws(() => parseReleases([invalid]))
  assert.throws(() => parseReleases([fixture('0.2.7', [], { html_url: 'javascript:alert(1)' })]))
})

test('keeps all internal links under the GitHub Pages repository base path', () => {
  assert.equal(localPath('/marklab/', '/en/guide/vim/'), '/marklab/en/guide/vim/')
  assert.equal(localPath('/marklab', 'guide/git/'), '/marklab/guide/git/')
  assert.equal(localPath('/marklab/'), '/marklab/')
})
