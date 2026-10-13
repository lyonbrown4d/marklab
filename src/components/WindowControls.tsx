import { Copy, Minus, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
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

const WindowControls = ({
  platform,
  isWindows,
  isMaximized,
  setIsMaximized,
  getAppWindow,
}: WindowControlsProps) => {
  const { t } = useI18n()
  const minimizeLabel = t('actions.minimize')
  const maximizeRestoreLabel = isMaximized ? t('actions.restore') : t('actions.maximize')
  const closeLabel = t('actions.close')
  const captionButtonClassName = cn(
    'win-caption-btn',
    isWindows
      ? 'is-windows h-8 w-[46px] rounded-none text-inherit [&:hover]:bg-[color-mix(in_srgb,hsl(var(--foreground))_10%,transparent)] dark:[&:hover]:bg-[color-mix(in_srgb,hsl(var(--foreground))_10%,transparent)]'
      : 'size-8',
  )
  const closeButtonClassName = cn(
    'win-caption-btn win-caption-close',
    isWindows
      ? 'is-windows h-8 w-[46px] rounded-none text-inherit [&:hover]:bg-[#e81123] dark:[&:hover]:bg-[#e81123] [&:hover]:text-white'
      : 'size-8 hover:bg-destructive hover:text-destructive-foreground',
  )

  if ((platform !== 'windows' && platform !== 'linux') || !isDesktopRuntime()) {
    return null
  }

  return (
    <div
      className="window-controls flex items-center"
      role="group"
      aria-label={t('actions.windowControls')}
    >
      <Separator orientation="vertical" className="mr-1 h-6" />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={captionButtonClassName}
        onClick={async () => {
          const windowHandle = await getAppWindow()
          if (windowHandle) {
            await windowHandle.minimize()
          }
        }}
        aria-label={minimizeLabel}
        title={minimizeLabel}
      >
        {isWindows ? (
          <span
            className="win-caption-glyph font-[Segoe_MDL2_Assets,Segoe_Fluent_Icons,sans-serif] text-[10px] leading-none [transform:translateY(-0.5px)]"
            aria-hidden="true"
          >
            {'\uE921'}
          </span>
        ) : (
          <Minus aria-hidden="true" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={captionButtonClassName}
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
        aria-label={maximizeRestoreLabel}
        title={maximizeRestoreLabel}
      >
        {isWindows ? (
          <span
            className="win-caption-glyph font-[Segoe_MDL2_Assets,Segoe_Fluent_Icons,sans-serif] text-[10px] leading-none [transform:translateY(-0.5px)]"
            aria-hidden="true"
          >
            {isMaximized ? '\uE923' : '\uE922'}
          </span>
        ) : isMaximized ? (
          <Copy aria-hidden="true" />
        ) : (
          <Square aria-hidden="true" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={closeButtonClassName}
        onClick={async () => {
          const windowHandle = await getAppWindow()
          if (windowHandle) {
            await windowHandle.close()
          }
        }}
        aria-label={closeLabel}
        title={closeLabel}
      >
        {isWindows ? (
          <span
            className="win-caption-glyph font-[Segoe_MDL2_Assets,Segoe_Fluent_Icons,sans-serif] text-[10px] leading-none [transform:translateY(-0.5px)]"
            aria-hidden="true"
          >
            {'\uE8BB'}
          </span>
        ) : (
          <X aria-hidden="true" />
        )}
      </Button>
    </div>
  )
}

export default WindowControls
