import { ChildProcessWithoutNullStreams } from 'node:child_process'

import type { Logger } from '@electron/services/logger.js'

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

type JsonRpcResponse = {
  id?: string | number | null
  result?: unknown
  error?: {
    code: number
    message: string
  }
}

export class KnowledgeEngineRpcClient {
  private buffer = ''
  private nextRequestId = 1
  private pending = new Map<string, PendingRequest>()

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly logger: Logger,
  ) {
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.handleStdout(chunk))
    child.stderr.on('data', (chunk: string) => this.handleStderr(chunk))
    child.once('exit', () => this.rejectPending(new Error('Knowledge engine exited')))
    child.once('error', (error) => this.rejectPending(error))
  }

  request(method: string, params?: unknown, timeoutMs = 5000) {
    const id = `${this.nextRequestId++}`
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      ...(params === undefined ? {} : { params }),
    })

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Knowledge engine request timed out: ${method}`))
      }, timeoutMs)

      this.pending.set(id, { resolve, reject, timeout })
      this.child.stdin.write(`${payload}\n`, (error) => {
        if (!error) {
          return
        }

        clearTimeout(timeout)
        this.pending.delete(id)
        reject(error)
      })
    })
  }

  dispose() {
    this.rejectPending(new Error('Knowledge engine transport disposed'))
  }

  private handleStdout(chunk: string) {
    this.buffer += chunk

    let newlineIndex = this.buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)

      if (line) {
        this.handleResponseLine(line)
      }

      newlineIndex = this.buffer.indexOf('\n')
    }
  }

  private handleResponseLine(line: string) {
    let response: JsonRpcResponse
    try {
      response = JSON.parse(line) as JsonRpcResponse
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(`[knowledge-engine] Invalid JSON-RPC response: ${reason}; line=${line}`)
      return
    }

    const id = response.id == null ? null : String(response.id)
    if (!id) {
      return
    }

    const pending = this.pending.get(id)
    if (!pending) {
      return
    }

    clearTimeout(pending.timeout)
    this.pending.delete(id)

    if (response.error) {
      pending.reject(new Error(response.error.message))
      return
    }

    pending.resolve(response.result)
  }

  private handleStderr(chunk: string) {
    const message = chunk.trim()
    if (message) {
      this.logger.warn(`[knowledge-engine] ${message}`)
    }
  }

  private rejectPending(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }
}
