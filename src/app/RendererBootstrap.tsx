import { useEffect, useRef, useState, type ReactNode } from 'react'

import { useDesktopReadySignal } from '@/app/useDesktopReadySignal'
import { useWindowPresentationMotion } from '@/app/useWindowPresentationMotion'
import { WorkspaceOpeningSurface } from '@/components/loading/WorkspaceOpeningSurface'
import {
  isStandbyRenderer,
  onRendererInteractive,
  onWorkspaceSessionSeed,
} from '@/runtime/rendererLifecycle'

type RendererBootstrapProps = {
  application: ReactNode
}

const RendererBootstrap = ({ application }: RendererBootstrapProps) => {
  const standby = isStandbyRenderer()
  const [activated, setActivated] = useState(!standby)
  const [interactive, setInteractive] = useState(!standby)
  const applicationRef = useRef<HTMLDivElement>(null)
  useDesktopReadySignal()
  useWindowPresentationMotion(applicationRef, activated)

  useEffect(() => onWorkspaceSessionSeed(() => setActivated(true)), [])
  useEffect(() => onRendererInteractive(() => setInteractive(true)), [])

  return (
    <>
      {activated ? (
        <div className="h-full w-full" ref={applicationRef} data-window-application>
          {application}
        </div>
      ) : null}
      {standby && !interactive ? <WorkspaceOpeningSurface /> : null}
    </>
  )
}

export default RendererBootstrap
