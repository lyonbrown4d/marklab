import { useEffect, useRef, useState } from 'react'
import {
  getElectronRuntime,
  isElectronRuntime,
  type ElectronUpdateResult,
  type ElectronUpdateState,
} from '@/runtime/electron'

type UpdateAction = 'check' | 'download' | 'install' | 'install-on-quit'
type InitialRequestState = 'loading' | 'success' | 'error'

type SoftwareUpdateController = {
  actionError: string | null
  check: () => Promise<void>
  download: () => Promise<void>
  initialError: string | null
  initialRequestState: InitialRequestState
  install: () => Promise<void>
  pendingAction: UpdateAction | null
  state: ElectronUpdateState | null
  setInstallOnQuit: (enabled: boolean) => Promise<void>
}

const unavailableState: ElectronUpdateState = {
  currentVersion: '—',
  error: {
    code: 'UNAVAILABLE',
    message: 'Updates are only available in the packaged desktop app.',
    operation: 'availability',
  },
  installOnQuit: false,
  status: 'unavailable',
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const useSoftwareUpdate = (): SoftwareUpdateController => {
  const runtimeAvailable = isElectronRuntime()
  const [state, setState] = useState<ElectronUpdateState | null>(() =>
    runtimeAvailable ? null : unavailableState,
  )
  const [initialRequestState, setInitialRequestState] = useState<InitialRequestState>(() =>
    runtimeAvailable ? 'loading' : 'success',
  )
  const [initialError, setInitialError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<UpdateAction | null>(null)
  const mountedRef = useRef(false)
  const inFlightRef = useRef<UpdateAction | null>(null)

  useEffect(() => {
    mountedRef.current = true
    if (!runtimeAvailable) {
      return () => {
        mountedRef.current = false
      }
    }

    const updates = getElectronRuntime().updates
    let eventReceived = false
    const unsubscribe = updates.onEvent((event) => {
      eventReceived = true
      if (!mountedRef.current) return
      setState(event)
      if (event.event !== 'error') setActionError(null)
      setInitialError(null)
      setInitialRequestState('success')
    })
    void updates
      .getState()
      .then((nextState) => {
        if (!mountedRef.current || eventReceived) return
        setState(nextState)
        setInitialRequestState('success')
      })
      .catch((error: unknown) => {
        if (!mountedRef.current) return
        setInitialError(errorMessage(error))
        setInitialRequestState('error')
      })

    return () => {
      mountedRef.current = false
      unsubscribe()
    }
  }, [runtimeAvailable])

  const runAction = async (
    action: UpdateAction,
    operation: () => Promise<ElectronUpdateResult>,
  ): Promise<void> => {
    if (inFlightRef.current) return
    inFlightRef.current = action
    setPendingAction(action)
    setActionError(null)
    try {
      const result = await operation()
      if (!mountedRef.current) return
      setState(result)
      if (!result.ok) setActionError(result.error?.message ?? 'Update operation failed.')
    } catch (error) {
      if (mountedRef.current) setActionError(errorMessage(error))
    } finally {
      inFlightRef.current = null
      if (mountedRef.current) setPendingAction(null)
    }
  }

  const updates = runtimeAvailable ? getElectronRuntime().updates : null
  return {
    actionError,
    check: () => (updates ? runAction('check', updates.check) : Promise.resolve()),
    download: () => (updates ? runAction('download', updates.download) : Promise.resolve()),
    initialError,
    initialRequestState,
    install: () => (updates ? runAction('install', updates.install) : Promise.resolve()),
    pendingAction,
    setInstallOnQuit: (enabled) =>
      updates
        ? runAction('install-on-quit', () => updates.setInstallOnQuit(enabled))
        : Promise.resolve(),
    state,
  }
}
