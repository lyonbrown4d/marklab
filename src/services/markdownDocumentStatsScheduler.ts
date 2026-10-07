import PQueue from 'p-queue'
import type { MarkdownDocumentStats } from '@/logic/markdownTextAnalysis'

type RunDocumentStats = (content: string, signal: AbortSignal) => Promise<MarkdownDocumentStats>

export class MarkdownDocumentStatsScheduler {
  private active: AbortController | null = null
  private readonly queue = new PQueue({ concurrency: 1 })
  private readonly run: RunDocumentStats

  constructor(run: RunDocumentStats) {
    this.run = run
  }

  runLatest(content: string, signal?: AbortSignal): Promise<MarkdownDocumentStats> {
    this.active?.abort()
    const controller = new AbortController()
    this.active = controller
    const abort = () => controller.abort(signal?.reason)
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })

    const operation = this.queue.add(() => this.run(content, controller.signal), {
      signal: controller.signal,
    }) as Promise<MarkdownDocumentStats>
    return operation.finally(() => {
      signal?.removeEventListener('abort', abort)
      if (this.active === controller) this.active = null
    })
  }
}
