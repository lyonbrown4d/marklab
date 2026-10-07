import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'

import {
  previewCaptureQueue,
  type PreviewCapturePriority,
} from '@/components/previews/previewCaptureQueue'
import { linkPreviewApi } from '@/services/linkPreviewApi'

type ExternalWebPreviewDataOptions = {
  capturePriority: PreviewCapturePriority
  captureRequested: boolean
  metadataRequested: boolean
  url: string
}

const captureDemandByUrl = new Map<string, number>()

const isRetryableQueueError = (error: unknown) => {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'PreviewCaptureQueueFullError' ||
    error.name === 'PreviewCaptureQueueCancelledError'
  )
}

export const retainPreviewCaptureDemand = (url: string): (() => void) => {
  captureDemandByUrl.set(url, (captureDemandByUrl.get(url) ?? 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const remaining = (captureDemandByUrl.get(url) ?? 1) - 1
    if (remaining > 0) {
      captureDemandByUrl.set(url, remaining)
      return
    }
    captureDemandByUrl.delete(url)
    previewCaptureQueue.cancel(url)
  }
}

export const useExternalWebPreviewData = ({
  capturePriority,
  captureRequested,
  metadataRequested,
  url,
}: ExternalWebPreviewDataOptions) => {
  const retriedInteractiveError = useRef(false)
  const metadata = useQuery({
    enabled: metadataRequested,
    queryFn: () => linkPreviewApi.fetch(url),
    queryKey: ['link-preview', url],
    staleTime: 30 * 60 * 1000,
  })
  const capture = useQuery({
    enabled: captureRequested,
    queryFn: ({ signal }) =>
      previewCaptureQueue.enqueue({
        key: url,
        priority: capturePriority,
        run: () => linkPreviewApi.capture(url),
        signal,
      }),
    queryKey: ['link-preview-capture', url],
    retry: false,
    staleTime: 30 * 60 * 1000,
  })
  const refetchMetadata = metadata.refetch
  const refetchCapture = capture.refetch

  useEffect(() => {
    if (!captureRequested) return
    return retainPreviewCaptureDemand(url)
  }, [captureRequested, url])
  useEffect(() => {
    if (capturePriority === 'background') {
      retriedInteractiveError.current = false
      return
    }
    if (!captureRequested) return
    previewCaptureQueue.promote(url)
    if (
      capture.isError &&
      isRetryableQueueError(capture.error) &&
      !retriedInteractiveError.current
    ) {
      retriedInteractiveError.current = true
      void refetchCapture()
    }
  }, [capture.error, capture.isError, capturePriority, captureRequested, refetchCapture, url])
  useEffect(() => {
    if (capture.isSuccess) retriedInteractiveError.current = false
  }, [capture.isSuccess])

  const retryPreview = useCallback(() => {
    void Promise.all([refetchMetadata(), refetchCapture()])
  }, [refetchCapture, refetchMetadata])

  return { capture, metadata, retryPreview }
}
