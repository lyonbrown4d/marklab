import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { startNodeSidecar } from '@electron/services/knowledgeEngine/nodeSidecarProcess.js'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity.js'
import type { Logger } from '@electron/services/logger.js'

describe('Node knowledge sidecar process', () => {
  it('forks a Node utility process and routes client requests over messages', async () => {
    const process = new FakeUtilityProcess()
    const fork = vi.fn(() => process)
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as Logger

    let startedResolved = false
    const starting = startNodeSidecar(identity(), logger, {
      entryPath: 'knowledgeSidecarEntry.js',
      fork,
    })
    void starting.then(() => {
      startedResolved = true
    })
    await Promise.resolve()
    expect(startedResolved).toBe(false)
    process.emit('spawn')
    const started = await starting
    const pending = started.client.hasDocuments()
    const request = process.postMessage.mock.calls[0]?.[0] as { id: number; method: string }
    process.emit('message', { id: request.id, ok: true, result: true })

    await expect(pending).resolves.toBe(true)
    expect(fork).toHaveBeenCalledWith(
      'knowledgeSidecarEntry.js',
      ['workspace-root', 'engine-data'],
      expect.objectContaining({ serviceName: 'Marklab Knowledge Engine' }),
    )
    expect(request.method).toBe('hasDocuments')
    expect(started.address).toBe('node:utility-process')
  })

  it('rejects pending requests when the utility process exits', async () => {
    const process = new FakeUtilityProcess()
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as Logger
    const starting = startNodeSidecar(identity(), logger, {
      entryPath: 'knowledgeSidecarEntry.js',
      fork: () => process,
    })
    process.emit('spawn')
    const started = await starting
    const pending = started.client.hasDocuments()

    process.emit('exit', 9)

    await expect(pending).rejects.toThrow(/exited/i)
  })
})

class FakeUtilityProcess extends EventEmitter {
  pid = 4321
  postMessage = vi.fn()
  kill = vi.fn(() => true)
}

const identity = (): WorkspaceSidecarIdentity => ({
  canonicalRoot: 'workspace-root',
  engineDataDir: 'engine-data',
  sessionToken: 'unused',
  workspaceId: 'workspace-a',
  workspaceInstanceId: 'instance-a',
})
