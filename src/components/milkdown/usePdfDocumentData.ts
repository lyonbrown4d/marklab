import { useEffect, useState } from 'react'
import { fetchPdfDocumentData } from '@/components/milkdown/pdfDocumentSource'

type PdfDataState = {
  key: string
  file: { data: Uint8Array<ArrayBuffer> } | null
  error: Error | null
}

export const usePdfDocumentData = (fileUrl: string) => {
  const [state, setState] = useState<PdfDataState>({ key: '', file: null, error: null })
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const dispose = () => {
      active = false
      controller.abort()
    }
    window.addEventListener('pagehide', dispose)
    void fetchPdfDocumentData(fileUrl, controller.signal).then(
      (data) => {
        // Each viewer owns its buffer: PDF.js transfers it to its worker.
        if (active) setState({ key: fileUrl, file: { data }, error: null })
      },
      (error: unknown) => {
        if (!active || (error instanceof Error && error.name === 'AbortError')) return
        setState({
          key: fileUrl,
          file: null,
          error: error instanceof Error ? error : new Error('Failed to read PDF'),
        })
      },
    )
    return () => {
      window.removeEventListener('pagehide', dispose)
      dispose()
    }
  }, [fileUrl])
  const current = state.key === fileUrl ? state : { file: null, error: null }
  return { ...current, loading: !current.file && !current.error }
}
