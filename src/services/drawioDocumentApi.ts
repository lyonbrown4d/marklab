import { fsApi } from '@/services/fsApi'

export type DrawioSaveOptions = {
  flush: boolean
  path: string
  xml: string
}

export const drawioDocumentApi = {
  load(path: string) {
    return fsApi.readFile(path)
  },
  async save({ flush, path, xml }: DrawioSaveOptions) {
    const status = await fsApi.updateBuffer(path, xml)
    if (!flush) return status
    await fsApi.flushBuffers()
    return { ...status, dirty: false }
  },
}
