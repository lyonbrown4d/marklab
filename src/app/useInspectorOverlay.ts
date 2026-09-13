import { useSyncExternalStore } from 'react'

const INSPECTOR_OVERLAY_QUERY = '(max-width: 959px)'

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(INSPECTOR_OVERLAY_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const getSnapshot = () => window.matchMedia(INSPECTOR_OVERLAY_QUERY).matches
const getServerSnapshot = () => false

export const useInspectorOverlay = () =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
