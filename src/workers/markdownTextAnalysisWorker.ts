import { expose } from 'comlink'
import { markdownTextAnalysisWorkerApi } from '@/workers/markdownTextAnalysisWorkerApi'

expose(markdownTextAnalysisWorkerApi)
