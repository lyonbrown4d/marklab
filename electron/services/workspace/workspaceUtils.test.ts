import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { FsStateData } from '@electron/services/workspace/types.js'
import {
  isIgnoredWorkspaceDirectory,
  isPathInsideOrEqual,
  listWorkspaceEntries,
  listWorkspacePathSnapshot,
  stripWindowsNamespacePath,
} from '@electron/services/workspace/workspaceUtils.js'

const tempRoots: string[] = []

const createWorkspaceState = (rootPath: string): FsStateData => ({
  rootKind: 'external',
  rootPath,
  internalRoot: rootPath,
  singleFile: null,
})

const createTempRoot = async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'marklab-workspace-'))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  )
})

describe('listWorkspaceEntries', () => {
  it('includes markdown and calendar files in visible workspace entries', async () => {
    const root = await createTempRoot()
    await fs.mkdir(path.join(root, 'notes'))
    await fs.writeFile(path.join(root, 'notes', 'plan.md'), '# Plan')
    await fs.writeFile(
      path.join(root, 'notes', 'calendar.ics'),
      'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
    )
    await fs.writeFile(path.join(root, 'notes', 'clip.mp3'), '')
    await fs.writeFile(path.join(root, 'notes', 'document.docx'), '')
    await fs.writeFile(path.join(root, 'notes', 'flow.drawio'), '<mxfile></mxfile>')
    await fs.writeFile(path.join(root, 'notes', 'image.png'), '')
    await fs.writeFile(path.join(root, 'notes', 'video.webm'), '')

    const entries = await listWorkspaceEntries(createWorkspaceState(root))

    expect(entries).toEqual([
      { kind: 'folder', name: 'notes', path: 'notes' },
      { kind: 'file', name: 'calendar.ics', path: 'notes/calendar.ics' },
      { kind: 'file', name: 'clip.mp3', path: 'notes/clip.mp3' },
      { kind: 'file', name: 'document.docx', path: 'notes/document.docx' },
      { kind: 'file', name: 'flow.drawio', path: 'notes/flow.drawio' },
      { kind: 'file', name: 'image.png', path: 'notes/image.png' },
      { kind: 'file', name: 'plan.md', path: 'notes/plan.md' },
      { kind: 'file', name: 'video.webm', path: 'notes/video.webm' },
    ])
  })

  it('skips hidden and dependency cache directories without hiding user-named folders', async () => {
    const root = await createTempRoot()
    const ignoredDirectories = ['.hidden', 'node_modules', '__pycache__']
    await Promise.all(
      ignoredDirectories.map(async (directory) => {
        const target = path.join(root, directory)
        await fs.mkdir(target)
        await fs.writeFile(path.join(target, 'generated.ts'), 'export const generated = true')
      }),
    )
    await fs.mkdir(path.join(root, 'src'))
    await fs.mkdir(path.join(root, 'build'))
    await fs.mkdir(path.join(root, 'vendor-notes'))
    await fs.writeFile(path.join(root, 'build', 'release.md'), '# Release')
    await fs.writeFile(path.join(root, 'src', 'main.ts'), 'export const main = true')
    await fs.writeFile(path.join(root, 'vendor-notes', 'review.md'), '# Review')

    const snapshot = await listWorkspacePathSnapshot(createWorkspaceState(root))

    expect(snapshot.entries).toEqual([
      { kind: 'folder', name: 'build', path: 'build' },
      { kind: 'file', name: 'release.md', path: 'build/release.md' },
      { kind: 'folder', name: 'src', path: 'src' },
      { kind: 'file', name: 'main.ts', path: 'src/main.ts' },
      { kind: 'folder', name: 'vendor-notes', path: 'vendor-notes' },
      { kind: 'file', name: 'review.md', path: 'vendor-notes/review.md' },
    ])
    expect(snapshot.knownPaths.paths).toEqual([
      'build',
      'build/release.md',
      'src',
      'src/main.ts',
      'vendor-notes',
      'vendor-notes/review.md',
    ])
  })

  it('includes only allowlisted source dotfiles while keeping hidden directories excluded', async () => {
    const root = await createTempRoot()
    await fs.writeFile(path.join(root, '.editorconfig'), 'root = true')
    await fs.writeFile(path.join(root, '.gitignore'), 'dist')
    await fs.writeFile(path.join(root, '.npmrc'), 'engine-strict=true')
    await fs.writeFile(path.join(root, '.env'), 'SECRET=value')
    await fs.mkdir(path.join(root, '.hidden'))
    await fs.writeFile(path.join(root, '.hidden', '.editorconfig'), 'root = true')

    const snapshot = await listWorkspacePathSnapshot(createWorkspaceState(root))

    expect(snapshot.entries).toEqual([
      { kind: 'file', name: '.editorconfig', path: '.editorconfig' },
      { kind: 'file', name: '.gitignore', path: '.gitignore' },
      { kind: 'file', name: '.npmrc', path: '.npmrc' },
    ])
    expect(snapshot.knownPaths.paths).toEqual(['.editorconfig', '.gitignore', '.npmrc'])
  })
})

describe('isIgnoredWorkspaceDirectory', () => {
  it.each([
    ['node_modules', true],
    ['packages/node_modules', true],
    [String.raw`packages\__PYCACHE__`, true],
    ['apps/Dist', false],
    ['.cache', true],
    ['vendor-notes', false],
    ['build-notes', false],
    ['src', false],
  ])('classifies %s without depending on the host path separator', (directory, expected) => {
    expect(isIgnoredWorkspaceDirectory(directory)).toBe(expected)
  })
})

describe('Windows namespace path helpers', () => {
  it('strips local and UNC namespace prefixes', () => {
    expect(stripWindowsNamespacePath(String.raw`\\?\C:\vault\brief.pdf`)).toBe(
      String.raw`C:\vault\brief.pdf`,
    )
    expect(stripWindowsNamespacePath(String.raw`\\?\UNC\server\share\brief.pdf`)).toBe(
      String.raw`\\server\share\brief.pdf`,
    )
  })

  it('keeps namespaced workspace assets allowed on Windows', () => {
    if (process.platform !== 'win32') return

    expect(isPathInsideOrEqual(String.raw`C:\vault`, String.raw`\\?\C:\vault\brief.pdf`)).toBe(true)
  })
})
