import { fsApi } from '@/services/fsApi'
import { createDocumentBufferSession } from '@/services/documentBufferSession'

export const createDrawioDocumentSession = createDocumentBufferSession
export const drawioDocumentApi = { load: (path: string) => fsApi.openBufferSnapshot(path) }
