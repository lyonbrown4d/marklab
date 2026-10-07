import MarkdownTextAnalysisWorker from '@/workers/markdownTextAnalysisWorker?worker'
import {
  analyzeMarkdownText as analyzeMarkdownTextInMainThread,
  type MarkdownDocumentStats,
  type MarkdownTextAnalysisResult,
} from '@/logic/markdownTextAnalysis'
import { MarkdownDocumentStatsScheduler } from '@/services/markdownDocumentStatsScheduler'

type MarkdownWorkerTask = 'analysis' | 'stats'
type MarkdownWorkerPayload = MarkdownDocumentStats | MarkdownTextAnalysisResult

type PendingMarkdownTextAnalysis = {
  reject: (error: Error) => void
  resolve: (value: MarkdownWorkerPayload) => void
  task: MarkdownWorkerTask
  removeAbortListener?: () => void
}

type MarkdownTextAnalysisWorkerMessage =
  | { id: number; ok: true; payload: MarkdownWorkerPayload; task: MarkdownWorkerTask }
  | { error: string; id: number; ok: false; task: MarkdownWorkerTask }

type MarkdownTextWorker = Pick<Worker, 'onerror' | 'onmessage' | 'postMessage' | 'terminate'>
type CreateMarkdownTextWorker = () => MarkdownTextWorker

const createAbortError = () => new DOMException('Aborted', 'AbortError')

export class MarkdownTextAnalysisWorkerClient {
  private readonly createWorker: CreateMarkdownTextWorker
  private nextId = 1
  private readonly pending = new Map<number, PendingMarkdownTextAnalysis>()
  private worker: MarkdownTextWorker | null = null

  constructor(createWorker: CreateMarkdownTextWorker = () => new MarkdownTextAnalysisWorker()) {
    this.createWorker = createWorker
  }

  analyze(content: string, signal?: AbortSignal): Promise<MarkdownTextAnalysisResult> {
    return this.request('analysis', content, signal) as Promise<MarkdownTextAnalysisResult>
  }

  stats(content: string, signal?: AbortSignal): Promise<MarkdownDocumentStats> {
    return this.request('stats', content, signal) as Promise<MarkdownDocumentStats>
  }

  terminate(): void {
    const worker = this.worker
    this.worker = null
    this.rejectPending(new Error('Markdown text analysis worker terminated.'))
    worker?.terminate()
  }

  private request(
    task: MarkdownWorkerTask,
    content: string,
    signal?: AbortSignal,
  ): Promise<MarkdownWorkerPayload> {
    if (signal?.aborted) return Promise.reject(createAbortError())
    const worker = this.ensureWorker()
    const id = this.nextId
    this.nextId += 1

    return new Promise((resolve, reject) => {
      const onAbort = () => this.abortRequest(id)
      const pending: PendingMarkdownTextAnalysis = { reject, resolve, task }
      if (signal) {
        pending.removeAbortListener = () => signal.removeEventListener('abort', onAbort)
        signal.addEventListener('abort', onAbort, { once: true })
      }
      this.pending.set(id, pending)
      try {
        worker.postMessage({ content, id, task })
      } catch (error) {
        this.pending.delete(id)
        pending.removeAbortListener?.()
        reject(error instanceof Error ? error : new Error('Markdown worker request failed.'))
      }
    })
  }

  private abortRequest(id: number): void {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    pending.removeAbortListener?.()
    pending.reject(createAbortError())
    const worker = this.worker
    this.worker = null
    this.rejectPending(new Error('Markdown text analysis worker restarted after cancellation.'))
    worker?.terminate()
  }

  private ensureWorker(): MarkdownTextWorker {
    if (this.worker) return this.worker
    const worker = this.createWorker()
    worker.onmessage = ({ data }) => this.handleMessage(data as MarkdownTextAnalysisWorkerMessage)
    worker.onerror = (event) => {
      if (this.worker !== worker) return
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
    pending.removeAbortListener?.()
    if (message.task !== pending.task) {
      pending.reject(new Error('Unexpected Markdown text analysis worker response.'))
      return
    }
    if (message.ok) pending.resolve(message.payload)
    else pending.reject(new Error(message.error))
  }

  private rejectPending(error: Error): void {
    const pending = [...this.pending.values()]
    this.pending.clear()
    pending.forEach((task) => {
      task.removeAbortListener?.()
      task.reject(error)
    })
  }
}

const analysisWorkerClient = new MarkdownTextAnalysisWorkerClient()
const statsWorkerClient = new MarkdownTextAnalysisWorkerClient()
const statsScheduler = new MarkdownDocumentStatsScheduler((content, signal) =>
  statsWorkerClient.stats(content, signal),
)

const canUseWorker = () => typeof Worker !== 'undefined'

export const analyzeMarkdownText = async (content: string): Promise<MarkdownTextAnalysisResult> => {
  if (!canUseWorker()) return analyzeMarkdownTextInMainThread(content)
  try {
    return await analysisWorkerClient.analyze(content)
  } catch {
    analysisWorkerClient.terminate()
    return analyzeMarkdownTextInMainThread(content)
  }
}

export const analyzeMarkdownTextInWorker = async (
  content: string,
): Promise<MarkdownTextAnalysisResult> => {
  if (!canUseWorker()) throw new Error('Markdown text analysis worker is unavailable.')
  return analysisWorkerClient.analyze(content)
}

export const analyzeDocumentStatsInWorker = async (
  content: string,
  signal?: AbortSignal,
): Promise<MarkdownDocumentStats> => {
  if (!canUseWorker()) throw new Error('Markdown text analysis worker is unavailable.')
  return statsScheduler.runLatest(content, signal)
}
