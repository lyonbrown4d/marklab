import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLatest } from 'ahooks'
import type { FileViewKind } from '@/store/appTypes'

type FocusHandoffRequest = {
  allowFocus: boolean
  id: number
  origin: HTMLElement | null
  path: string
  requestedView?: FileViewKind
  view: FileViewKind
}

type PendingFocusHandoffRequest = Omit<FocusHandoffRequest, 'view'>

type EditorFocusHandoffContextValue = {
  complete: (id: number, focus: () => void) => void
  fail: (id: number) => void
  request: FocusHandoffRequest | null
}

type EditorFocusHandoffControllerOptions = {
  activePath: string | null
  activeView: FileViewKind | null
  onComplete: () => void
}

type EditorFocusHandoffTargetOptions = {
  focus: () => void
  isReady?: () => boolean
  path: string | null
  status: 'loading' | 'ready' | 'error'
  view: FileViewKind
}

const EditorFocusHandoffContext = createContext<EditorFocusHandoffContextValue | null>(null)

const activeElement = () =>
  document.activeElement instanceof HTMLElement ? document.activeElement : null

export const useEditorFocusHandoffController = ({
  activePath,
  activeView,
  onComplete,
}: EditorFocusHandoffControllerOptions) => {
  const nextIdRef = useRef(0)
  const requestRef = useRef<PendingFocusHandoffRequest | null>(null)
  const [request, setRequest] = useState<PendingFocusHandoffRequest | null>(null)

  const cancel = useCallback(() => {
    requestRef.current = null
    setRequest(null)
  }, [])

  const begin = useCallback(
    (path: string, requestedView?: FileViewKind, origin = activeElement()) => {
      const nextRequest = {
        allowFocus: true,
        id: nextIdRef.current + 1,
        origin,
        path,
        requestedView,
      }
      nextIdRef.current = nextRequest.id
      requestRef.current = nextRequest
      setRequest(nextRequest)
    },
    [],
  )

  useEffect(() => {
    if (!request) return

    const preserveUserFocus = () => {
      const current = requestRef.current
      if (!current || !current.allowFocus) return
      const nextRequest = { ...current, allowFocus: false }
      requestRef.current = nextRequest
      setRequest(nextRequest)
    }
    window.addEventListener('blur', preserveUserFocus)
    window.addEventListener('keydown', preserveUserFocus, true)
    window.addEventListener('pointerdown', preserveUserFocus, true)
    return () => {
      window.removeEventListener('blur', preserveUserFocus)
      window.removeEventListener('keydown', preserveUserFocus, true)
      window.removeEventListener('pointerdown', preserveUserFocus, true)
    }
  }, [request])

  const complete = useCallback(
    (id: number, focus: () => void) => {
      const current = requestRef.current
      if (!current || current.id !== id) return
      requestRef.current = null
      setRequest(null)
      if (current.allowFocus) focus()
      onComplete()
    },
    [onComplete],
  )

  const fail = useCallback((id: number) => {
    const current = requestRef.current
    if (!current || current.id !== id) return
    requestRef.current = null
    setRequest(null)
    if (current.allowFocus && current.origin?.isConnected) {
      current.origin.focus({ preventScroll: true })
    }
  }, [])

  const visibleRequest = useMemo<FocusHandoffRequest | null>(() => {
    if (!request || request.path !== activePath || !activeView) return null
    if (request.requestedView && request.requestedView !== activeView) return null
    return { ...request, view: activeView }
  }, [activePath, activeView, request])

  const value = useMemo<EditorFocusHandoffContextValue>(
    () => ({ complete, fail, request: visibleRequest }),
    [complete, fail, visibleRequest],
  )

  return { begin, cancel, value }
}

export const EditorFocusHandoffProvider = ({
  children,
  value,
}: {
  children: ReactNode
  value: EditorFocusHandoffContextValue
}) => (
  <EditorFocusHandoffContext.Provider value={value}>{children}</EditorFocusHandoffContext.Provider>
)

export const useEditorFocusHandoffTarget = ({
  focus,
  isReady,
  path,
  status,
  view,
}: EditorFocusHandoffTargetOptions) => {
  const context = useContext(EditorFocusHandoffContext)
  const focusRef = useLatest(focus)
  const isReadyRef = useLatest(isReady)

  const reportStatus = useCallback(
    (nextStatus: EditorFocusHandoffTargetOptions['status']) => {
      const request = context?.request
      if (!request || !path || request.path !== path || request.view !== view) return
      if (nextStatus === 'error') {
        context.fail(request.id)
        return
      }
      if (nextStatus === 'ready') context.complete(request.id, () => focusRef.current())
    },
    [context, focusRef, path, view],
  )

  useEffect(() => {
    reportStatus(status === 'loading' && isReadyRef.current?.() ? 'ready' : status)
  }, [isReadyRef, reportStatus, status])

  return {
    reportError: () => reportStatus('error'),
    reportReady: () => reportStatus('ready'),
  }
}

export const EditorFocusHandoffFailure = ({
  path,
  view,
}: {
  path: string | null
  view: FileViewKind
}) => {
  useEditorFocusHandoffTarget({ focus: () => undefined, path, status: 'error', view })
  return null
}
