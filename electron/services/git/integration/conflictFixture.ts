import fs from 'node:fs/promises'
import path from 'node:path'

import { createLocalFixture } from '@electron/services/git/integration/localFixture'
import { gitTestCommand } from '@electron/services/git/testSupport'

type ConflictFixtureOptions = {
  style?: 'merge' | 'diff3' | 'zdiff3'
  oursDeleted?: boolean
  theirsDeleted?: boolean
  markerSize?: number
  file?: string
}

export const createConflictFixture = async (
  roots: string[],
  options: ConflictFixtureOptions = {},
) => {
  const fixture = await createLocalFixture(roots)
  const { root, service, commit } = fixture
  const file = options.file ?? 'base.md'
  if (file !== 'base.md') await commit(file, 'base\n')
  if (options.markerSize)
    await commit('.gitattributes', `${file} conflict-marker-size=${options.markerSize}\n`)
  if (options.style) await gitTestCommand(root, ['config', 'merge.conflictStyle', options.style])
  const change = async (deleted: boolean | undefined, content: string) => {
    if (!deleted) return commit(file, content)
    await fs.unlink(path.join(root, file))
    await service.stage(root, [file])
    await service.commitStaged(root, 'delete file')
    return (await gitTestCommand(root, ['rev-parse', 'HEAD'])).trim()
  }
  await service.createBranch(root, 'incoming')
  await service.switchBranch(root, 'incoming')
  await change(options.theirsDeleted, 'incoming\n')
  await service.switchBranch(root, 'main')
  await change(options.oursDeleted, 'current\n')
  await service.merge(root, 'incoming').then(
    () => {
      throw new Error('Fixture did not create a merge conflict')
    },
    () => undefined,
  )
  return { ...fixture, file }
}
