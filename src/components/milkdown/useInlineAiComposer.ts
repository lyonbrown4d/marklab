import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { EditorView } from '@milkdown/kit/prose/view'
import { useLatest } from 'ahooks'
import type { AiComposerPhase, AiQuickAction } from '@/components/ai/AiInlineComposer'
import { resolveInlineAiProvider, type InlineAiProvider } from '@/components/ai/aiProviderSelection'
import {
  applyAiReplacement,
  captureAiSelection,
  isAiSelectionCaptureUsable,
  type AiSelectionCapture,
} from '@/components/milkdown/aiSelection'
import { useAiGenerationEvents } from '@/components/milkdown/useAiGenerationEvents'
import {
  buildAiReplacementPrompt,
  type InlineAiComposerMessages,
} from '@/components/milkdown/inlineAiComposerPrompt'
import { aiApi, type AiGenerationEvent } from '@/services/aiApi'

type UseInlineAiComposerOptions = {
  activePath: string | null
  defaultProviderId: string | null
  getEditorView: () => EditorView | null
  messages: InlineAiComposerMessages
  readOnly: boolean
  ready: boolean
  rootRef: RefObject<HTMLDivElement | null>
}

export const useInlineAiComposer = ({
  activePath,
  defaultProviderId,
  getEditorView,
  messages,
  readOnly,
  ready,
  rootRef,
}: UseInlineAiComposerOptions) => {
  const [capture, setCapture] = useState<AiSelectionCapture | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')
  const [phase, setPhase] = useState<AiComposerPhase>('prompt')
  const [proposal, setProposal] = useState('')
  const [provider, setProvider] = useState<InlineAiProvider | null>(null)
  const activePathRef = useLatest(activePath)
  const captureRef = useLatest(capture)
  const proposalRef = useLatest(proposal)
  const requestVersionRef = useRef(0)
  const mountedRef = useRef(true)

  const handleTerminalEvent = useCallback(
    (event: Exclude<AiGenerationEvent, { type: 'delta' }>) => {
      if (event.type === 'finish') {
        setPhase('proposal')
        return
      }
      if (event.type === 'error') {
        setError(event.message)
        setPhase('error')
        return
      }
      setPhase('prompt')
    },
    [],
  )

  const { clearBufferedDeltas, listenerReadyRef, requestIdRef } = useAiGenerationEvents({
    onDelta: (delta) => setProposal((current) => current + delta),
    onTerminal: handleTerminalEvent,
  })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const cancelCurrentRequest = useCallback(() => {
    requestVersionRef.current += 1
    clearBufferedDeltas()
    const requestId = requestIdRef.current
    requestIdRef.current = null
    if (requestId) void aiApi.cancelGeneration(requestId).catch(() => undefined)
  }, [clearBufferedDeltas, requestIdRef])

  const reset = useCallback(
    (restoreFocus: boolean) => {
      cancelCurrentRequest()
      setCapture(null)
      setError(null)
      setInstruction('')
      setProposal('')
      setProvider(null)
      setPhase('prompt')
      if (!restoreFocus) return
      const view = getEditorView()
      if (view && !view.isDestroyed && view.editable) view.focus()
    },
    [cancelCurrentRequest, getEditorView],
  )

  const dismiss = useCallback(() => reset(true), [reset])

  useEffect(() => {
    if (!capture) return
    const currentView = getEditorView()
    if (
      capture.documentPath !== activePath ||
      readOnly ||
      !ready ||
      !isAiSelectionCaptureUsable(currentView, capture)
    ) {
      let disposed = false
      queueMicrotask(() => {
        if (!disposed) reset(false)
      })
      return () => {
        disposed = true
      }
    }
    return undefined
  }, [activePath, capture, getEditorView, readOnly, ready, reset])

  useEffect(() => () => cancelCurrentRequest(), [cancelCurrentRequest])

  const open = useCallback(
    async (view: EditorView) => {
      const nextCapture = captureAiSelection(view, activePathRef.current)
      if (!nextCapture) return
      cancelCurrentRequest()
      setCapture(nextCapture)
      setError(null)
      setInstruction('')
      setProposal('')
      setProvider(null)
      setPhase('loading-provider')
      const openingVersion = requestVersionRef.current
      const [providersResult, localResult] = await Promise.allSettled([
        aiApi.listProviders(),
        aiApi.localStatus(),
      ])
      if (!mountedRef.current || openingVersion !== requestVersionRef.current) return
      if (readOnly || !ready || !isAiSelectionCaptureUsable(getEditorView(), nextCapture)) {
        reset(false)
        return
      }
      const nextProvider = resolveInlineAiProvider(
        defaultProviderId,
        providersResult.status === 'fulfilled' ? providersResult.value : [],
        localResult.status === 'fulfilled' ? localResult.value : null,
      )
      setProvider(nextProvider)
      if (!nextProvider) {
        setError(
          defaultProviderId === null ? messages.noProvider : messages.defaultProviderUnavailable,
        )
        setPhase('error')
        return
      }
      setPhase('prompt')
    },
    [
      activePathRef,
      cancelCurrentRequest,
      defaultProviderId,
      getEditorView,
      messages,
      readOnly,
      ready,
      reset,
    ],
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root || !ready || readOnly) return undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.key.toLowerCase() !== 'j' ||
        (!event.ctrlKey && !event.metaKey) ||
        event.altKey ||
        event.shiftKey
      )
        return
      const view = getEditorView()
      const target = event.target
      if (
        !view ||
        view.isDestroyed ||
        !view.editable ||
        !view.hasFocus() ||
        !(target instanceof Node) ||
        !view.dom.contains(target)
      )
        return
      event.preventDefault()
      event.stopPropagation()
      void open(view)
    }
    root.addEventListener('keydown', handleKeyDown)
    return () => root.removeEventListener('keydown', handleKeyDown)
  }, [getEditorView, open, readOnly, ready, rootRef])

  const submit = useCallback(
    async (nextInstruction: string) => {
      const currentCapture = captureRef.current
      if (!currentCapture || !provider || requestIdRef.current || !nextInstruction.trim()) return
      const currentView = getEditorView()
      if (!isAiSelectionCaptureUsable(currentView, currentCapture)) {
        reset(false)
        return
      }
      const requestVersion = requestVersionRef.current + 1
      requestVersionRef.current = requestVersion
      clearBufferedDeltas()
      setInstruction(nextInstruction)
      setError(null)
      setProposal('')
      setPhase('starting')
      try {
        await listenerReadyRef.current
        const result = await aiApi.startGeneration({
          providerId: provider.id,
          prompt: buildAiReplacementPrompt(nextInstruction, currentCapture.sourceText),
          system: 'Return only plain replacement text. Do not include HTML or commentary.',
          maxOutputTokens: 2_048,
        })
        if (
          !mountedRef.current ||
          requestVersion !== requestVersionRef.current ||
          currentCapture.documentPath !== activePathRef.current
        ) {
          void aiApi.cancelGeneration(result.requestId).catch(() => undefined)
          return
        }
        requestIdRef.current = result.requestId
        setPhase('streaming')
      } catch (nextError) {
        if (requestVersion !== requestVersionRef.current) return
        setError(nextError instanceof Error ? nextError.message : String(nextError))
        setPhase('error')
      }
    },
    [
      activePathRef,
      captureRef,
      clearBufferedDeltas,
      getEditorView,
      listenerReadyRef,
      provider,
      requestIdRef,
      reset,
    ],
  )

  const stop = useCallback(() => {
    cancelCurrentRequest()
    setProposal('')
    setPhase('prompt')
  }, [cancelCurrentRequest])

  const accept = useCallback(() => {
    const view = getEditorView()
    const currentCapture = captureRef.current
    if (!view || !currentCapture) return
    const result = applyAiReplacement(
      view,
      currentCapture,
      activePathRef.current,
      proposalRef.current,
    )
    if (!result.ok) {
      setError(messages.staleSelection)
      setPhase('error')
      return
    }
    reset(false)
  }, [activePathRef, captureRef, getEditorView, messages.staleSelection, proposalRef, reset])

  const quickAction = useCallback(
    (action: AiQuickAction) => {
      const nextInstruction = messages.quickActionInstructions[action]
      setInstruction(nextInstruction)
      void submit(nextInstruction)
    },
    [messages.quickActionInstructions, submit],
  )

  return {
    accept,
    anchor: capture?.anchor ?? { left: 8, top: 8 },
    dismiss,
    error,
    instruction,
    isOpen: capture !== null,
    modelLabel: provider?.label ?? '',
    phase,
    proposal,
    quickAction,
    retry: () => void submit(instruction),
    setInstruction,
    sourceText: capture?.sourceText ?? '',
    stop,
    submit,
  }
}
