import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { NodeSidecarProcessPool } from '@electron/services/knowledgeEngine/nodeSidecarProcessPool'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity'
import type { Logger } from '@electron/services/logger'

describe('NodeSidecarProcessPool', () => {
  it('shares one physical utility process and exits after the final lease', async () => {
    const process = new FakeUtilityProcess()
    const fork = vi.fn(() => process)
    const pool = new NodeSidecarProcessPool(logger(), {
      entryPath: 'knowledgeSidecarEntry.js',
      fork,
    })

    const firstRequest = pool.acquire(identity('a'))
    const secondRequest = pool.acquire(identity('b'))
    let secondResolved = false
    void secondRequest.then(() => {
      secondResolved = true
    })
    await Promise.resolve()
    expect(secondResolved).toBe(false)

    process.emit('spawn')
    const [first, second] = await Promise.all([firstRequest, secondRequest])

    expect(fork).toHaveBeenCalledOnce()
    expect(fork).toHaveBeenCalledWith(
      'knowledgeSidecarEntry.js',
      [],
      expect.objectContaining({ serviceName: 'Marklab Knowledge Engine' }),
    )

    first.client.close()
    expect(first.child?.kill()).toBe(true)
    expect(process.kill).not.toHaveBeenCalled()

    second.client.close()
    expect(second.child?.kill()).toBe(true)
    expect(process.kill).toHaveBeenCalledOnce()
  })

  it('routes overlapping request ids to the matching workspace client', async () => {
    const process = new FakeUtilityProcess()
    const pool = new NodeSidecarProcessPool(logger(), {
      entryPath: 'knowledgeSidecarEntry.js',
      fork: () => process,
    })
    const firstRequest = pool.acquire(identity('a'))
    const secondRequest = pool.acquire(identity('b'))
    process.emit('spawn')
    const [first, second] = await Promise.all([firstRequest, secondRequest])

    const firstResult = first.client.hasDocuments()
    const secondResult = second.client.hasDocuments()
    const [firstMessage, secondMessage] = process.postMessage.mock.calls.map(
      ([message]) => message as WorkspaceRequest,
    )
    process.emit('message', response(secondMessage!, false))
    process.emit('message', response(firstMessage!, true))

    await expect(firstResult).resolves.toBe(true)
    await expect(secondResult).resolves.toBe(false)
    expect(firstMessage?.id).toBe(secondMessage?.id)
  })
})

type WorkspaceRequest = {
  id: number
  workspace: { workspaceInstanceId: string }
}

class FakeUtilityProcess extends EventEmitter {
  pid = 4321
  kill = vi.fn(() => true)
  postMessage = vi.fn()
}

const identity = (suffix: string): WorkspaceSidecarIdentity => ({
  canonicalRoot: `workspace-${suffix}`,
  engineDataDir: `engine-${suffix}`,
  sessionToken: 'unused',
  workspaceId: `workspace-${suffix}`,
  workspaceInstanceId: `instance-${suffix}`,
})

const logger = () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }) as unknown as Logger

const response = (request: WorkspaceRequest, result: unknown) => ({
  id: request.id,
  ok: true,
  result,
  workspaceInstanceId: request.workspace.workspaceInstanceId,
})
