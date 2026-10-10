import type { FsRootInfo } from '@electron/services/workspace/types'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService'
import { WorkspaceMutationGate } from '@electron/services/workspace/workspaceShutdownBarrier'
import {
  runWorkspacePathMutation,
  type WorkspaceMutationPath,
} from '@electron/services/workspace/workspaceWriteCoordinator'

export const installWindowWorkspaceMutationGate = (
  service: WorkspaceService,
  gate: WorkspaceMutationGate,
  onRootChanged: (root: FsRootInfo) => void,
): (() => Promise<void>) => {
  const mutationPath = (
    value: unknown,
    field: 'path' | 'from' | 'to',
    includeDescendants = false,
  ): WorkspaceMutationPath => {
    const candidate = (value as Record<string, unknown> | null)?.[field]
    if (typeof candidate !== 'string') {
      throw new Error('Workspace mutation requires a string "' + field + '" path')
    }
    return {
      absolutePath: service.resolveCoordinatorPath(candidate),
      includeDescendants,
    }
  }
  const coordinatedMutation = <T>(
    operation: string,
    paths: () => WorkspaceMutationPath[],
    work: () => Promise<T>,
  ): Promise<T> =>
    gate.runAsync(operation, () =>
      runWorkspacePathMutation({
        ownerId: service.writeCoordinatorOwnerId(),
        paths: paths(),
        work,
      }),
    )
  const flushForShutdown = service.flushBuffers.bind(service)
  const setRoot = service.setRoot.bind(service)
  const setSingleFile = service.setSingleFile.bind(service)
  const readFile = service.readFile.bind(service)
  const updateBuffer = service.updateBuffer.bind(service)
  const writeFile = service.writeFile.bind(service)
  const flushBuffers = service.flushBuffers.bind(service)
  const createFile = service.createFile.bind(service)
  const createDir = service.createDir.bind(service)
  const renamePath = service.renamePath.bind(service)
  const movePath = service.movePath.bind(service)
  const deletePath = service.deletePath.bind(service)
  const importAsset = service.importMarkdownAsset.bind(service)
  const importAssetBytes = service.importMarkdownAssetBytes.bind(service)

  service.setRoot = (value, options) =>
    gate.runAsync('switch workspace root', async () => {
      const root = await setRoot(value, options)
      options?.signal?.throwIfAborted()
      onRootChanged(root)
      return root
    })
  service.setSingleFile = (value, options) =>
    gate.runAsync('switch single-file workspace', async () => {
      const root = await setSingleFile(value, options)
      options?.signal?.throwIfAborted()
      onRootChanged(root)
      return root
    })
  service.readFile = (value) => gate.runAsync('complete workspace file read', () => readFile(value))
  service.updateBuffer = (value) =>
    gate.runSync('update workspace buffer', () => updateBuffer(value))
  service.writeFile = (value) => gate.runSync('write workspace file', () => writeFile(value))
  service.flushBuffers = () => gate.runAsync('flush workspace buffers', () => flushBuffers())
  service.createFile = (value) =>
    coordinatedMutation(
      'create workspace file',
      () => [mutationPath(value, 'path')],
      () => createFile(value),
    )
  service.createDir = (value) =>
    coordinatedMutation(
      'create workspace directory',
      () => [mutationPath(value, 'path', true)],
      () => createDir(value),
    )
  service.renamePath = (value) =>
    coordinatedMutation(
      'rename workspace path',
      () => [mutationPath(value, 'from', true), mutationPath(value, 'to', true)],
      () => renamePath(value),
    )
  service.movePath = (value) =>
    coordinatedMutation(
      'move workspace path',
      () => [mutationPath(value, 'from', true), mutationPath(value, 'to', true)],
      () => movePath(value),
    )
  service.deletePath = (value) =>
    coordinatedMutation(
      'delete workspace path',
      () => [mutationPath(value, 'path', true)],
      () => deletePath(value),
    )
  service.importMarkdownAsset = (value) =>
    gate.runAsync('import markdown asset', () => importAsset(value))
  service.importMarkdownAssetBytes = (value) =>
    gate.runAsync('import binary markdown asset', () => importAssetBytes(value))
  return flushForShutdown
}
