import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useLatest } from 'ahooks'
import type { PlateEditor } from 'platejs/react'
import type { AiComposerPhase, AiQuickAction } from '@/components/ai/AiInlineComposer'
import { loadInlineAiProviders, type InlineAiProvider } from '@/components/ai/aiProviderSelection'
import { useAiGenerationEvents } from '@/components/ai/useAiGenerationEvents'
import {
  buildAiReplacementPrompt,
  getAiComposerSystemPrompt,
  getAiQuickActionOutputKind,
  isAiReplacementOutput,
  type AiComposerOutputKind,
  type InlineAiComposerMessages,
} from '@/components/ai/inlineAiComposerPrompt'
import { aiApi } from '@/services/aiApi'
import { matchesShortcutAction, type ShortcutBindings } from '@/logic/shortcuts'
import {
  applyPlateAiReplacement,
  capturePlateAiSelection,
  isPlateAiSelectionCaptureUsable,
  type PlateAiSelectionCapture,
} from '@/components/plate/plateAiSelection'

type UsePlateInlineAiComposerOptions = {
  activePath: string | null
  defaultProviderId: string | null
  getEditor: () => PlateEditor | null
  messages: InlineAiComposerMessages
  readOnly: boolean
  ready: boolean
  rootRef: RefObject<HTMLDivElement | null>
  shortcutOverrides: ShortcutBindings
}

export const usePlateInlineAiComposer = ({
  activePath,
  defaultProviderId,
  getEditor,
  messages,
  readOnly,
  ready,
  rootRef,
  shortcutOverrides,
}: UsePlateInlineAiComposerOptions) => {
  const [capture, setCapture] = useState<PlateAiSelectionCapture | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')
  const [outputKind, setOutputKind] = useState<AiComposerOutputKind>('replacement')
  const [phase, setPhase] = useState<AiComposerPhase>('prompt')
  const [proposal, setProposal] = useState('')
  const [provider, setProvider] = useState<InlineAiProvider | null>(null)
  const [providers, setProviders] = useState<InlineAiProvider[]>([])
  const activePathRef = useLatest(activePath)
  const captureRef = useLatest(capture)
  const proposalRef = useLatest(proposal)
  const availabilityRef = useLatest({ readOnly, ready })
  const requestVersionRef = useRef(0)
  const mountedRef = useRef(true)

  const { activateRequest, beginRequest, clearBufferedDeltas, listenerReadyRef, requestIdRef } =
    useAiGenerationEvents({
      onDelta: (delta) => setProposal((current) => current + delta),
      onTerminal: (event) => {
        if (event.type === 'finish') setPhase('proposal')
        else if (event.type === 'error') {
          setError(event.message)
          setPhase('error')
        } else setPhase('prompt')
      },
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

  const reset = useCallback(() => {
    cancelCurrentRequest()
    setCapture(null)
    setError(null)
    setInstruction('')
    setOutputKind('replacement')
    setProposal('')
    setProvider(null)
    setPhase('prompt')
  }, [cancelCurrentRequest])

  useEffect(() => {
    if (!capture) return
    if (
      capture.documentPath !== activePath ||
      readOnly ||
      !ready ||
      !isPlateAiSelectionCaptureUsable(getEditor(), capture)
    ) {
      queueMicrotask(reset)
    }
  }, [activePath, capture, getEditor, readOnly, ready, reset])
  useEffect(() => () => cancelCurrentRequest(), [cancelCurrentRequest])

  const open = useCallback(async () => {
    if (availabilityRef.current.readOnly || !availabilityRef.current.ready) return
    const editor = getEditor()
    const root = rootRef.current
    if (!editor || !root) return
    const nextCapture = capturePlateAiSelection(editor, activePathRef.current, root)
    if (!nextCapture) return
    reset()
    setCapture(nextCapture)
    setPhase('loading-provider')
    const openingVersion = requestVersionRef.current
    const loaded = await loadInlineAiProviders(defaultProviderId, aiApi.listProviders, messages)
    if (!mountedRef.current || openingVersion !== requestVersionRef.current) return
    if (
      availabilityRef.current.readOnly ||
      !availabilityRef.current.ready ||
      !isPlateAiSelectionCaptureUsable(getEditor(), nextCapture)
    ) {
      reset()
      return
    }
    setProviders(loaded.providers)
    setProvider(loaded.provider)
    if (!loaded.provider) {
      setError(loaded.error)
      setPhase('error')
      return
    }
    setPhase('prompt')
  }, [activePathRef, availabilityRef, defaultProviderId, getEditor, messages, reset, rootRef])

  useEffect(() => {
    const root = rootRef.current
    if (!root || !ready || readOnly) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !matchesShortcutAction(event, 'editor.inlineAiComposer', shortcutOverrides) ||
        !(event.target instanceof Node) ||
        !root.contains(event.target)
      )
        return
      event.preventDefault()
      event.stopPropagation()
      void open()
    }
    root.addEventListener('keydown', handleKeyDown)
    return () => root.removeEventListener('keydown', handleKeyDown)
  }, [open, readOnly, ready, rootRef, shortcutOverrides])

  const submit = useCallback(
    async (nextInstruction: string, nextOutputKind: AiComposerOutputKind = 'replacement') => {
      const currentCapture = captureRef.current
      if (!currentCapture || !provider || requestIdRef.current || !nextInstruction.trim()) return
      if (!isPlateAiSelectionCaptureUsable(getEditor(), currentCapture)) {
        reset()
        return
      }
      if (!beginRequest()) return
      const requestVersion = requestVersionRef.current + 1
      requestVersionRef.current = requestVersion
      setInstruction(nextInstruction)
      setOutputKind(nextOutputKind)
      setError(null)
      setProposal('')
      setPhase('starting')
      try {
        await listenerReadyRef.current
        if (!mountedRef.current || requestVersion !== requestVersionRef.current) return
        const result = await aiApi.startGeneration({
          providerId: provider.id,
          prompt: buildAiReplacementPrompt(nextInstruction, currentCapture.sourceText),
          system: getAiComposerSystemPrompt(nextOutputKind),
          maxOutputTokens: 2_048,
        })
        if (
          !mountedRef.current ||
          requestVersion !== requestVersionRef.current ||
          currentCapture.documentPath !== activePathRef.current ||
          availabilityRef.current.readOnly ||
          !availabilityRef.current.ready
        ) {
          if (requestVersion === requestVersionRef.current) clearBufferedDeltas()
          void aiApi.cancelGeneration(result.requestId).catch(() => undefined)
          return
        }
        setPhase('streaming')
        if (!activateRequest(result.requestId)) {
          void aiApi.cancelGeneration(result.requestId).catch(() => undefined)
        }
      } catch (nextError) {
        if (requestVersion !== requestVersionRef.current) return
        clearBufferedDeltas()
        setError(nextError instanceof Error ? nextError.message : String(nextError))
        setPhase('error')
      }
    },
    [
      activePathRef,
      activateRequest,
      availabilityRef,
      beginRequest,
      captureRef,
      clearBufferedDeltas,
      getEditor,
      listenerReadyRef,
      provider,
      requestIdRef,
      reset,
    ],
  )

  const accept = useCallback(() => {
    if (!isAiReplacementOutput(outputKind)) return
    const currentCapture = captureRef.current
    if (!currentCapture) return
    const result = applyPlateAiReplacement(
      getEditor(),
      currentCapture,
      activePathRef.current,
      proposalRef.current,
    )
    if (!result.ok) {
      setError(messages.staleSelection)
      setPhase('error')
      return
    }
    reset()
  }, [
    activePathRef,
    captureRef,
    getEditor,
    messages.staleSelection,
    outputKind,
    proposalRef,
    reset,
  ])

  const quickAction = useCallback(
    (action: AiQuickAction) => {
      const nextInstruction = messages.quickActionInstructions[action]
      const nextOutputKind = getAiQuickActionOutputKind(action)
      setInstruction(nextInstruction)
      void submit(nextInstruction, nextOutputKind)
    },
    [messages.quickActionInstructions, submit],
  )

  return {
    accept,
    anchor: capture?.anchor ?? { left: 8, top: 8 },
    dismiss: reset,
    error,
    instruction,
    isOpen: capture !== null,
    modelLabel: provider?.label ?? '',
    open,
    outputKind,
    providerId: provider?.id ?? '',
    providers,
    phase,
    proposal,
    quickAction,
    retry: () => void submit(instruction, outputKind),
    setInstruction,
    setOutputKind,
    setProviderId: (providerId: string) => {
      const nextProvider = providers.find((candidate) => candidate.id === providerId)
      if (!nextProvider) return
      setProvider(nextProvider)
      setError(null)
      setPhase('prompt')
    },
    sourceText: capture?.sourceText ?? '',
    stop: () => {
      cancelCurrentRequest()
      setProposal('')
      setPhase('prompt')
    },
    submit,
  }
}
