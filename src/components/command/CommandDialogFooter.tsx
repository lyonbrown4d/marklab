import { Keyboard } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { inferPlatformFromUserAgent } from '@/runtime/environment'

const Shortcut = ({ keys, label }: { keys: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    <kbd className="rounded border border-border/70 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">
      {keys}
    </kbd>
    <span>{label}</span>
  </span>
)

const CommandDialogFooter = () => {
  const { t } = useI18n()
  const modeKeys = inferPlatformFromUserAgent() === 'macos' ? '⌘ 1–3' : 'Ctrl 1–3'

  return (
    <footer className="flex min-h-11 items-center gap-4 border-t border-border/65 px-4 text-[11px] text-muted-foreground">
      <Keyboard className="mr-auto size-4" aria-hidden="true" />
      <Shortcut keys="↑↓" label={t('command.footer.select')} />
      <Shortcut keys="Enter" label={t('command.footer.open')} />
      <Shortcut keys={modeKeys} label={t('command.footer.mode')} />
      <Shortcut keys="Esc" label={t('command.footer.close')} />
    </footer>
  )
}

export default CommandDialogFooter
