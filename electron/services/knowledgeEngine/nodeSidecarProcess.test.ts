import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { startNodeSidecar } from '@electron/services/knowledgeEngine/nodeSidecarProcess'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity'
import type { Logger } from '@electron/services/logger'

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
    const request = process.postMessage.mock.calls[0]?.[0] as {
      id: number
      method: string
      workspace: { workspaceInstanceId: string }
    }
    respond(process, request, true)

    await expect(pending).resolves.toBe(true)
    expect(fork).toHaveBeenCalledWith(
      'knowledgeSidecarEntry.js',
      [],
      expect.objectContaining({ serviceName: 'Marklab Knowledge Engine' }),
    )
    expect(request.method).toBe('hasDocuments')
    expect(request.workspace.workspaceInstanceId).toBe('instance-a')
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

  it('rejects when the utility process does not spawn before the timeout', async () => {
    vi.useFakeTimers()
    try {
      const process = new FakeUtilityProcess()
      const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as Logger
      const starting = startNodeSidecar(identity(), logger, {
        entryPath: 'knowledgeSidecarEntry.js',
        fork: () => process,
      })
      const rejected = expect(starting).rejects.toThrow(/did not spawn in time/i)

      await vi.advanceTimersByTimeAsync(10_000)

      await rejected
      expect(process.kill).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('routes Markdown diagnostics over the utility-process RPC boundary', async () => {
    const process = new FakeUtilityProcess()
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as Logger
    const starting = startNodeSidecar(identity(), logger, {
      entryPath: 'knowledgeSidecarEntry.js',
      fork: () => process,
    })
    process.emit('spawn')
    const started = await starting
    const pending = started.client.getMarkdownDiagnostics('alpha.md', '[A][missing]')
    const request = process.postMessage.mock.calls[0]?.[0] as {
      args: unknown[]
      id: number
      method: string
    }
    respond(process, request, [])

    await expect(pending).resolves.toEqual([])
    expect(request).toMatchObject({
      args: ['alpha.md', '[A][missing]'],
      method: 'getMarkdownDiagnostics',
    })
  })

  it('cancels a stale diagnostics request without affecting the next request', async () => {
    const process = new FakeUtilityProcess()
    const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as Logger
    const starting = startNodeSidecar(identity(), logger, {
      entryPath: 'knowledgeSidecarEntry.js',
      fork: () => process,
    })
    process.emit('spawn')
    const started = await starting
    const controller = new AbortController()
    const stale = started.client.getMarkdownDiagnostics(
      'alpha.md',
      '[Stale][missing]',
      controller.signal,
    )
    const staleRequest = process.postMessage.mock.calls[0]?.[0] as { id: number }

    controller.abort()
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' })
    expect(process.postMessage.mock.calls[1]?.[0]).toEqual({
      cancelId: staleRequest.id,
      workspaceInstanceId: 'instance-a',
    })

    respond(process, staleRequest, [])
    const current = started.client.getMarkdownDiagnostics('alpha.md', '[Current][missing]')
    const currentRequest = process.postMessage.mock.calls[2]?.[0] as { id: number }
    respond(process, currentRequest, [{ line: 1 }])

    await expect(current).resolves.toEqual([{ line: 1 }])
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

const respond = (process: FakeUtilityProcess, request: { id: number }, result: unknown): void => {
  process.emit('message', {
    id: request.id,
    ok: true,
    result,
    workspaceInstanceId: 'instance-a',
  })
}
