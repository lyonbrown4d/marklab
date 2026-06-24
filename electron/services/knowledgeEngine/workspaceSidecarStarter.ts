import { type ChildProcessWithoutNullStreams } from 'node:child_process'

import { execa } from 'execa'

import { KnowledgeEngineGrpcClient } from '@electron/services/knowledgeEngine/grpcClient.js'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity.js'
import type { WorkspaceSidecarSpawnPlan } from '@electron/services/knowledgeEngine/workspaceSidecarSpawnPlan.js'
import type { StartedWorkspaceSidecar } from '@electron/services/knowledgeEngine/workspaceSidecarManager.js'
import type { Logger } from '@electron/services/logger.js'

const SIDECAR_READY_TIMEOUT_MS = 5000
const GRPC_READY_RETRY_DELAY_MS = 50

export const startGrpcSidecar = async (
  plan: WorkspaceSidecarSpawnPlan,
  identity: WorkspaceSidecarIdentity,
  logger: Logger,
): Promise<StartedWorkspaceSidecar> => {
  const child = execa(plan.command, plan.args, {
    env: plan.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    buffer: false,
    windowsHide: plan.windowsHide,
    reject: false,
  }) as unknown as ChildProcessWithoutNullStreams

  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk) => {
    const message = chunk.toString().trim()
    if (message) logger.warn(`[knowledge-engine] ${message}`)
  })

  child.stdout?.setEncoding('utf8')
  const address = await waitForReady(child, identity.workspaceInstanceId)
  const client = new KnowledgeEngineGrpcClient({
    address,
    sessionToken: identity.sessionToken,
  })
  try {
    await waitForGrpcReady(client, identity.workspaceInstanceId)
  } catch (error) {
    client.close()
    if (!child.killed) {
      child.kill()
    }
    throw error
  }

  return { address, child, client }
}

const waitForReady = (
  child: ChildProcessWithoutNullStreams,
  workspaceInstanceId: string,
): Promise<string> =>
  new Promise((resolve, reject) => {
    let buffer = ''
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Knowledge sidecar did not become ready in time.'))
    }, SIDECAR_READY_TIMEOUT_MS)

    const cleanup = () => {
      clearTimeout(timeout)
      child.stdout.off('data', onData)
      child.off('error', onError)
      child.off('exit', onExit)
    }

    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup()
      reject(new Error(`Knowledge sidecar exited before ready: code=${code} signal=${signal}`))
    }

    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString()
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        const address = parseReadyAddress(line, workspaceInstanceId)
        if (address) {
          cleanup()
          resolve(address)
          return
        }
        newlineIndex = buffer.indexOf('\n')
      }
    }

    child.stdout.on('data', onData)
    child.once('error', onError)
    child.once('exit', onExit)
  })

const parseReadyAddress = (line: string, workspaceInstanceId: string): string | null => {
  if (!line) return null

  const value = JSON.parse(line) as Record<string, unknown>
  if (
    value.type !== 'READY' ||
    value.protocol !== 'grpc' ||
    value.workspaceInstanceId !== workspaceInstanceId ||
    typeof value.address !== 'string'
  ) {
    return null
  }

  return value.address
}

const waitForGrpcReady = async (
  client: KnowledgeEngineGrpcClient,
  workspaceInstanceId: string,
): Promise<void> => {
  const deadline = Date.now() + SIDECAR_READY_TIMEOUT_MS
  let lastError: unknown

  while (Date.now() < deadline) {
    try {
      await client.getCapabilities(workspaceInstanceId)
      return
    } catch (error) {
      lastError = error
      await delay(GRPC_READY_RETRY_DELAY_MS)
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Knowledge sidecar gRPC server did not become ready in time.')
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
