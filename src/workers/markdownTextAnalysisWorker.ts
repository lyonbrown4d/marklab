import { analyzeMarkdownText, type MarkdownTextAnalysisResult } from '@/logic/markdownTextAnalysis'

type MarkdownTextAnalysisWorkerRequest = {
  content: string
  id: number
}

type MarkdownTextAnalysisWorkerResponse =
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
      payload: analyzeMarkdownText(data.content),
    })
  } catch (error) {
    workerScope.postMessage({
      id: data.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Markdown text analysis failed.',
    })
  }
}
