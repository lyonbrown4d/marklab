import mitt, { type Handler } from 'mitt'

export const APP_EVENT = {
  exportContent: 'marklab:get-export-content',
  focusFileSearch: 'marklab:focus-file-search',
  focusHeading: 'marklab:focus-heading',
  focusSourcePosition: 'marklab:focus-source-position',
  menuAction: 'marklab:menu-action',
} as const

export type AppEventMap = {
  [APP_EVENT.exportContent]: {
    expectedActivePath: string | null
    respond: (content: string) => void
  }
  [APP_EVENT.focusFileSearch]: undefined
  [APP_EVENT.focusHeading]: {
    path: string
    slug: string
  }
  [APP_EVENT.focusSourcePosition]: {
    path: string
    line: number
    column: number
    endColumn?: number
  }
  [APP_EVENT.menuAction]: string
}

const appEvents = mitt<AppEventMap>()

export const emitAppEvent = <EventName extends keyof AppEventMap>(
  name: EventName,
  payload: AppEventMap[EventName],
) => {
  appEvents.emit(name, payload)
}

export const onAppEvent = <EventName extends keyof AppEventMap>(
  name: EventName,
  handler: (payload: AppEventMap[EventName]) => void,
) => {
  const eventHandler = handler as Handler<AppEventMap[EventName]>
  appEvents.on(name, eventHandler)
  return () => appEvents.off(name, eventHandler)
}

export const requestFileSearchFocus = () => {
  emitAppEvent(APP_EVENT.focusFileSearch, undefined)
}

export const onFileSearchFocusRequest = (handler: () => void) => {
  return onAppEvent(APP_EVENT.focusFileSearch, handler)
}

export const requestMenuAction = (id: string) => {
  emitAppEvent(APP_EVENT.menuAction, id)
}

export const onMenuActionRequest = (handler: (id: string) => void) => {
  return onAppEvent(APP_EVENT.menuAction, handler)
}
