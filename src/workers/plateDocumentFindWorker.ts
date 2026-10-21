import { expose } from 'comlink'
import { plateDocumentFindWorkerApi } from '@/workers/plateDocumentFindWorkerApi'

expose(plateDocumentFindWorkerApi)
