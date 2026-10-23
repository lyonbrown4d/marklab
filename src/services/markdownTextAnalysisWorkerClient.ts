import MarkdownTextAnalysisWorker from '@/workers/markdownTextAnalysisWorker?worker'
import {
  analyzeMarkdownText as analyzeMarkdownTextInMainThread,
  getMarkdownDocumentStats,
  type MarkdownDocumentStats,
  type MarkdownTextAnalysisResult,
} from '@/logic/markdownTextAnalysis'
import { MarkdownDocumentStatsScheduler } from '@/services/markdownDocumentStatsScheduler'
import { WorkerRpcClient, type RpcWorker } from '@/services/workerRpcClient'
import type { MarkdownTextAnalysisWorkerApi } from '@/workers/markdownTextAnalysisWorkerApi'

export class MarkdownTextAnalysisWorkerClient {
  private readonly rpc: WorkerRpcClient<MarkdownTextAnalysisWorkerApi>

  constructor(createWorker: () => RpcWorker = () => new MarkdownTextAnalysisWorker()) {
    this.rpc = new WorkerRpcClient(createWorker, 'Markdown text analysis worker')
  }

  analyze = (content: string, signal?: AbortSignal): Promise<MarkdownTextAnalysisResult> =>
    this.rpc.call((remote) => remote.analyze(content), signal)

  stats = (content: string, signal?: AbortSignal): Promise<MarkdownDocumentStats> =>
    this.rpc.call((remote) => remote.stats(content), signal)

  terminate = (): void => this.rpc.terminate()
}

const analysisWorkerClient = new MarkdownTextAnalysisWorkerClient()
const statsWorkerClient = new MarkdownTextAnalysisWorkerClient()
const statsScheduler = new MarkdownDocumentStatsScheduler((content, signal) =>
  statsWorkerClient.stats(content, signal),
)

const canUseWorker = () => typeof Worker !== 'undefined'

export const analyzeMarkdownText = async (
  content: string,
  { includeOutline = true, signal }: { includeOutline?: boolean; signal?: AbortSignal } = {},
): Promise<MarkdownTextAnalysisResult> => {
  const fallback = () =>
    includeOutline
      ? analyzeMarkdownTextInMainThread(content)
      : { outline: [], stats: getMarkdownDocumentStats(content) }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!canUseWorker()) return fallback()
  try {
    return includeOutline
      ? await analysisWorkerClient.analyze(content, signal)
      : { outline: [], stats: await analysisWorkerClient.stats(content, signal) }
  } catch (error) {
    // Cancellation must not restart a large analysis on the UI thread.
    const cancelled =
      typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
    if (signal?.aborted || cancelled) throw error
    analysisWorkerClient.terminate()
    return fallback()
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
