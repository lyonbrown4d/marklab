import MarkdownTextAnalysisWorker from '@/workers/markdownTextAnalysisWorker?worker'
import {
  analyzeMarkdownText as analyzeMarkdownTextInMainThread,
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
