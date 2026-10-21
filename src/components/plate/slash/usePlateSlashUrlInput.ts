import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type {
  PlateSlashUrlInsertionRequest,
  PlateSlashUrlValues,
} from '@/components/plate/slash/types'

export const usePlateSlashUrlInput = (documentIdentity: string | null | undefined) => {
  const pendingRef = useRef<PlateSlashUrlInsertionRequest | null>(null)
  const [request, setRequest] = useState<PlateSlashUrlInsertionRequest | null>(null)
  const [failed, setFailed] = useState(false)
  const [requestId, setRequestId] = useState(0)

  const invalidate = useCallback(() => {
    pendingRef.current?.invalidate()
    pendingRef.current = null
    setRequest(null)
    setFailed(false)
  }, [])

  useLayoutEffect(() => invalidate, [documentIdentity, invalidate])

  const open = useCallback((next: PlateSlashUrlInsertionRequest) => {
    pendingRef.current?.invalidate()
    pendingRef.current = next
    setFailed(false)
    setRequest(next)
    setRequestId((current) => current + 1)
  }, [])

  const cancel = useCallback((target: PlateSlashUrlInsertionRequest, restoreFocus = true) => {
    if (pendingRef.current !== target) return
    if (restoreFocus) target.restoreFocus()
    target.invalidate()
    pendingRef.current = null
    setRequest(null)
    setFailed(false)
  }, [])

  const submit = useCallback(
    (target: PlateSlashUrlInsertionRequest, values: PlateSlashUrlValues) => {
      if (pendingRef.current !== target) return
      pendingRef.current = null
      try {
        target.insert(values)
        setRequest(null)
        setFailed(false)
      } catch (error) {
        pendingRef.current = target
        setFailed(true)
        console.error('Failed to insert Plate slash URL', error)
        return
      }
      target.restoreFocus()
      target.invalidate()
    },
    [],
  )

  return { cancel, failed, invalidate, open, request, requestId, submit }
}

export type PlateSlashUrlInputState = ReturnType<typeof usePlateSlashUrlInput>
