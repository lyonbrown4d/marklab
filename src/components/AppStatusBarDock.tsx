import type { ReactNode } from 'react'

type AppStatusBarDockProps = {
  children: ReactNode
  open: boolean
}

export const AppStatusBarDock = ({ children, open }: AppStatusBarDockProps) => (
  <div
    aria-hidden={!open}
    data-state={open ? 'open' : 'closed'}
    data-testid="app-status-bar-dock"
    inert={open ? undefined : true}
    className={`grid shrink-0 transition-[grid-template-rows,opacity] duration-[180ms] ease-out motion-reduce:transition-none ${open ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'}`}
  >
    <div className="min-h-0 overflow-hidden">{children}</div>
  </div>
)
