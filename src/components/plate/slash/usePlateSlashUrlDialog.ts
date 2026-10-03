import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type {
  PlateSlashUrlInsertionRequest,
  PlateSlashUrlValues,
} from '@/components/plate/slash/types'

export const usePlateSlashUrlDialog = (documentIdentity: string | null | undefined) => {
  const pendingRef = useRef<PlateSlashUrlInsertionRequest | null>(null)
  const [request, setRequest] = useState<PlateSlashUrlInsertionRequest | null>(null)
  const [failed, setFailed] = useState(false)

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
  }, [])

  const cancel = useCallback((target: PlateSlashUrlInsertionRequest) => {
    if (pendingRef.current !== target) return
    target.restoreFocus()
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
      }
    },
    [],
  )

  return { cancel, failed, invalidate, open, request, submit }
}

export type PlateSlashUrlDialogState = ReturnType<typeof usePlateSlashUrlDialog>
