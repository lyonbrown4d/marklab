import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useI18n } from '@/i18n/useI18n'
import { isDesktopRuntime } from '@/runtime/window'
import type { AppPlatform } from '@/services/appApi'

type WindowControlsProps = {
  platform: AppPlatform
  isWindows: boolean
  isMaximized: boolean
  setIsMaximized: (value: boolean) => void
  getAppWindow: () => Promise<{
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    unmaximize: () => Promise<void>
    isMaximized: () => Promise<boolean>
    close: () => Promise<void>
  } | null>
}

export default function WindowControls({
  platform,
  isWindows,
  isMaximized,
  setIsMaximized,
  getAppWindow,
}: WindowControlsProps) {
  const { t } = useI18n()

  if ((platform !== 'windows' && platform !== 'linux') || !isDesktopRuntime()) {
    return null
  }

  return (
    <div className="window-controls flex items-center">
      <Separator orientation="vertical" className="mr-1 h-6" />
      <Button
        variant="ghost"
        size="icon"
        className={`win-caption-btn ${isWindows ? 'is-windows' : 'h-8 w-8'}`}
        onClick={async () => {
          const windowHandle = await getAppWindow()
          if (windowHandle) {
            void windowHandle.minimize()
          }
        }}
        aria-label={t('actions.minimize')}
      >
        {isWindows ? (
          <span className="win-caption-glyph" aria-hidden>
            {'\uE921'}
          </span>
        ) : (
          <span aria-hidden>-</span>
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`win-caption-btn ${isWindows ? 'is-windows' : 'h-8 w-8'}`}
        onClick={async () => {
          const windowHandle = await getAppWindow()
          if (!windowHandle) return
          const next = !(await windowHandle.isMaximized())
          if (next) {
            await windowHandle.maximize()
          } else {
            await windowHandle.unmaximize()
          }
          setIsMaximized(next)
        }}
        aria-label={isMaximized ? t('actions.restore') : t('actions.maximize')}
      >
        {isWindows ? (
          <span className="win-caption-glyph" aria-hidden>
            {isMaximized ? '\uE923' : '\uE922'}
          </span>
        ) : (
          <span aria-hidden>{isMaximized ? '◱' : '□'}</span>
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`win-caption-btn win-caption-close ${isWindows ? 'is-windows' : 'h-8 w-8 hover:bg-destructive hover:text-destructive-foreground'}`}
        onClick={async () => {
          const windowHandle = await getAppWindow()
          if (windowHandle) {
            void windowHandle.close()
          }
        }}
        aria-label={t('actions.close')}
      >
        {isWindows ? (
          <span className="win-caption-glyph" aria-hidden>
            {'\uE8BB'}
          </span>
        ) : (
          <span aria-hidden>×</span>
        )}
      </Button>
    </div>
  )
}
