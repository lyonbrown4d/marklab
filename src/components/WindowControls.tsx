import { Copy, Minus, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { isDesktopRuntime } from '@/runtime/window'
import type { AppPlatform } from '@/services/appApi'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'
import { useWindowMaximizedState } from '@/components/titlebar/useWindowMaximizedState'

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
  const enabled = (platform === 'windows' || platform === 'linux') && isDesktopRuntime()
  useWindowMaximizedState(enabled, setIsMaximized)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const perform = (action: 'minimize' | 'maximize' | 'close') => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    void getAppWindow()
      .then(async (windowHandle) => {
        if (!mounted.current || !windowHandle) return
        if (action === 'minimize') await windowHandle.minimize()
        else if (action === 'close') await windowHandle.close()
        else {
          const maximized = await windowHandle.isMaximized()
          if (!mounted.current) return
          if (maximized) await windowHandle.unmaximize()
          else await windowHandle.maximize()
        }
      })
      .catch((error: unknown) => {
        rendererDiagnostics.warn('window.controls', 'native-action-failed', error)
        if (mounted.current)
          toast.error(
            t(action === 'close' ? 'editor.flushBuffersFailed' : 'context.actionFailed'),
            {
              description: error instanceof Error ? error.message : String(error),
            },
          )
      })
      .finally(() => {
        busy.current = false
        if (mounted.current) setPending(false)
      })
  }
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

  if (!enabled) {
    return null
  }

  return (
    <div
      className="window-controls flex items-center"
      role="group"
      aria-busy={pending}
      aria-label={t('actions.windowControls')}
    >
      <Separator orientation="vertical" className="mr-1 h-6" />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={captionButtonClassName}
        disabled={pending}
        onClick={() => perform('minimize')}
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
        disabled={pending}
        onClick={() => perform('maximize')}
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
        disabled={pending}
        onClick={() => perform('close')}
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
