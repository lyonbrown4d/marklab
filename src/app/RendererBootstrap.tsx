import { useEffect, useState, type ReactNode } from 'react'

import { useDesktopReadySignal } from '@/app/useDesktopReadySignal'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import {
  isStandbyRenderer,
  onRendererInteractive,
  onWorkspaceSessionSeed,
} from '@/runtime/rendererLifecycle'
import { getElectronRuntime } from '@/runtime/electron'
import type { WindowOpeningProgress } from '@/types/windowOpening'

type RendererBootstrapProps = {
  application: ReactNode
}

const labels = () => {
  const chinese = navigator.language.toLowerCase().startsWith('zh')
  return chinese
    ? {
        failed: '工作区打开失败',
        indexing: '正在准备索引…',
        loading: '正在加载工作区…',
        retry: '重试',
        starting: '正在启动窗口…',
      }
    : {
        failed: 'Workspace failed to open',
        indexing: 'Preparing index…',
        loading: 'Loading workspace…',
        retry: 'Retry',
        starting: 'Starting window…',
      }
}

const RendererOpeningSurface = () => {
  const copy = labels()
  const [progress, setProgress] = useState<WindowOpeningProgress>({
    stage: 'starting',
    workspacePath: '',
  })
  const [retrying, setRetrying] = useState(false)

  useEffect(() => getElectronRuntime().opening.onProgress(setProgress), [])

  const retry = async (): Promise<void> => {
    setRetrying(true)
    setProgress((current) => ({ ...current, error: undefined, stage: 'starting' }))
    try {
      const result = await getElectronRuntime().opening.retry()
      if (result.ok) return
      setProgress((current) => ({
        ...current,
        error: result.error ?? copy.failed,
        stage: 'failed',
      }))
    } catch (error) {
      setProgress((current) => ({
        ...current,
        error: error instanceof Error ? error.message : copy.failed,
        stage: 'failed',
      }))
    } finally {
      setRetrying(false)
    }
  }

  const status = progress.error ?? copy[progress.stage]
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background p-8">
      <Card className="w-full max-w-xl py-6">
        <CardContent className="flex flex-col gap-4 px-6">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {progress.stage === 'failed' ? null : <Spinner className="size-4" />}
            <span aria-live="polite" role="status">
              {status}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground" title={progress.workspacePath}>
            {progress.workspacePath || copy.starting}
          </div>
          <div className="flex flex-col gap-3 pt-2" aria-hidden="true">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          {progress.stage === 'failed' ? (
            <Button className="self-start" disabled={retrying} onClick={() => void retry()}>
              {copy.retry}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

const RendererBootstrap = ({ application }: RendererBootstrapProps) => {
  const standby = isStandbyRenderer()
  const [activated, setActivated] = useState(!standby)
  const [interactive, setInteractive] = useState(!standby)
  useDesktopReadySignal()

  useEffect(() => onWorkspaceSessionSeed(() => setActivated(true)), [])
  useEffect(() => onRendererInteractive(() => setInteractive(true)), [])

  return (
    <>
      {activated ? application : null}
      {standby && !interactive ? <RendererOpeningSurface /> : null}
    </>
  )
}

export default RendererBootstrap
