import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import {
  MermaidValidationWorkerClient,
  type MermaidValidationWorker,
} from '@electron/services/mermaidLanguage/validationWorkerClient.js'
import type {
  MermaidValidationWorkerRequest,
  MermaidValidationWorkerResponse,
} from '@electron/services/mermaidLanguage/validationWorkerMessages.js'

class FakeWorker extends EventEmitter implements MermaidValidationWorker {
  readonly postMessage = vi.fn<(message: MermaidValidationWorkerRequest) => void>()
  readonly terminate = vi.fn(async () => 0)
  readonly unref = vi.fn(() => this)

  respond(message: MermaidValidationWorkerResponse): void {
    this.emit('message', message)
  }
}

const document = (version = 1) => ({
  languageId: 'mermaid',
  text: 'flowchart LR\n  A --> B',
  uri: 'marklab-mermaid:///example.mmd',
  version,
})

describe('MermaidValidationWorkerClient', () => {
  it('starts one lazy worker and resolves the matching validation response', async () => {
    const worker = new FakeWorker()
    const factory = vi.fn(() => worker)
    const client = new MermaidValidationWorkerClient(factory)

    const validation = client.validate(document(), {})

    expect(factory).toHaveBeenCalledTimes(1)
    expect(worker.unref).toHaveBeenCalledTimes(1)
    expect(worker.postMessage).toHaveBeenCalledWith({
      id: 1,
      type: 'validate',
      document: document(),
    })
    worker.respond({ id: 1, ok: true, issues: [] })
    await expect(validation).resolves.toEqual([])

    const nextValidation = client.validate({ ...document(), uri: 'marklab-mermaid:///two.mmd' }, {})
    expect(factory).toHaveBeenCalledTimes(1)
    worker.respond({ id: 2, ok: true, issues: [] })
    await expect(nextValidation).resolves.toEqual([])
  })

  it('rejects immediately on cancellation and ignores a late worker response', async () => {
    const worker = new FakeWorker()
    const client = new MermaidValidationWorkerClient(() => worker)
    const controller = new AbortController()
    const validation = client.validate(document(), { signal: controller.signal })

    controller.abort()

    await expect(validation).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.postMessage).toHaveBeenLastCalledWith({ id: 1, type: 'cancel' })
    expect(() => worker.respond({ id: 1, ok: true, issues: [] })).not.toThrow()
  })

  it('discards an older in-flight version for the same document URI', async () => {
    const worker = new FakeWorker()
    const client = new MermaidValidationWorkerClient(() => worker)
    const stale = client.validate(document(1), {})
    const current = client.validate(document(2), {})

    await expect(stale).rejects.toMatchObject({ name: 'AbortError' })
    worker.respond({ id: 1, ok: true, issues: [] })
    worker.respond({ id: 2, ok: true, issues: [] })
    await expect(current).resolves.toEqual([])
  })

  it('reconstructs bounded parser errors without sharing error objects across threads', async () => {
    const worker = new FakeWorker()
    const client = new MermaidValidationWorkerClient(() => worker)
    const validation = client.validate(document(), {})

    worker.respond({
      id: 1,
      ok: false,
      error: {
        message: 'Parse error',
        location: { firstColumn: 2, firstLine: 2, lastColumn: 6, lastLine: 2 },
      },
    })

    await expect(validation).rejects.toMatchObject({
      hash: {
        loc: { first_column: 2, first_line: 2, last_column: 6, last_line: 2 },
      },
      message: 'Parse error',
    })
  })

  it('cleans pending state when posting to the worker fails', async () => {
    const worker = new FakeWorker()
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error('worker channel is closed')
    })
    const client = new MermaidValidationWorkerClient(() => worker)
    const controller = new AbortController()

    await expect(client.validate(document(), { signal: controller.signal })).rejects.toThrow(
      'worker channel is closed',
    )
    controller.abort()
    expect(worker.postMessage).toHaveBeenCalledTimes(1)

    const retry = client.validate(document(2), {})
    worker.respond({ id: 2, ok: true, issues: [] })
    await expect(retry).resolves.toEqual([])
  })
})
