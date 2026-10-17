import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DocumentLoadingLines } from '@/components/loading/DocumentLoadingLines'
import { getDesktopRuntime } from '@/runtime/desktop'
import type { WindowOpeningProgress } from '@/types/windowOpening'

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

export const WorkspaceOpeningSurface = () => {
  const copy = labels()
  const [progress, setProgress] = useState<WindowOpeningProgress>({
    stage: 'starting',
    workspacePath: '',
  })
  const [retrying, setRetrying] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const unlisten = getDesktopRuntime().opening.onProgress(setProgress)
    return () => {
      mounted.current = false
      unlisten()
    }
  }, [])

  const retry = async (): Promise<void> => {
    setRetrying(true)
    setProgress((current) => ({ ...current, error: undefined, stage: 'starting' }))
    try {
      const result = await getDesktopRuntime().opening.retry()
      if (!mounted.current) return
      if (result.ok) return
      setProgress((current) => ({
        ...current,
        error: result.error ?? copy.failed,
        stage: 'failed',
      }))
    } catch (error) {
      if (!mounted.current) return
      setProgress((current) => ({
        ...current,
        error: error instanceof Error ? error.message : copy.failed,
        stage: 'failed',
      }))
    } finally {
      if (mounted.current) setRetrying(false)
    }
  }

  const status = progress.error ?? copy[progress.stage]
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background p-8">
      <Card className="w-full max-w-xl py-6">
        <CardContent className="flex flex-col gap-4 px-6">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span
              aria-live={progress.stage === 'failed' ? 'assertive' : 'polite'}
              role={progress.stage === 'failed' ? 'alert' : 'status'}
              aria-busy={progress.stage !== 'failed'}
            >
              {status}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground" title={progress.workspacePath}>
            {progress.workspacePath || copy.starting}
          </div>
          {progress.stage === 'failed' ? null : <DocumentLoadingLines />}
          {progress.stage === 'failed' ? (
            <Button
              className="self-start"
              disabled={retrying}
              variant="outline"
              onClick={() => void retry()}
            >
              {copy.retry}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
