import {
  analyzeMarkdownText,
  getMarkdownDocumentStats,
  type MarkdownDocumentStats,
  type MarkdownTextAnalysisResult,
} from '@/logic/markdownTextAnalysis'

type MarkdownTextAnalysisWorkerRequest = {
  content: string
  id: number
  task: 'analysis' | 'stats'
}

type MarkdownTextAnalysisWorkerResponse =
  | {
      id: number
      ok: true
      payload: MarkdownTextAnalysisResult | MarkdownDocumentStats
      task: 'analysis' | 'stats'
    }
  | {
      error: string
      id: number
      ok: false
      task: 'analysis' | 'stats'
    }

type WorkerScope = {
  onmessage: ((event: { data: MarkdownTextAnalysisWorkerRequest }) => void) | null
  postMessage(message: MarkdownTextAnalysisWorkerResponse): void
}

const workerScope = self as unknown as WorkerScope

workerScope.onmessage = ({ data }) => {
  try {
    workerScope.postMessage({
      id: data.id,
      ok: true,
      payload:
        data.task === 'stats'
          ? getMarkdownDocumentStats(data.content)
          : analyzeMarkdownText(data.content),
      task: data.task,
    })
  } catch (error) {
    workerScope.postMessage({
      id: data.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Markdown text analysis failed.',
      task: data.task,
    })
  }
}
