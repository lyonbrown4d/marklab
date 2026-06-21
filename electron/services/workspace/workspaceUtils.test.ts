import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { FsStateData } from '@electron/services/workspace/types.js'
import { listWorkspaceEntries } from '@electron/services/workspace/workspaceUtils.js'

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
})
