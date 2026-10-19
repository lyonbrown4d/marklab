import { useRef } from 'react'
import AppAlert from '@/components/AppAlert'
import { Button } from '@/components/ui/button'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'
import { useHtmlPreview } from '@/components/previews/useHtmlPreview'
import { useI18n } from '@/i18n/useI18n'

type HtmlPreviewSurfaceProps = {
  source: string
  title: string
  presentation?: 'embedded' | 'full' | 'graph'
}

const HtmlPreviewSurface = ({ source, title, presentation = 'full' }: HtmlPreviewSurfaceProps) => {
  const { t } = useI18n()
  const ref = useRef<HTMLElement | null>(null)
  const query = useHtmlPreview(source, ref)
  return (
    <section
      ref={ref}
      className="flex min-h-0 w-full flex-col"
      aria-label={t('preview.htmlLabel', { name: title })}
    >
      <p className="mb-2 text-xs text-muted-foreground">{t('preview.htmlStatic')}</p>
      {!source.trim() ? (
        <p className="p-4 text-sm text-muted-foreground">{t('preview.sourceEmpty')}</p>
      ) : query.isError ? (
        <AppAlert role="alert" tone="destructive" title={t('preview.htmlFailed')}>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            {t('preview.spreadsheetRetry')}
          </Button>
        </AppAlert>
      ) : query.waiting || !query.data ? (
        <PreviewLoadingFallback label={t('preview.loading')} />
      ) : (
        <iframe
          title={t('preview.htmlLabel', { name: title })}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={query.data}
          className={`${presentation === 'embedded' ? 'h-[28rem]' : 'h-[calc(100vh-12rem)] min-h-80'} w-full border border-border bg-white`}
        />
      )}
    </section>
  )
}

export default HtmlPreviewSurface
