import { useEffect, useState } from 'react'
import type { pdfjs } from 'react-pdf'

import { createNativePdfRange } from '@/components/previews/nativePdfRange'
import { toWebviewAssetUrl } from '@/runtime/assetUrl'
import { isTauriRuntime } from '@/runtime/environment'

type Range = InstanceType<typeof pdfjs.PDFDataRangeTransport>
type Source = { range: Range }

export const usePdfSource = (url: string) => {
  const native =
    isTauriRuntime() && /^(?:marklab-asset:\/\/|http:\/\/marklab-asset\.localhost\/)/.test(url)
  const [state, setState] = useState<{ key: string; file: Source | null; failed: boolean }>({
    key: '',
    file: null,
    failed: false,
  })
  useEffect(() => {
    if (!native) return
    const controller = new AbortController()
    let transport: Range | undefined
    const failed = () => {
      if (!controller.signal.aborted) setState({ key: url, file: null, failed: true })
    }
    void createNativePdfRange(url, controller.signal, failed)
      .then((range) => {
        transport = range
        if (controller.signal.aborted) range.abort()
        else setState({ key: url, file: { range }, failed: false })
      })
      .catch(failed)
    return () => {
      controller.abort()
      transport?.abort()
    }
  }, [url, native])
  if (!native) return { file: toWebviewAssetUrl(url), failed: false }
  return state.key === url ? state : { file: null, failed: false }
}
