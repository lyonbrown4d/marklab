import type { WorkspaceSidecarClient } from '@electron/services/knowledgeEngine/workspaceSidecarTypes'
import type {
  NodeSidecarMessage,
  NodeSidecarMethod,
} from '@electron/services/knowledgeEngine/nodeSidecarProtocol'
import { isNodeSidecarResponse } from '@electron/services/knowledgeEngine/nodeSidecarProtocol'

export type NodeSidecarProcessPort = {
  on(event: 'exit', listener: (code: number) => void): unknown
  on(event: 'message', listener: (message: unknown) => void): unknown
  postMessage(message: NodeSidecarMessage): void
}

type PendingRequest = {
  cleanup?: () => void
  reject: (error: Error) => void
  resolve: (value: unknown) => void
}

export class NodeSidecarRpcClient implements WorkspaceSidecarClient {
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()

  constructor(private readonly port: NodeSidecarProcessPort) {
    port.on('message', (message) => this.handleMessage(message))
    port.on('exit', (code) => this.handleExit(code))
  }

  getCapabilities(workspaceInstanceId: string) {
    return this.request('getCapabilities', workspaceInstanceId)
  }
  openWorkspace(indexPath: string) {
    return this.request<void>('openWorkspace', indexPath)
  }
  closeWorkspace() {
    return this.request<void>('closeWorkspace')
  }
  hasDocuments() {
    return this.request<boolean>('hasDocuments')
  }
  getWorkspaceStatus() {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['getWorkspaceStatus']>>>(
      'getWorkspaceStatus',
    )
  }
  getWorkspaceFileSnapshot(
    root: Parameters<WorkspaceSidecarClient['getWorkspaceFileSnapshot']>[0],
  ) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['getWorkspaceFileSnapshot']>>>(
      'getWorkspaceFileSnapshot',
      root,
    )
  }
  listWorkspaceEntries() {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['listWorkspaceEntries']>>>(
      'listWorkspaceEntries',
    )
  }
  readWorkspaceFile(path: string) {
    return this.request<string>('readWorkspaceFile', path)
  }
  writeWorkspaceFile(path: string, content: string) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['writeWorkspaceFile']>>>(
      'writeWorkspaceFile',
      path,
      content,
    )
  }
  createWorkspaceFile(path: string) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['createWorkspaceFile']>>>(
      'createWorkspaceFile',
      path,
    )
  }
  createWorkspaceDirectory(path: string) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['createWorkspaceDirectory']>>>(
      'createWorkspaceDirectory',
      path,
    )
  }
  renameWorkspacePath(from: string, to: string) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['renameWorkspacePath']>>>(
      'renameWorkspacePath',
      from,
      to,
    )
  }
  deleteWorkspacePath(path: string) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['deleteWorkspacePath']>>>(
      'deleteWorkspacePath',
      path,
    )
  }
  getWorkspacePathMetadata(path: string) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['getWorkspacePathMetadata']>>>(
      'getWorkspacePathMetadata',
      path,
    )
  }
  rebuildIndex(documents: Parameters<WorkspaceSidecarClient['rebuildIndex']>[0]) {
    return this.request<void>('rebuildIndex', documents)
  }
  applySearchChanges(batch: Parameters<WorkspaceSidecarClient['applySearchChanges']>[0]) {
    return this.request<void>('applySearchChanges', batch)
  }
  upsertDocument(document: Parameters<WorkspaceSidecarClient['upsertDocument']>[0]) {
    return this.request<void>('upsertDocument', document)
  }
  removeDocument(path: string) {
    return this.request<void>('removeDocument', path)
  }
  removePathPrefix(prefix: string) {
    return this.request<void>('removePathPrefix', prefix)
  }
  search(query: string, limit: number) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['search']>>>(
      'search',
      query,
      limit,
    )
  }
  searchOccurrences(
    request: Parameters<WorkspaceSidecarClient['searchOccurrences']>[0],
    signal?: AbortSignal,
  ) {
    if (signal) {
      return this.requestCancellable<
        Awaited<ReturnType<WorkspaceSidecarClient['searchOccurrences']>>
      >(signal, 'searchOccurrences', request)
    }
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['searchOccurrences']>>>(
      'searchOccurrences',
      request,
    )
  }
  searchWithOptions(
    query: string,
    options: Parameters<WorkspaceSidecarClient['searchWithOptions']>[1],
  ) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['searchWithOptions']>>>(
      'searchWithOptions',
      query,
      options,
    )
  }
  openMarkdownDocument(...args: Parameters<WorkspaceSidecarClient['openMarkdownDocument']>) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['openMarkdownDocument']>>>(
      'openMarkdownDocument',
      ...args,
    )
  }
  changeMarkdownDocument(...args: Parameters<WorkspaceSidecarClient['changeMarkdownDocument']>) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['changeMarkdownDocument']>>>(
      'changeMarkdownDocument',
      ...args,
    )
  }
  resyncMarkdownDocument(...args: Parameters<WorkspaceSidecarClient['resyncMarkdownDocument']>) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['resyncMarkdownDocument']>>>(
      'resyncMarkdownDocument',
      ...args,
    )
  }
  closeMarkdownDocument(...args: Parameters<WorkspaceSidecarClient['closeMarkdownDocument']>) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['closeMarkdownDocument']>>>(
      'closeMarkdownDocument',
      ...args,
    )
  }
  getMarkdownDocumentSymbols(
    ...args: Parameters<WorkspaceSidecarClient['getMarkdownDocumentSymbols']>
  ) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['getMarkdownDocumentSymbols']>>>(
      'getMarkdownDocumentSymbols',
      ...args,
    )
  }
  getMarkdownLinks(...args: Parameters<WorkspaceSidecarClient['getMarkdownLinks']>) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['getMarkdownLinks']>>>(
      'getMarkdownLinks',
      ...args,
    )
  }
  getMarkdownDiagnostics(path: string, content: string, signal?: AbortSignal) {
    if (signal) {
      return this.requestCancellable<
        Awaited<ReturnType<WorkspaceSidecarClient['getMarkdownDiagnostics']>>
      >(signal, 'getMarkdownDiagnostics', path, content)
    }
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['getMarkdownDiagnostics']>>>(
      'getMarkdownDiagnostics',
      path,
      content,
    )
  }
  buildWorkspaceGraph(...args: Parameters<WorkspaceSidecarClient['buildWorkspaceGraph']>) {
    return this.request<Awaited<ReturnType<WorkspaceSidecarClient['buildWorkspaceGraph']>>>(
      'buildWorkspaceGraph',
      ...args,
    )
  }
  shutdown(reason: string) {
    return this.request<void>('shutdown', reason)
  }
  close(): void {
    this.handleExit(0)
  }

  private request<T>(method: NodeSidecarMethod, ...args: unknown[]): Promise<T> {
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { reject, resolve: (value) => resolve(value as T) })
      this.port.postMessage({ args, id, method })
    })
  }

  private requestCancellable<T>(
    signal: AbortSignal,
    method: NodeSidecarMethod,
    ...args: unknown[]
  ): Promise<T> {
    if (signal.aborted) return Promise.reject(abortError())
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        pending.cleanup?.()
        this.port.postMessage({ cancelId: id })
        reject(abortError())
      }
      signal.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        cleanup: () => signal.removeEventListener('abort', onAbort),
        reject,
        resolve: (value) => resolve(value as T),
      })
      this.port.postMessage({ args, id, method })
    })
  }

  private handleMessage(message: unknown): void {
    if (!isNodeSidecarResponse(message)) return
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    pending.cleanup?.()
    if (message.ok) pending.resolve(message.result)
    else pending.reject(new Error(message.error))
  }

  private handleExit(code: number): void {
    const error = new Error(`Knowledge utility process exited with code ${code}.`)
    for (const pending of this.pending.values()) {
      pending.cleanup?.()
      pending.reject(error)
    }
    this.pending.clear()
  }
}

const abortError = (): Error => {
  const error = new Error('Knowledge engine request was cancelled')
  error.name = 'AbortError'
  return error
}
