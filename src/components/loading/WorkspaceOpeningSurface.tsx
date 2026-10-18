import { useEffect, useRef, useState } from 'react'
import { SplashScreen } from '@/splash/SplashScreen'
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

export const WorkspaceOpeningSurface = ({ standalone = false }: { standalone?: boolean }) => {
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
  const surface = (
    <SplashScreen
      status={status}
      workspacePath={progress.workspacePath}
      failed={progress.stage === 'failed'}
      retrying={retrying}
      retryLabel={copy.retry}
      onRetry={() => void retry()}
    />
  )
  if (standalone) return surface
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-background p-8">
      <div className="h-[196px] w-[344px] max-w-full">{surface}</div>
    </div>
  )
}
