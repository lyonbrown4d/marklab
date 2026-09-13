import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ViewMode } from '@/store/appTypes'

type EditorStatusContextValue = {
  activePath: string | null
  viewMode: ViewMode
  target: HTMLDivElement | null
  setTarget: (target: HTMLDivElement | null) => void
}

const EditorStatusContext = createContext<EditorStatusContextValue | null>(null)

export const AppStatusBarProvider = ({
  activePath,
  viewMode,
  children,
}: {
  activePath: string | null
  viewMode: ViewMode
  children: ReactNode
}) => {
  const [target, setTarget] = useState<HTMLDivElement | null>(null)
  const context = useMemo(
    () => ({ activePath, viewMode, target, setTarget }),
    [activePath, viewMode, target],
  )

  return (
    <EditorStatusContext.Provider value={context}>
      <div className="app-shell flex h-full flex-col">{children}</div>
    </EditorStatusContext.Provider>
  )
}

export const EditorStatusBarSlot = ({ label }: { label: string }) => {
  const context = useContext(EditorStatusContext)

  return (
    <div
      ref={context?.setTarget}
      aria-label={label}
      className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-1 outline-none focus-visible:ring-1 focus-visible:ring-ring empty:hidden"
      role="group"
      tabIndex={0}
    />
  )
}

export const EditorStatusBar = ({
  activePath,
  viewMode,
  children,
}: {
  activePath: string | null
  viewMode: ViewMode
  children: ReactNode
}) => {
  const context = useContext(EditorStatusContext)
  if (
    !context?.target ||
    !activePath ||
    activePath !== context.activePath ||
    viewMode !== context.viewMode
  ) {
    return null
  }

  return createPortal(
    <div className="flex items-center justify-end gap-3 text-[11px] tabular-nums">{children}</div>,
    context.target,
  )
}
