import { APP_EVENT, emitAppEvent, onAppEvent, type AppEventMap } from '@/utils/appEvents'
import { createStore } from 'zustand/vanilla'
export const FOCUS_HEADING_EVENT = APP_EVENT.focusHeading
export const FOCUS_SOURCE_POSITION_EVENT = APP_EVENT.focusSourcePosition
export type FocusHeadingRequest = AppEventMap[typeof FOCUS_HEADING_EVENT] & {
  workspaceKey?: string
}
export type FocusSourcePositionRequest = AppEventMap[typeof FOCUS_SOURCE_POSITION_EVENT]
export type PendingFocusHeadingRequest = FocusHeadingRequest & {
  workspaceKey: string
}
export type PendingFocusSourcePositionRequest = FocusSourcePositionRequest & {
  workspaceKey: string
}

type HeadingNavigationState = {
  requests: Record<string, PendingFocusHeadingRequest>
}

type SourcePositionNavigationState = {
  requests: Record<string, PendingFocusSourcePositionRequest>
}

type ActiveHeadingState = {
  headings: Record<string, string | null>
}

const navigationKey = (workspaceKey: string, path: string) => `${workspaceKey}:${path}`

export const headingNavigationStore = createStore<HeadingNavigationState>(() => ({ requests: {} }))
export const sourcePositionNavigationStore = createStore<SourcePositionNavigationState>(() => ({
  requests: {},
}))
export const activeHeadingStore = createStore<ActiveHeadingState>(() => ({ headings: {} }))

export const setActiveHeading = (path: string, slug: string | null) => {
  if (activeHeadingStore.getState().headings[path] === slug) return
  activeHeadingStore.setState((state) => ({
    headings: { ...state.headings, [path]: slug },
  }))
}

export const clearActiveHeading = (path: string) => {
  if (!(path in activeHeadingStore.getState().headings)) return
  activeHeadingStore.setState((state) => {
    const headings = { ...state.headings }
    delete headings[path]
    return { headings }
  })
}
export const requestFocusHeading = (request: FocusHeadingRequest) => {
  if (request.workspaceKey) {
    const pending = request as PendingFocusHeadingRequest
    headingNavigationStore.setState((state) => ({
      requests: {
        ...state.requests,
        [navigationKey(pending.workspaceKey, pending.path)]: pending,
      },
    }))
  }
  emitAppEvent(FOCUS_HEADING_EVENT, request)
}
export const requestFocusSourcePosition = (request: FocusSourcePositionRequest) => {
  if (request.workspaceKey) {
    const pending = request as PendingFocusSourcePositionRequest
    sourcePositionNavigationStore.setState((state) => ({
      requests: {
        ...state.requests,
        [navigationKey(pending.workspaceKey, pending.path)]: pending,
      },
    }))
  }
  emitAppEvent(FOCUS_SOURCE_POSITION_EVENT, request)
}
export const onFocusHeadingRequest = (handler: (request: FocusHeadingRequest) => void) => {
  return onAppEvent(FOCUS_HEADING_EVENT, (request) => handler(request))
}
export const onFocusSourcePositionRequest = (
  handler: (request: FocusSourcePositionRequest) => void,
) => onAppEvent(FOCUS_SOURCE_POSITION_EVENT, handler)
export const clearFocusSourcePositionRequest = (request: PendingFocusSourcePositionRequest) => {
  const key = navigationKey(request.workspaceKey, request.path)
  if (sourcePositionNavigationStore.getState().requests[key] !== request) return
  sourcePositionNavigationStore.setState((state) => {
    const requests = { ...state.requests }
    delete requests[key]
    return { requests }
  })
}

export const clearFocusHeadingRequest = (request: PendingFocusHeadingRequest) => {
  const key = navigationKey(request.workspaceKey, request.path)
  if (headingNavigationStore.getState().requests[key] !== request) return
  headingNavigationStore.setState((state) => {
    const requests = { ...state.requests }
    delete requests[key]
    return { requests }
  })
}

export const clearPendingHeadingNavigation = () => {
  headingNavigationStore.setState({ requests: {} })
}

export const clearPendingSourcePositionNavigation = () => {
  sourcePositionNavigationStore.setState({ requests: {} })
}
