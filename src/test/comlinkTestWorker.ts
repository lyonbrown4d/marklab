import { MessageChannel } from 'node:worker_threads'
import { expose, type Endpoint } from 'comlink'
import { vi } from 'vitest'
import type { RpcWorker } from '@/services/workerRpcClient'

// Real structured cloning and Comlink dispatch, without a browser Worker runtime.
export const createComlinkTestWorker = (api: object) => {
  const { port1, port2 } = new MessageChannel()
  expose(api, port2 as unknown as Endpoint)
  const listeners = new Set<EventListenerOrEventListenerObject>()
  const worker: RpcWorker = {
    onerror: null,
    onmessageerror: null,
    postMessage: (message: unknown, transfers?: Transferable[]) => {
      port1.postMessage(message, transfers as Parameters<typeof port1.postMessage>[1])
    },
    addEventListener: (type, listener) => {
      listeners.add(listener)
      port1.addEventListener(type, listener)
      port1.start()
    },
    removeEventListener: (type, listener) => {
      listeners.delete(listener)
      port1.removeEventListener(type, listener)
    },
    terminate: vi.fn(() => {
      port1.close()
      port2.close()
    }),
  }
  return { worker, listeners }
}
