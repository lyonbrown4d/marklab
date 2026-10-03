import type { Value } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import {
  deserializePlateMarkdown,
  serializePlateMarkdown as serializePlateMarkdownValue,
} from '@/components/plate/plateMarkdownSerialization'
import PlateMarkdownWorker from '@/workers/plateMarkdownWorker?worker'

type WorkerRequest =
  | { id: number; markdown: string; operation: 'parse' }
  | { id: number; operation: 'serialize'; value: Value }

type WorkerResponse =
  | { id: number; ok: true; operation: 'parse'; value: Value }
  | { id: number; markdown: string; ok: true; operation: 'serialize' }
  | { error: string; id: number; ok: false; operation: 'parse' | 'serialize' }

type WorkerPort = {
  onerror: ((event: ErrorEvent) => void) | null
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  postMessage(message: WorkerRequest): void
  terminate(): void
}

type PendingBase = {
  cleanup: () => void
  reject: (error: Error) => void
}

type PendingRequest =
  | (PendingBase & { operation: 'parse'; resolve: (value: Value) => void })
  | (PendingBase & { operation: 'serialize'; resolve: (markdown: string) => void })

const LARGE_DOCUMENT_CHARACTERS = 128_000
const LARGE_DOCUMENT_NODES = 2_000
const WORKER_UNAVAILABLE_MESSAGE = 'Markdown worker is unavailable for a large document.'

const createAbortError = () => new DOMException('Aborted', 'AbortError')

export const shouldParsePlateMarkdownInWorker = (markdown: string) => {
  if (markdown.length >= LARGE_DOCUMENT_CHARACTERS) return true
  let lineCount = 1
  for (let index = 0; index < markdown.length; index += 1) {
    if (markdown.charCodeAt(index) === 10 && ++lineCount >= LARGE_DOCUMENT_NODES) return true
  }
  return false
}

export const shouldSerializePlateValueInWorker = (value: Value) => {
  if (value.length >= LARGE_DOCUMENT_NODES) return true
  const pending: unknown[] = [...value]
  let characterCount = 0
  let nodeCount = 0

  while (pending.length > 0) {
    const node = pending.pop()
    if (!node || typeof node !== 'object') continue
    nodeCount += 1
    if (nodeCount >= LARGE_DOCUMENT_NODES) return true
    if ('text' in node && typeof node.text === 'string') {
      characterCount += node.text.length
      if (characterCount >= LARGE_DOCUMENT_CHARACTERS) return true
    }
    if ('children' in node && Array.isArray(node.children)) pending.push(...node.children)
  }

  return false
}

export class PlateMarkdownWorkerClient {
  private readonly createWorker: () => WorkerPort
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private worker: WorkerPort | null = null

  constructor(createWorker: () => WorkerPort = () => new PlateMarkdownWorker()) {
    this.createWorker = createWorker
  }

  parse(markdown: string, signal?: AbortSignal): Promise<Value> {
    if (signal?.aborted) return Promise.reject(createAbortError())
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.addPending(id, { operation: 'parse', reject, resolve }, signal)
      this.ensureWorker().postMessage({ id, markdown, operation: 'parse' })
    })
  }

  serialize(value: Value, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) return Promise.reject(createAbortError())
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.addPending(id, { operation: 'serialize', reject, resolve }, signal)
      this.ensureWorker().postMessage({ id, operation: 'serialize', value })
    })
  }

  terminate(error = new Error('Plate Markdown worker terminated.')) {
    this.worker?.terminate()
    this.worker = null
    const pending = [...this.pending.values()]
    this.pending.clear()
    pending.forEach((request) => {
      request.cleanup()
      request.reject(error)
    })
  }

  private addPending(id: number, request: Omit<PendingRequest, 'cleanup'>, signal?: AbortSignal) {
    const onAbort = () => {
      this.pending.delete(id)
      request.reject(createAbortError())
      if (this.pending.size === 0) {
        this.worker?.terminate()
        this.worker = null
      }
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    this.pending.set(id, {
      ...request,
      cleanup: () => signal?.removeEventListener('abort', onAbort),
    } as PendingRequest)
  }

  private ensureWorker() {
    if (this.worker) return this.worker
    const worker = this.createWorker()
    worker.onmessage = ({ data }) => this.handleMessage(data as WorkerResponse)
    worker.onerror = (event) =>
      this.terminate(new Error(event.message || 'Markdown worker failed.'))
    this.worker = worker
    return worker
  }

  private handleMessage(message: WorkerResponse) {
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    pending.cleanup()
    if (message.operation !== pending.operation) {
      pending.reject(new Error('Unexpected Markdown worker response.'))
      return
    }
    if (!message.ok) {
      pending.reject(new Error(message.error))
      return
    }
    if (message.operation === 'parse' && pending.operation === 'parse') {
      pending.resolve(message.value)
      return
    }
    if (message.operation === 'serialize' && pending.operation === 'serialize') {
      pending.resolve(message.markdown)
    }
  }
}

const workerClient = new PlateMarkdownWorkerClient()

export const loadPlateMarkdown = (
  editor: PlateEditor,
  markdown: string,
  signal?: AbortSignal,
): Promise<Value> | Value => {
  if (!shouldParsePlateMarkdownInWorker(markdown)) return deserializePlateMarkdown(editor, markdown)
  if (typeof Worker === 'undefined') return Promise.reject(new Error(WORKER_UNAVAILABLE_MESSAGE))
  return workerClient.parse(markdown, signal)
}

export const serializePlateMarkdown = (
  editor: PlateEditor,
  value: Value,
  signal?: AbortSignal,
): Promise<string> | string => {
  const serialize = () => serializePlateMarkdownValue(editor, value)
  if (!shouldSerializePlateValueInWorker(value)) return serialize()
  if (typeof Worker === 'undefined') return Promise.reject(new Error(WORKER_UNAVAILABLE_MESSAGE))
  return workerClient.serialize(value, signal)
}
