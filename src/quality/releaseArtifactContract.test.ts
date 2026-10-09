// @ts-expect-error Vitest runs this repository guard in Node; the renderer tsconfig intentionally omits Node module types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = () => readFileSync('.github/workflows/release.yml', 'utf8') as string

describe('desktop release artifact contract', () => {
  it('pins updater builds and publishing to the public stable repository', () => {
    const release = workflow()

    expect(release).toContain("RELEASE_REPOSITORY: 'lyonbrown4d/marklab'")
    expect(release).toContain('-c.publish.owner=lyonbrown4d')
    expect(release).toContain('-c.publish.repo=marklab')
    expect(release).toContain('-c.publish.tagNamePrefix=app-v')
    expect(release).not.toContain('-c.publish.owner=${{ github.repository_owner }}')
    expect(release).not.toContain('-c.publish.repo=${{ github.event.repository.name }}')
  })

  it('validates the updater metadata and supported targets before upload', () => {
    const release = workflow()

    expect(release).toContain('name: Verify Windows updater artifact contract')
    expect(release).toContain("'release/latest.yml'")
    expect(release).toContain("'*-setup.exe'")
    expect(release).toContain('.exe.blockmap')
    expect(release).toContain('name: Verify macOS updater artifact contract')
    expect(release).toContain('release/latest-mac.yml')
    expect(release).toContain('release/*.zip')
    expect(release).toContain('release/*.dmg')
    expect(release).toContain('name: Verify Linux updater artifact contract')
    expect(release).toContain('release/latest-linux.yml')
    expect(release).toContain('release/*.AppImage')
    expect(release).toContain('release/*.deb')
    expect(release).toContain('release/*.tar.gz')
  })

  it('passes manual input through env and validates app-v tags', () => {
    const release = workflow()

    expect(release).toContain('REQUESTED_TAG: ${{ github.event.inputs.tag }}')
    expect(release).toContain('elif [ -n "$REQUESTED_TAG" ]; then')
    expect(release).toContain('package_version="$(node -p')
    expect(release).toContain('[[ ! "$package_version" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+$ ]]')
    expect(release).toContain('expected_tag="app-v${package_version}"')
    expect(release).toContain('if [ "$release_tag" != "$expected_tag" ]; then')
    expect(release).not.toContain('elif [ -n "${{ github.event.inputs.tag }}" ]; then')
  })

  it('serializes release workflows without cancelling an in-progress publication', () => {
    const release = workflow()

    expect(release).toContain('concurrency:')
    expect(release).toContain('group: release-desktop')
    expect(release).toContain('cancel-in-progress: false')
    expect(release.indexOf('concurrency:')).toBeLessThan(release.indexOf('jobs:'))
  })

  it('fails stable releases without macOS signing credentials', () => {
    const release = workflow()

    expect(release).toContain('name: Require macOS signing credentials')
    expect(release).toContain('CSC_LINK: ${{ secrets.CSC_LINK }}')
    expect(release).toContain('if [ -z "$CSC_LINK" ] || [ -z "$CSC_KEY_PASSWORD" ]; then')
    expect(release).toContain('Stable releases require macOS signing credentials.')
    expect(release).toContain('-c.extraMetadata.marklabMacAutoUpdateSupported=true')
    expect(release).toContain('codesign --verify --deep --strict')
    expect(release).not.toContain('Package unsigned macOS for manual download')
    expect(release).not.toContain('rm -f release/latest-mac.yml')
    expect(release).not.toContain('test ! -e release/latest-mac.yml')
  })

  it('keeps the release draft until every asset uploads successfully', () => {
    const release = workflow()
    const createDraft = release.indexOf('name: Create or update draft release')
    const uploadAssets = release.indexOf('gh release upload')
    const publishRelease = release.indexOf('name: Publish verified release')
    const publishMutation = release.indexOf('-F draft=false')

    expect(createDraft).toBeGreaterThan(-1)
    expect(release).toContain('--draft')
    expect(uploadAssets).toBeGreaterThan(createDraft)
    expect(publishRelease).toBeGreaterThan(uploadAssets)
    expect(publishMutation).toBeGreaterThan(uploadAssets)
  })
})
