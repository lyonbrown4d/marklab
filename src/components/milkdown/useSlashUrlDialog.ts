import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type {
  SlashUrlInsertionRequest,
  SlashUrlValues,
} from '@/components/milkdown/slashUrlInsertion'

export const useSlashUrlDialog = (documentIdentity: string | null | undefined) => {
  const pendingRef = useRef<SlashUrlInsertionRequest | null>(null)
  const [request, setRequest] = useState<SlashUrlInsertionRequest | null>(null)
  const [failed, setFailed] = useState(false)

  const invalidate = useCallback(() => {
    pendingRef.current?.invalidate()
    pendingRef.current = null
    setRequest(null)
    setFailed(false)
  }, [])

  useLayoutEffect(() => invalidate, [documentIdentity, invalidate])

  const open = useCallback((next: SlashUrlInsertionRequest) => {
    pendingRef.current?.invalidate()
    pendingRef.current = next
    setFailed(false)
    setRequest(next)
  }, [])

  const cancel = useCallback((target: SlashUrlInsertionRequest) => {
    if (pendingRef.current !== target) return
    pendingRef.current = null
    setRequest(null)
    setFailed(false)
  }, [])

  const submit = useCallback((target: SlashUrlInsertionRequest, values: SlashUrlValues) => {
    if (pendingRef.current !== target) return
    pendingRef.current = null
    try {
      target.insert(values)
      setRequest(null)
      setFailed(false)
    } catch (error) {
      pendingRef.current = target
      setFailed(true)
      console.error('Failed to insert slash URL', error)
    }
  }, [])

  return { request, failed, open, cancel, submit, invalidate }
}
