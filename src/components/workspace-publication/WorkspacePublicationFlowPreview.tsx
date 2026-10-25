import { useI18n } from '@/i18n/useI18n'
import type { PublicationPreviewPage } from '@/components/workspace-publication/workspacePublicationModel'

export const WorkspacePublicationFlowPreview = ({ pages }: { pages: PublicationPreviewPage[] }) => {
  const { t } = useI18n()
  return (
    <section
      className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-6"
      aria-label={t('workspaceExport.preview')}
    >
      <p className="mb-6 text-xs text-muted-foreground">{t('workspaceExport.flowPreview')}</p>
      <div className="mx-auto max-w-prose space-y-8">
        {pages.map((page, index) => (
          <article key={page.path ?? `${page.kind}-${index}`} className="space-y-3">
            <h2 className="text-lg font-semibold">{page.title}</h2>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
              {page.excerpt}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}
