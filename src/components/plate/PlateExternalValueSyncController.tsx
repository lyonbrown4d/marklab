import { useEffect, useLayoutEffect, type RefObject } from 'react'
import { usePlateExternalValueSync } from '@/components/plate/usePlateExternalValueSync'

export type PlateExternalValueSyncHandle = {
  applyPending: () => boolean
}

type PlateExternalValueSyncControllerProps = Parameters<typeof usePlateExternalValueSync>[0] & {
  contentReady: boolean
  controllerRef: RefObject<PlateExternalValueSyncHandle | null>
  loadingRef: RefObject<boolean>
}

export const PlateExternalValueSyncController = ({
  contentReady,
  controllerRef,
  editableRef,
  loadingRef,
  ...options
}: PlateExternalValueSyncControllerProps) => {
  const sync = usePlateExternalValueSync({ ...options, editableRef })

  useLayoutEffect(() => {
    const externalChangeCanStart =
      options.ready &&
      options.latestExternalValueRef.current !== options.value &&
      options.localEchoRef.current !== options.value &&
      !options.composingRef.current &&
      (options.readOnly || editableRef.current !== document.activeElement)
    const loading = sync.loading || externalChangeCanStart
    controllerRef.current = { applyPending: sync.applyPending }
    loadingRef.current = loading

    const editable = editableRef.current
    if (editable) {
      const busy = !contentReady || loading
      editable.dataset.state = busy ? 'loading' : 'ready'
      editable.setAttribute('aria-busy', busy ? 'true' : 'false')
      editable.toggleAttribute('inert', busy)
      editable.classList.toggle('invisible', busy)
      if (busy) editable.setAttribute('aria-hidden', 'true')
      else editable.removeAttribute('aria-hidden')
    }
  })

  useEffect(
    () => () => {
      controllerRef.current = null
      loadingRef.current = false
    },
    [controllerRef, loadingRef],
  )

  return null
}
