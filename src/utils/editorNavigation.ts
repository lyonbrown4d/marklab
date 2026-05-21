import { APP_EVENT, emitAppEvent, onAppEvent, type AppEventMap } from '@/utils/appEvents'
export const FOCUS_HEADING_EVENT = APP_EVENT.focusHeading
export const FOCUS_SOURCE_POSITION_EVENT = APP_EVENT.focusSourcePosition
export type FocusHeadingRequest = AppEventMap[typeof FOCUS_HEADING_EVENT]
export type FocusSourcePositionRequest = AppEventMap[typeof FOCUS_SOURCE_POSITION_EVENT]
export const requestFocusHeading = (request: FocusHeadingRequest) => {
  emitAppEvent(FOCUS_HEADING_EVENT, request)
}
export const requestFocusSourcePosition = (request: FocusSourcePositionRequest) => {
  emitAppEvent(FOCUS_SOURCE_POSITION_EVENT, request)
}
export const onFocusHeadingRequest = (handler: (request: FocusHeadingRequest) => void) => {
  return onAppEvent(FOCUS_HEADING_EVENT, handler)
}
export const onFocusSourcePositionRequest = (
  handler: (request: FocusSourcePositionRequest) => void,
) => {
  return onAppEvent(FOCUS_SOURCE_POSITION_EVENT, handler)
}
