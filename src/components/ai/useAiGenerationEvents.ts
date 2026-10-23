import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useLatest } from 'ahooks'
import { aiApi, type AiGenerationEvent } from '@/services/aiApi'

type TerminalAiGenerationEvent = Exclude<AiGenerationEvent, { type: 'delta' }>

type UseAiGenerationEventsOptions = {
  onDelta: (delta: string) => void
  onTerminal: (event: TerminalAiGenerationEvent) => void
}

type DeltaBuffer = {
  append: (delta: string) => void
  clear: () => void
  flush: () => void
}

type PendingRequestEvents = {
  events: AiGenerationEvent[]
  size: number
  overflow: boolean
}

// IPC acknowledgement can arrive after events. Bound both tiny-event counts and text size.
const MAX_STARTUP_EVENTS = 512
const MAX_STARTUP_CHARACTERS = 256 * 1_024

const createDeltaBuffer = (onFlush: (delta: string) => void): DeltaBuffer => {
  let frame: number | null = null
  let pending = ''

  const flush = () => {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    const delta = pending
    pending = ''
    if (delta) onFlush(delta)
  }

  return {
    append: (delta) => {
      pending += delta
      if (frame === null) frame = requestAnimationFrame(flush)
    },
    clear: () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      pending = ''
    },
    flush,
  }
}

export const useAiGenerationEvents = ({
  onDelta,
  onTerminal,
}: UseAiGenerationEventsOptions): {
  beginRequest: () => boolean
  activateRequest: (requestId: string) => boolean
  clearBufferedDeltas: () => void
  listenerReadyRef: RefObject<Promise<unknown> | null>
  requestIdRef: RefObject<string | null>
} => {
  const onDeltaRef = useLatest(onDelta)
  const onTerminalRef = useLatest(onTerminal)
  const listenerReadyRef = useRef<Promise<unknown> | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const bufferRef = useRef<DeltaBuffer | null>(null)
  const pendingRef = useRef<PendingRequestEvents | null>(null)

  const clearBufferedDeltas = useCallback(() => {
    bufferRef.current?.clear()
    pendingRef.current = null
  }, [])

  const beginRequest = useCallback(() => {
    if (requestIdRef.current || pendingRef.current) return false
    bufferRef.current?.clear()
    pendingRef.current = { events: [], size: 0, overflow: false }
    return true
  }, [])

  const applyEvent = useCallback(
    (event: AiGenerationEvent) => {
      if (event.requestId !== requestIdRef.current) return
      if (event.type === 'delta') {
        bufferRef.current?.append(event.delta)
        return
      }
      bufferRef.current?.flush()
      requestIdRef.current = null
      onTerminalRef.current(event)
    },
    [onTerminalRef],
  )

  const activateRequest = useCallback(
    (requestId: string) => {
      const pending = pendingRef.current
      pendingRef.current = null
      if (!pending) return false
      if (pending.overflow) {
        onTerminalRef.current({
          requestId,
          type: 'error',
          message: 'AI generation events exceeded the startup buffer limit. Please retry.',
        })
        return false
      }
      requestIdRef.current = requestId
      pending.events.forEach(applyEvent)
      return true
    },
    [applyEvent, onTerminalRef],
  )

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null
    bufferRef.current = createDeltaBuffer((delta) => onDeltaRef.current(delta))
    const listening = aiApi.onGenerationEvent((event) => {
      if (disposed) return
      if (requestIdRef.current) {
        applyEvent(event)
        return
      }
      const pending = pendingRef.current
      if (!pending || pending.overflow) return
      const size = JSON.stringify(event).length
      if (
        pending.events.length >= MAX_STARTUP_EVENTS ||
        pending.size + size > MAX_STARTUP_CHARACTERS
      ) {
        pending.events = []
        pending.overflow = true
        return
      }
      pending.events.push(event)
      pending.size += size
    })
    void listening.then(
      (nextUnlisten) => {
        if (!disposed) unlisten = nextUnlisten
        else nextUnlisten()
      },
      () => undefined,
    )
    listenerReadyRef.current = listening
    return () => {
      disposed = true
      clearBufferedDeltas()
      unlisten?.()
      listenerReadyRef.current = null
    }
  }, [applyEvent, clearBufferedDeltas, onDeltaRef])

  return { activateRequest, beginRequest, clearBufferedDeltas, listenerReadyRef, requestIdRef }
}
