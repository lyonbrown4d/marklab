import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'
import {
  initializeWorkspaceUserGuide,
  workspaceUserGuideAssetsPath,
} from '@electron/services/workspace/workspaceUserGuide'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const assets = path.join(repo, 'resources', 'workspace-guide')
const chapters = [
  '00-Start-Here.md',
  '01-Writing.md',
  '02-Links-and-Map.md',
  '03-Search-and-Tasks.md',
  '04-Workspaces.md',
  '05-Sync-and-History.md',
  '06-More-Tools.md',
]
const parser = new MarkdownIt()

describe('shipped user guide resources', () => {
  it.each(['zh-CN', 'en-US'] as const)(
    'ships every %s chapter with resolvable local links',
    async (locale) => {
      const root = path.join(assets, locale)
      expect((await fs.readdir(path.join(root, 'User Guide'))).sort()).toEqual([...chapters].sort())
      let linkCount = 0
      for (const file of [
        'Home.md',
        ...chapters.map((chapter) => path.join('User Guide', chapter)),
      ]) {
        const content = await fs.readFile(path.join(root, file), 'utf8')
        expect(content.length).toBeGreaterThan(100)
        const tokens = parser.parse(content, {}).flatMap((token) => token.children ?? [])
        for (const token of tokens.filter((token) => token.type === 'link_open')) {
          const href = String(token.attrGet('href'))
          expect(href).not.toMatch(/^[a-z]+:/i)
          const resolved = path.resolve(
            root,
            path.dirname(file),
            decodeURIComponent(href.split('#')[0]!),
          )
          expect(path.relative(root, resolved)).not.toMatch(/^\.\./)
          expect((await fs.stat(resolved)).isFile()).toBe(true)
          linkCount += 1
        }
      }
      expect(linkCount).toBeGreaterThan(25)
    },
  )

  it('copies both locales into the configured package resources and initializes from that layout', async () => {
    const config = JSON.parse(await fs.readFile(path.join(repo, 'package.json'), 'utf8'))
    const resource = config.build.extraResources.find(
      (value: { from: string }) => value.from === 'resources/workspace-guide',
    )
    expect(resource).toEqual({ from: 'resources/workspace-guide', to: 'workspace-guide' })
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-packaged-guide-'))
    try {
      const resourcesPath = path.join(profile, 'Resources')
      const packagedAssets = workspaceUserGuideAssetsPath({
        appPath: path.join(resourcesPath, 'app.asar'),
        isPackaged: true,
        resourcesPath,
      })
      await fs.cp(path.join(repo, resource.from), path.join(resourcesPath, resource.to), {
        recursive: true,
      })
      for (const locale of ['zh-CN', 'en-US'] as const) {
        const userDataPath = path.join(profile, locale)
        await fs.mkdir(userDataPath)
        await initializeWorkspaceUserGuide({ assetsPath: packagedAssets, userDataPath, locale })
        expect(await fs.readFile(path.join(userDataPath, 'workspace', 'Home.md'), 'utf8')).toBe(
          await fs.readFile(path.join(assets, locale, 'Home.md'), 'utf8'),
        )
        expect(await fs.readdir(path.join(userDataPath, 'workspace', 'User Guide'))).toHaveLength(7)
      }
    } finally {
      await fs.rm(profile, { recursive: true, force: true })
    }
  })
})
