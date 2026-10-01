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
  clearBufferedDeltas: () => void
  listenerReadyRef: RefObject<Promise<unknown> | null>
  requestIdRef: RefObject<string | null>
} => {
  const onDeltaRef = useLatest(onDelta)
  const onTerminalRef = useLatest(onTerminal)
  const listenerReadyRef = useRef<Promise<unknown> | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const bufferRef = useRef<DeltaBuffer | null>(null)

  const clearBufferedDeltas = useCallback(() => bufferRef.current?.clear(), [])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null
    bufferRef.current = createDeltaBuffer((delta) => onDeltaRef.current(delta))
    const listening = aiApi.onGenerationEvent((event) => {
      if (event.requestId !== requestIdRef.current) return
      if (event.type === 'delta') {
        bufferRef.current?.append(event.delta)
        return
      }
      bufferRef.current?.flush()
      requestIdRef.current = null
      onTerminalRef.current(event)
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
      bufferRef.current?.clear()
      unlisten?.()
      listenerReadyRef.current = null
    }
  }, [onDeltaRef, onTerminalRef])

  return { clearBufferedDeltas, listenerReadyRef, requestIdRef }
}
