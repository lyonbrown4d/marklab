import { useI18n } from '@/i18n/useI18n'
import type { RefObject } from 'react'

type MonacoVimStatusProps = {
  statusRef: RefObject<HTMLDivElement | null>
  error: string | null
}

export const MonacoVimStatus = ({ statusRef, error }: MonacoVimStatusProps) => {
  const { t } = useI18n()
  return (
    <>
      <div
        ref={statusRef}
        hidden
        aria-label={t('editor.vimStatusLabel')}
        className="flex min-h-7 shrink-0 items-center gap-3 border-t bg-muted/40 px-3 py-1 font-mono text-xs text-muted-foreground [&[hidden]]:hidden [&>span:first-child]:font-semibold [&>span:first-child]:text-foreground [&>span:last-child]:ml-auto [&_input]:min-w-32 [&_input]:bg-transparent [&_input]:text-foreground [&_input]:outline-none [&_input]:focus-visible:ring-1 [&_input]:focus-visible:ring-ring"
      />
      {error && (
        <div role="alert" className="shrink-0 px-3 py-1 text-xs text-destructive">
          {t('editor.vimLoadFailed')} {error}
        </div>
      )}
    </>
  )
}
