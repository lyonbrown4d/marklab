import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ForkOptions } from 'electron'

import { NodeSidecarRpcClient } from '@electron/services/knowledgeEngine/nodeSidecarRpcClient'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity'
import type { StartedWorkspaceSidecar } from '@electron/services/knowledgeEngine/workspaceSidecarTypes'
import type { Logger } from '@electron/services/logger'

export type ForkUtilityProcess = (
  modulePath: string,
  args: string[],
  options: ForkOptions,
) => NodeUtilityProcess

export type NodeUtilityProcess = {
  kill: () => boolean
  on(event: 'exit', listener: (code: number) => void): unknown
  on(event: 'message', listener: (message: unknown) => void): unknown
  once(event: 'exit', listener: (code: number) => void): unknown
  once(event: 'spawn', listener: () => void): unknown
  pid?: number
  postMessage: (message: unknown) => void
  removeListener(event: 'exit', listener: (code: number) => void): unknown
  removeListener(event: 'message', listener: (message: unknown) => void): unknown
}

type StartNodeSidecarOptions = {
  entryPath?: string
  fork?: ForkUtilityProcess
}

export const startNodeSidecar = async (
  identity: WorkspaceSidecarIdentity,
  logger: Logger,
  options: StartNodeSidecarOptions = {},
): Promise<StartedWorkspaceSidecar> => {
  const entryPath = options.entryPath ?? resolveNodeSidecarEntry(import.meta.url)
  const fork = options.fork ?? (await import('electron')).utilityProcess.fork
  const utility = fork(entryPath, [], {
    serviceName: 'Marklab Knowledge Engine',
    stdio: 'ignore',
  })
  await waitForNodeSidecarSpawn(utility)
  let killed = false
  utility.on('exit', (code) => {
    killed = true
    if (code !== 0) logger.warn(`Knowledge utility process exited with code ${code}.`)
  })

  return {
    address: 'node:utility-process',
    child: {
      get killed() {
        return killed
      },
      kill: () => {
        const result = utility.kill()
        killed ||= result
        return result
      },
      onExit: (listener) => {
        utility.on('exit', listener)
      },
      get pid() {
        return utility.pid
      },
    },
    client: new NodeSidecarRpcClient(utility, identity),
  }
}

export const waitForNodeSidecarSpawn = (utility: NodeUtilityProcess): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try {
        utility.kill()
      } catch {
        // Preserve the timeout failure even if the stalled process cannot be terminated.
      }
      reject(new Error('Knowledge utility process did not spawn in time.'))
    }, 10_000)
    utility.once('spawn', () => {
      clearTimeout(timeout)
      resolve()
    })
    utility.once('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`Knowledge utility process exited before spawn with code ${code}.`))
    })
  })

export const resolveNodeSidecarEntry = (moduleUrl: string): string => {
  const moduleDirectory = path.dirname(fileURLToPath(moduleUrl))
  const candidates = [
    path.join(moduleDirectory, 'knowledgeSidecarEntry.js'),
    path.join(moduleDirectory, '..', 'knowledgeSidecarEntry.js'),
  ]
  return candidates.find(existsSync) ?? candidates[0]
}
