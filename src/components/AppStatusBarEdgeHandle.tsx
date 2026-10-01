import { PanelBottomClose, PanelBottomOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'

type AppStatusBarEdgeHandleProps = {
  open: boolean
  onToggle: () => void
}

export const AppStatusBarEdgeHandle = ({ open, onToggle }: AppStatusBarEdgeHandleProps) => {
  const { t } = useI18n()
  const label = t(open ? 'statusBar.hide' : 'statusBar.show')
  const Icon = open ? PanelBottomClose : PanelBottomOpen

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-controls="app-status-bar"
      aria-expanded={open}
      aria-label={label}
      data-edge="bottom"
      data-state={open ? 'open' : 'closed'}
      className={`absolute left-1/2 z-40 h-5 w-14 -translate-x-1/2 rounded-b-none rounded-t-lg border border-b-0 border-border/60 bg-background/90 text-muted-foreground shadow-[0_-2px_10px_-6px_hsl(var(--foreground)/0.28)] backdrop-blur transition-[bottom,background-color,color] duration-[180ms] ease-out hover:bg-background hover:text-foreground motion-reduce:transition-none ${open ? 'bottom-7' : 'bottom-0'}`}
      onClick={onToggle}
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </Button>
  )
}
