import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  initializeWorkspaceUserGuide,
  workspaceUserGuideAssetsPath,
  workspaceUserGuideLocale,
} from '@electron/services/workspace/workspaceUserGuide'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

const fixture = async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-user-guide-'))
  roots.push(directory)
  const assetsPath = path.join(directory, 'assets')
  const userDataPath = path.join(directory, 'profile')
  await fs.mkdir(userDataPath)
  for (const locale of ['zh-CN', 'en-US']) {
    const source = path.join(assetsPath, locale)
    await fs.mkdir(path.join(source, 'User Guide'), { recursive: true })
    await fs.writeFile(path.join(source, 'Home.md'), `# Home ${locale}\n`)
    await fs.writeFile(path.join(source, 'User Guide', 'Start.md'), `# Guide ${locale}\n`)
    await fs.writeFile(path.join(source, 'User Guide', 'Writing.md'), '# Writing\n')
  }
  const options = { assetsPath, userDataPath, locale: 'zh-CN' as const }
  return {
    options,
    root: path.join(userDataPath, 'workspace'),
    guide: path.join(userDataPath, 'workspace', 'User Guide'),
    state: path.join(userDataPath, 'workspace-user-guide.json'),
  }
}

describe('default workspace user guide', () => {
  it('seeds the selected language into the default workspace and completes once', async () => {
    const f = await fixture()
    await initializeWorkspaceUserGuide({ ...f.options, locale: 'en-US' })
    expect(await fs.readFile(path.join(f.root, 'Home.md'), 'utf8')).toBe('# Home en-US\n')
    expect(await fs.readFile(path.join(f.guide, 'Start.md'), 'utf8')).toBe('# Guide en-US\n')
    expect(JSON.parse(await fs.readFile(f.state, 'utf8'))).toEqual({
      version: 1,
      status: 'done',
      locale: 'en-US',
    })
    expect(await fs.readdir(f.options.userDataPath)).toEqual([
      'workspace',
      'workspace-user-guide.json',
    ])
  })

  it('keeps edits and deletions after restart even when shipped content or language changes', async () => {
    const f = await fixture()
    await initializeWorkspaceUserGuide(f.options)
    await fs.writeFile(path.join(f.guide, 'Start.md'), '# My notes\n')
    await fs.rm(path.join(f.guide, 'Writing.md'))
    await fs.rm(path.join(f.root, 'Home.md'))
    await fs.rm(f.options.assetsPath, { recursive: true })
    await initializeWorkspaceUserGuide({ ...f.options, locale: 'en-US' })
    expect(await fs.readFile(path.join(f.guide, 'Start.md'), 'utf8')).toBe('# My notes\n')
    expect(await fs.readdir(f.guide)).toEqual(['Start.md'])
    await expect(fs.stat(path.join(f.root, 'Home.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    await fs.rm(f.guide, { recursive: true })
    await initializeWorkspaceUserGuide(f.options)
    await expect(fs.stat(f.guide)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['Home.md', 'home.md'])('preserves an existing %s and unrelated notes', async (name) => {
    const f = await fixture()
    await fs.mkdir(f.root)
    await fs.writeFile(path.join(f.root, name), '# My existing homepage\n')
    await fs.writeFile(path.join(f.root, 'Notes.md'), '# Existing notes\n')
    await initializeWorkspaceUserGuide(f.options)
    expect(await fs.readFile(path.join(f.root, name), 'utf8')).toBe('# My existing homepage\n')
    expect(await fs.readFile(path.join(f.root, 'Notes.md'), 'utf8')).toBe('# Existing notes\n')
    expect((await fs.readdir(f.root)).filter((file) => file.toLowerCase() === 'home.md')).toEqual([
      name,
    ])
    expect(await fs.readdir(f.guide)).toHaveLength(2)
  })

  it.each(['directory', 'file', 'symlink'])('does not claim an existing guide %s', async (kind) => {
    const f = await fixture()
    await fs.mkdir(f.root)
    if (kind === 'directory') {
      await fs.mkdir(f.guide)
      await fs.writeFile(path.join(f.guide, 'Mine.md'), '# Mine\n')
    } else if (kind === 'file') {
      await fs.writeFile(f.guide, 'user owned')
    } else {
      await fs.symlink(path.join(f.options.assetsPath, 'en-US', 'User Guide'), f.guide, 'dir')
    }
    await initializeWorkspaceUserGuide(f.options)
    expect(await fs.readdir(f.root)).toEqual(['User Guide'])
    expect(JSON.parse(await fs.readFile(f.state, 'utf8')).status).toBe('done')
    if (kind === 'directory') expect(await fs.readdir(f.guide)).toEqual(['Mine.md'])
    if (kind === 'file') expect(await fs.readFile(f.guide, 'utf8')).toBe('user owned')
    if (kind === 'symlink') expect((await fs.lstat(f.guide)).isSymbolicLink()).toBe(true)
  })

  it('retries an interrupted copy, retaining its language and preserving already edited files', async () => {
    const f = await fixture()
    const realCopy = fs.cp.bind(fs)
    vi.spyOn(fs, 'cp')
      .mockImplementationOnce(async (_source, destination) => {
        await fs.writeFile(path.join(String(destination), 'Start.md'), '# My partial edit\n')
        throw new Error('copy interrupted')
      })
      .mockImplementation(realCopy)
    await expect(initializeWorkspaceUserGuide(f.options)).rejects.toThrow('copy interrupted')
    expect(JSON.parse(await fs.readFile(f.state, 'utf8')).status).toBe('pending')
    await initializeWorkspaceUserGuide({ ...f.options, locale: 'en-US' })
    expect(await fs.readFile(path.join(f.guide, 'Start.md'), 'utf8')).toBe('# My partial edit\n')
    expect(await fs.readFile(path.join(f.root, 'Home.md'), 'utf8')).toBe('# Home zh-CN\n')
    expect(await fs.readFile(path.join(f.guide, 'Writing.md'), 'utf8')).toBe('# Writing\n')
  })

  it('leaves a missing or malformed bundle retryable before claiming a destination', async () => {
    const f = await fixture()
    const source = path.join(f.options.assetsPath, 'zh-CN', 'User Guide')
    await fs.rm(source, { recursive: true })
    await expect(initializeWorkspaceUserGuide(f.options)).rejects.toMatchObject({ code: 'ENOENT' })
    await fs.writeFile(source, 'not a directory')
    await expect(initializeWorkspaceUserGuide(f.options)).rejects.toThrow('not a directory')
    await expect(fs.stat(f.state)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.stat(f.root)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a symlink default root without writing into its target', async () => {
    const f = await fixture()
    const target = path.join(f.options.userDataPath, 'other-workspace')
    await fs.mkdir(target)
    await fs.symlink(target, f.root, 'dir')
    await expect(initializeWorkspaceUserGuide(f.options)).rejects.toThrow(
      'regular workspace directory',
    )
    expect(await fs.readdir(target)).toEqual([])
  })

  it.each(['directory', 'symlink'])('rejects a %s state path', async (kind) => {
    const f = await fixture()
    if (kind === 'directory') await fs.mkdir(f.state)
    else await fs.symlink(path.join(f.options.assetsPath, 'zh-CN', 'Home.md'), f.state)
    await expect(initializeWorkspaceUserGuide(f.options)).rejects.toThrow(
      'state is not a regular file',
    )
  })

  it.each([
    null,
    [],
    {},
    { version: 2 },
    { version: 1, status: 'bad' },
    { version: 1, status: 'done', locale: 'fr' },
  ])('rejects invalid state %j without copying', async (state) => {
    const f = await fixture()
    await fs.writeFile(f.state, JSON.stringify(state))
    await expect(initializeWorkspaceUserGuide(f.options)).rejects.toThrow(
      'Invalid user guide state',
    )
    await expect(fs.stat(f.root)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['removed', 'symlink', 'file'])(
    'safely handles a %s destination on retry',
    async (kind) => {
      const f = await fixture()
      await fs.writeFile(
        f.state,
        JSON.stringify({ version: 1, status: 'pending', locale: 'zh-CN' }),
      )
      await fs.mkdir(f.root)
      if (kind === 'symlink')
        await fs.symlink(path.join(f.options.assetsPath, 'en-US', 'User Guide'), f.guide, 'dir')
      if (kind === 'file') await fs.writeFile(f.guide, 'mine')
      if (kind === 'removed') {
        await initializeWorkspaceUserGuide(f.options)
        expect(await fs.readdir(f.guide)).toHaveLength(2)
      } else await expect(initializeWorkspaceUserGuide(f.options)).rejects.toThrow()
    },
  )

  it('propagates destination errors and keeps atomic completion failures retryable', async () => {
    const f = await fixture()
    const realRename = fs.rename.bind(fs)
    vi.spyOn(fs, 'rename')
      .mockImplementationOnce(realRename)
      .mockRejectedValueOnce(new Error('disk full'))
    await expect(initializeWorkspaceUserGuide(f.options)).rejects.toThrow('disk full')
    expect(await fs.readdir(f.options.userDataPath)).toEqual([
      'workspace',
      'workspace-user-guide.json',
    ])
    expect(JSON.parse(await fs.readFile(f.state, 'utf8')).status).toBe('pending')
    await initializeWorkspaceUserGuide(f.options)
    expect(JSON.parse(await fs.readFile(f.state, 'utf8')).status).toBe('done')
  })

  it('keeps a failed initial state publication retryable without claiming the guide folder', async () => {
    const f = await fixture()
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('initial state denied'))
    await expect(initializeWorkspaceUserGuide(f.options)).rejects.toThrow('initial state denied')
    await expect(fs.stat(f.guide)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.stat(f.state)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await fs.readdir(f.options.userDataPath)).toEqual(['workspace'])
    await initializeWorkspaceUserGuide(f.options)
    expect(await fs.readdir(f.guide)).toHaveLength(2)
  })

  it('propagates state access, guide creation and home copy failures', async () => {
    const f = await fixture()
    vi.spyOn(fs, 'lstat').mockRejectedValueOnce(new Error('state denied'))
    await expect(initializeWorkspaceUserGuide(f.options)).rejects.toThrow('state denied')
    vi.restoreAllMocks()
    const realMkdir = fs.mkdir.bind(fs)
    vi.spyOn(fs, 'mkdir').mockImplementation(async (target, options) => {
      if (String(target) === f.guide) throw new Error('guide denied')
      return realMkdir(target, options)
    })
    await expect(initializeWorkspaceUserGuide(f.options)).rejects.toThrow('guide denied')
    vi.restoreAllMocks()
    vi.spyOn(fs, 'copyFile').mockRejectedValueOnce(new Error('home denied'))
    await expect(initializeWorkspaceUserGuide(f.options)).rejects.toThrow('home denied')
    vi.restoreAllMocks()
    await initializeWorkspaceUserGuide(f.options)
    expect(JSON.parse(await fs.readFile(f.state, 'utf8')).status).toBe('done')
  })
})

describe('guide locale and packaged resource path', () => {
  it.each([
    [{ state: { locale: 'en-US' } }, 'zh-CN', 'en-US'],
    [{ state: { locale: 'zh-CN' } }, 'en-GB', 'zh-CN'],
    [null, 'en-GB', 'en-US'],
    [{ state: { locale: 42 } }, 'EN-us', 'en-US'],
    [{ state: {} }, 'fr-FR', 'zh-CN'],
  ])('chooses persisted preference or system fallback', (preferences, system, expected) => {
    expect(workspaceUserGuideLocale(preferences, system)).toBe(expected)
  })

  it('uses resources outside asar in a package and the repo in both development launch modes', () => {
    const root = path.resolve('fixture-project')
    const resourcesPath = path.join(root, 'installed', 'Resources')
    expect(
      workspaceUserGuideAssetsPath({
        appPath: `${resourcesPath}/app.asar`,
        isPackaged: true,
        resourcesPath,
      }),
    ).toBe(path.join(resourcesPath, 'workspace-guide'))
    for (const appPath of [root, path.join(root, 'dist-electron')]) {
      expect(workspaceUserGuideAssetsPath({ appPath, isPackaged: false, resourcesPath })).toBe(
        path.join(root, 'resources', 'workspace-guide'),
      )
    }
  })
})
