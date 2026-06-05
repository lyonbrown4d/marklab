import MarkdownTextAnalysisWorker from '@/workers/markdownTextAnalysisWorker?worker'
import {
  analyzeMarkdownText as analyzeMarkdownTextInMainThread,
  type MarkdownTextAnalysisResult,
} from '@/logic/markdownTextAnalysis'

type PendingMarkdownTextAnalysis = {
  reject: (error: Error) => void
  resolve: (value: MarkdownTextAnalysisResult) => void
}

type MarkdownTextAnalysisWorkerMessage =
  | {
      id: number
      ok: true
      payload: MarkdownTextAnalysisResult
    }
  | {
      error: string
      id: number
      ok: false
    }

class MarkdownTextAnalysisWorkerClient {
  private nextId = 1
  private readonly pending = new Map<number, PendingMarkdownTextAnalysis>()
  private worker: Worker | null = null

  analyze(content: string): Promise<MarkdownTextAnalysisResult> {
    const worker = this.ensureWorker()
    const id = this.nextId
    this.nextId += 1

    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve })
      worker.postMessage({ content, id })
    })
  }

  terminate(): void {
    const worker = this.worker
    this.worker = null
    this.rejectPending(new Error('Markdown text analysis worker terminated.'))
    worker?.terminate()
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new MarkdownTextAnalysisWorker()
    worker.onmessage = ({ data }) => this.handleMessage(data as MarkdownTextAnalysisWorkerMessage)
    worker.onerror = (event) => {
      this.worker = null
      this.rejectPending(new Error(event.message || 'Markdown text analysis worker failed.'))
    }
    this.worker = worker
    return worker
  }

  private handleMessage(message: MarkdownTextAnalysisWorkerMessage): void {
    const pending = this.pending.get(message.id)
    if (!pending) return

    this.pending.delete(message.id)
    if (message.ok) {
      pending.resolve(message.payload)
      return
    }
    pending.reject(new Error(message.error))
  }

  private rejectPending(error: Error): void {
    const pending = [...this.pending.values()]
    this.pending.clear()
    pending.forEach((task) => task.reject(error))
  }
}

const workerClient = new MarkdownTextAnalysisWorkerClient()

const canUseWorker = () => typeof Worker !== 'undefined'

export const analyzeMarkdownText = async (content: string): Promise<MarkdownTextAnalysisResult> => {
  if (!canUseWorker()) return analyzeMarkdownTextInMainThread(content)

  try {
    return await workerClient.analyze(content)
  } catch {
    workerClient.terminate()
    return analyzeMarkdownTextInMainThread(content)
  }
}
