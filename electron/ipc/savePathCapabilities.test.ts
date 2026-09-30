import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearSavePathCapabilitiesForTest,
  commitSavePathCapability,
  consumeSavePathCapability,
  issueSavePathCapability,
  verifySavePathCapability,
} from '@electron/ipc/savePathCapabilities.js'

let root = ''

describe('save path capabilities', () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-save-capability-'))
  })

  afterEach(async () => {
    await clearSavePathCapabilitiesForTest()
    await fs.rm(root, { recursive: true, force: true })
  })

  it('binds a chosen path to one renderer and consumes it once', async () => {
    const chosen = path.join(root, 'notes.pdf')
    await issueSavePathCapability(7, chosen)

    await expect(consumeSavePathCapability(8, chosen)).rejects.toThrow('not authorized')
    await expect(consumeSavePathCapability(7, chosen)).resolves.toMatchObject({
      outputPath: chosen,
    })
    await expect(consumeSavePathCapability(7, chosen)).rejects.toThrow('not authorized')
  })

  it('normalizes path aliases before matching', async () => {
    const chosen = path.join(root, 'notes.docx')
    await issueSavePathCapability(4, chosen)

    await expect(
      consumeSavePathCapability(4, path.join(root, 'nested', '..', 'notes.docx')),
    ).resolves.toMatchObject({ outputPath: chosen })
  })

  it('rejects a target that changed after the dialog authorization', async () => {
    const chosen = path.join(root, 'notes.pdf')
    await fs.writeFile(chosen, 'old')
    await issueSavePathCapability(5, chosen)
    const capability = await consumeSavePathCapability(5, chosen)
    await fs.rm(chosen)
    await fs.writeFile(chosen, 'replacement')

    await expect(verifySavePathCapability(capability)).rejects.toThrow('not authorized')
  })

  it('does not follow a replacement path while committing', async () => {
    const chosen = path.join(root, 'notes.pdf')
    await fs.writeFile(chosen, 'old')
    await issueSavePathCapability(6, chosen)
    const capability = await consumeSavePathCapability(6, chosen)
    const moved = path.join(root, 'original.pdf')
    await fs.rename(chosen, moved)
    await fs.writeFile(chosen, 'replacement')

    await expect(commitSavePathCapability(capability, 'exported')).rejects.toThrow('not authorized')
    await expect(fs.readFile(chosen, 'utf8')).resolves.toBe('replacement')
    await expect(fs.readFile(moved, 'utf8')).resolves.toBe('old')
  })

  it('writes to the handle reserved by the save dialog', async () => {
    const chosen = path.join(root, 'notes.docx')
    await issueSavePathCapability(9, chosen)
    const capability = await consumeSavePathCapability(9, chosen)

    await commitSavePathCapability(capability, Buffer.from('document'))

    await expect(fs.readFile(chosen, 'utf8')).resolves.toBe('document')
  })
})
