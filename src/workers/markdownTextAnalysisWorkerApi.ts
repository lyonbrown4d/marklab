import { analyzeMarkdownText, getMarkdownDocumentStats } from '@/logic/markdownTextAnalysis'

export const markdownTextAnalysisWorkerApi = {
  analyze: analyzeMarkdownText,
  stats: getMarkdownDocumentStats,
}

export type MarkdownTextAnalysisWorkerApi = typeof markdownTextAnalysisWorkerApi
