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
