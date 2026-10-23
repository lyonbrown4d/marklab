import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'

import type { PreviewCapturePriority } from '@/types/linkPreview'
import { linkPreviewApi } from '@/services/linkPreviewApi'
import { listen } from '@/runtime/events'

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
    'code' in error && (error.code === 'PREVIEW_QUEUE_FULL' || error.code === 'PREVIEW_CANCELLED')
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
    void linkPreviewApi.cancel(url).catch(() => undefined)
  }
}

export const useExternalWebPreviewData = ({
  capturePriority,
  captureRequested,
  metadataRequested,
  url,
}: ExternalWebPreviewDataOptions) => {
  const queryClient = useQueryClient()
  const retriedInteractiveError = useRef(false)
  const metadata = useQuery({
    enabled: metadataRequested,
    queryFn: () => linkPreviewApi.fetch(url),
    queryKey: ['link-preview', url],
    staleTime: 30 * 60 * 1000,
  })
  const capture = useQuery({
    enabled: captureRequested,
    queryFn: ({ signal }) => linkPreviewApi.capture(url, { priority: capturePriority, signal }),
    queryKey: ['link-preview-capture', url],
    retry: false,
    staleTime: 30 * 60 * 1000,
  })
  const refetchMetadata = metadata.refetch
  const refetchCapture = capture.refetch
  let canonicalUrl = url
  try {
    canonicalUrl = new URL(url).href
  } catch {
    // Invalid destinations are reported by the existing native request boundary.
  }

  useEffect(() => {
    let disposed = false
    let revision = 0
    let unlisten: (() => void) | undefined
    void listen('link-preview-updated', ({ payload }) => {
      if (payload.capture.url !== canonicalUrl) return
      const current = ++revision
      const key = ['link-preview-capture', url]
      // Abort the previous worker before publishing the already-cached native
      // frame. An older pending response must not replace a fresh live image.
      void queryClient.cancelQueries({ queryKey: key, exact: true }).then(() => {
        if (!disposed && current === revision) queryClient.setQueryData(key, payload.capture)
      })
    })
      .then((stop) => {
        if (disposed) stop()
        else unlisten = stop
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [canonicalUrl, queryClient, url])

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
    void linkPreviewApi.promote(url).catch(() => undefined)
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
