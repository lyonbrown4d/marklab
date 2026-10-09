import { join } from 'pathe'
import { normalizePath } from '@/logic/paths'
import type { RootKind } from '@/store/appTypes'

type ResolveCommandNewWindowPathOptions = {
  path: string
  rootKind: RootKind
  rootPath: string
}

export const resolveCommandNewWindowPath = ({
  path,
  rootKind,
  rootPath,
}: ResolveCommandNewWindowPathOptions) =>
  rootKind === 'single' ? rootPath : join(rootPath, normalizePath(path))
